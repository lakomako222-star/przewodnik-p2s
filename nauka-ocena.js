/**
 * Kreator oceny nauki agenta (karta-oceny.json) — checki, Dalej, eksport JSON.
 * Zapis: localStorage p2s.nauka.ocen.<id>. Eksport → pobranie pliku do e2e-projekt/nauka-modele/ocen/
 * Domyślna seria: OCENA (odmowy / FAIL harnessu / nieocenione do etykiety człowieka).
 * Karta ma być czytelna na telefonie: model, kontekst odmowy, co zrobić.
 */
(function (global) {
  'use strict';

  var LS_PREF = 'p2s.nauka.ocen.';
  var LS_IDX = 'p2s.nauka.ocena.idx';
  var LS_SERIA = 'p2s.nauka.ocena.seria.v2';
  var DOMYSLNA_SERIA = 'OCENA';

  var POSTAWY = [
    { n: 1, t: '1 — Dlaczego istniejące zawodzi' },
    { n: 2, t: '2 — Co człowiek naprawdę robi' },
    { n: 3, t: '3 — Druga osoba / dodatkowa czynność' },
    { n: 4, t: '4 — Oś trudności / rozmiaru' },
    { n: 5, t: '5 — Co FDM umie (nie ze sklepu)' },
    { n: 6, t: '6 — Najbardziej ryzykowny pomysł' }
  ];

  var SZYBKIE = [
    { id: 'brak_p0', t: 'Brak punktu 0 (co się fizycznie dzieje)' },
    { id: 'nie_pytal', t: 'Nie pytał przed [[RYSUJ]]' },
    { id: 'cienkie', t: 'Cienkie ścianki bez ostrzeżenia' },
    { id: 'sufit', t: 'Poza sufit 256 mm / nie podzielił' },
    { id: 'kopia', t: 'Kopia CAD / za mało własnej siatki' },
    { id: 'przerob_milczy', t: 'Przerób milczy (brak kodu odmowy)' },
    { id: 'za_duzo_czesci', t: 'Za dużo części (>8)' },
    { id: 'project_settings', t: 'Polega na project_settings obcego 3MF' }
  ];

  var ODM_ETYKIETY = [
    { id: 'sluszna', t: 'Słuszna' },
    { id: 'falszywa', t: 'Fałszywa' },
    { id: 'niepewne', t: 'Niepewne' }
  ];

  /** Plain-Polish gloss for detektor odmowa codes. */
  var ODM_GLOSS = {
    BLAD_POMIARU: 'Detektor nie zmierzył cechy (gniazdo/czop/…); oceń czy odmowa słuszna.',
    'BŁĄD_POMIARU': 'Detektor nie zmierzył cechy (gniazdo/czop/…); oceń czy odmowa słuszna.',
    NIE_WALEC: 'Przekrój nie jest gładkim walcem (zmienia się wzdłuż osi) — nie edytuj jak zwykłego otworu.',
    GWINT_LUB_NIEWALEC: 'Wygląda na gwint albo niewalec — nie wpisuj jednej średnicy; zmierz gwint / użyj przepustu.',
    USZKODZONY: 'Plik/siatka wygląda na uszkodzoną albo nieczytelną dla detektora.',
    BLAD: 'Ogólny błąd detektora / pipeline — sprawdź notatkę i kody harnessu.'
  };

  var HARNESS_ZNACZENIE = {
    ok: 'Harness OK — automatyczne checki przeszły.',
    warn: 'Harness WARN — coś podejrzanego, ale nie twarde FAIL.',
    fail: 'Harness FAIL — automat uznał model/plik za zły (jednostki, gabaryt, siatka…).'
  };

  var stan = {
    pack: null,
    kolejka: [],
    i: 0,
    biezacy: null,
    szybkie: {}
  };

  function $(id) { return document.getElementById(id); }

  function czytajOcene(id) {
    try {
      var raw = localStorage.getItem(LS_PREF + id);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function zapiszOcene(id, obj) {
    try {
      localStorage.setItem(LS_PREF + id, JSON.stringify(obj));
    } catch (e) { /* pełny LS */ }
  }

  function oceniona(o) {
    return !!(o && o.werdykt && o.werdykt !== 'oczekuje');
  }

  function listaOdmow(w) {
    if (!w || !w.przerob_odmowy) return [];
    return String(w.przerob_odmowy).split(/[,;\s]+/).map(function (s) {
      return s.trim();
    }).filter(Boolean);
  }

  function maBladPomiaru(w) {
    var odm = listaOdmow(w);
    return odm.indexOf('BLAD_POMIARU') >= 0 || odm.indexOf('BŁĄD_POMIARU') >= 0;
  }

  function techNorm(w) {
    return String((w && w.werdykt_techniczny) || '').toLowerCase();
  }

  function doOceny(w) {
    var t = techNorm(w);
    if (t === 'fail' || t === 'warn') return true;
    if (listaOdmow(w).length) return true;
    return false;
  }

  function escapHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function nazwaPliku(w) {
    var n = String((w && w.nazwa) || '').trim();
    if (!n) return '—';
    n = n.replace(/\\/g, '/');
    var slash = n.lastIndexOf('/');
    if (slash >= 0) n = n.slice(slash + 1);
    return n || '—';
  }

  function rozszerzeniePliku(nazwa) {
    var m = String(nazwa || '').match(/\.([a-z0-9]{2,5})$/i);
    return m ? ('.' + m[1].toLowerCase()) : '';
  }

  function kategoriaZWpisu(w) {
    var blob = [(w && w.notatka) || '', (w && w.tekst) || '', (w && w.zrodlo) || ''].join(' ');
    var m = blob.match(/\bkat:\s*([A-Za-z0-9_/-]+)/i);
    if (m) return m[1].toUpperCase();
    var id = String((w && w.id) || '');
    if (id.indexOf('LIB-') === 0) return 'LIB';
    if (id.indexOf('TRE-') === 0) return 'TRE';
    if (id.indexOf('P3D-') === 0) return 'P3D';
    if (id.indexOf('GOLD-') === 0) return 'GOLD';
    return '';
  }

  function skrotZrodla(w) {
    var z = String((w && w.zrodlo) || '').trim();
    if (!z) return '';
    if (/^paczka trening/i.test(z)) return z;
    z = z.replace(/\\/g, '/');
    var parts = z.split('/').filter(Boolean);
    if (parts.length <= 2) return z;
    return '…/' + parts.slice(-2).join('/');
  }

  function glossOdmowy(kod) {
    var k = String(kod || '').trim();
    if (ODM_GLOSS[k]) return ODM_GLOSS[k];
    return 'Kod odmowy detektora — oceń, czy decyzja pipeline’u była słuszna.';
  }

  function znaczenieHarness(t) {
    if (!t) return 'Brak werdyktu harnessu w paczce.';
    return HARNESS_ZNACZENIE[t] || ('Harness: ' + t);
  }

  /** Jedno zdanie: co człowiek ma zrobić na tej karcie. */
  function instrukcjaKarty(w) {
    var odm = listaOdmow(w);
    var t = techNorm(w);
    if (maBladPomiaru(w)) {
      return 'Czy ta odmowa pomiaru jest słuszna? (słuszna / fałszywa / niepewne)';
    }
    if (odm.length) {
      return 'Czy ta odmowa detektora jest słuszna? (słuszna / fałszywa / niepewne)';
    }
    if (t === 'fail') {
      return 'Harness FAIL — oceń czy agent/pipeline powinien to złapać';
    }
    if (t === 'warn') {
      return 'Harness WARN — oceń czy ostrzeżenie ma sens i czy agent powinien zareagować';
    }
    return 'Oceń odpowiedź agenta (checki poniżej), potem OK / FAIL.';
  }

  function podsumowanieCech(w) {
    /* Paczka nie ma osobnego pola cechy[] — zbieramy z kody/problemy jeśli coś jest. */
    var bits = [];
    if (w && Array.isArray(w.kody) && w.kody.length) {
      bits.push('kody harness: ' + w.kody.join(', '));
    }
    if (w && Array.isArray(w.problemy) && w.problemy.length) {
      bits.push('problemy: ' + w.problemy.slice(0, 3).join('; '));
    }
    if (w && Array.isArray(w.ostrzezenia) && w.ostrzezenia.length) {
      bits.push('ostrzeżenia: ' + w.ostrzezenia.slice(0, 2).join('; '));
    }
    return bits;
  }

  function domyslnaOcena(w) {
    var odm = listaOdmow(w);
    return {
      id: w.id,
      werdykt: 'oczekuje',
      punkt0_zdanie: null,
      pytania_agenta: null,
      klasa_DOM_ZABAWKA: null,
      postawy_1_6: [],
      szukaj_przed_rysuj: null,
      podpory_w_SPEC: null,
      sufit_256: w.miesci_na_plycie === false ? false : null,
      czesci_8: (w.n_czesci != null && w.n_czesci > 8) ? false : null,
      wynik_3mf_jedna_bryla: (w.n_czesci === 1) ? true : null,
      przerob_odmowa_kod: odm.length ? true : null,
      odmowa_etykieta: null,
      notatka: null,
      when: new Date().toISOString()
    };
  }

  /** Eksport zgodny z karta-oceny.json (+ when praktyczne; import kopiuje plik 1:1). */
  function doEksportu(oc) {
    return {
      id: oc.id,
      punkt0_zdanie: oc.punkt0_zdanie != null ? oc.punkt0_zdanie : null,
      pytania_agenta: oc.pytania_agenta != null ? oc.pytania_agenta : null,
      klasa_DOM_ZABAWKA: oc.klasa_DOM_ZABAWKA != null ? oc.klasa_DOM_ZABAWKA : null,
      postawy_1_6: Array.isArray(oc.postawy_1_6) ? oc.postawy_1_6 : [],
      szukaj_przed_rysuj: oc.szukaj_przed_rysuj != null ? oc.szukaj_przed_rysuj : null,
      podpory_w_SPEC: oc.podpory_w_SPEC != null ? oc.podpory_w_SPEC : null,
      sufit_256: oc.sufit_256 != null ? oc.sufit_256 : null,
      czesci_8: oc.czesci_8 != null ? oc.czesci_8 : null,
      wynik_3mf_jedna_bryla: oc.wynik_3mf_jedna_bryla != null ? oc.wynik_3mf_jedna_bryla : null,
      przerob_odmowa_kod: oc.przerob_odmowa_kod != null ? oc.przerob_odmowa_kod : null,
      odmowa_etykieta: oc.odmowa_etykieta != null ? oc.odmowa_etykieta : null,
      werdykt: oc.werdykt || 'oczekuje',
      notatka: oc.notatka != null ? oc.notatka : null,
      when: oc.when || new Date().toISOString()
    };
  }

  function filtrujKolejke() {
    if (!stan.pack || !stan.pack.wpisy) return [];
    var seria = ($('naukaSeria') && $('naukaSeria').value) || DOMYSLNA_SERIA;
    var tylko = $('naukaTylkoNowe') && $('naukaTylkoNowe').checked;
    var lista = stan.pack.wpisy.filter(function (w) {
      if (seria === 'OCENA') {
        if (!doOceny(w)) return false;
      } else if (seria === 'ODMOWY') {
        if (!listaOdmow(w).length) return false;
      } else if (seria === 'TRE' && w.id.indexOf('TRE-') !== 0) return false;
      else if (seria === 'LIB' && w.id.indexOf('LIB-') !== 0) return false;
      else if (seria === 'P3D' && w.id.indexOf('P3D-') !== 0) return false;
      else if (seria === 'GOLD' && w.id.indexOf('GOLD-') !== 0) return false;
      else if (seria === 'MOJE') {
        if (w.id.indexOf('P3D-') !== 0 && w.id.indexOf('GOLD-') !== 0 && w.id !== 'O-01') return false;
      } else if (seria === 'ALL') { /* wszystkie */ }
      if (tylko) {
        if (oceniona(czytajOcene(w.id))) return false;
      }
      return true;
    });
    var priorytet = function (w) {
      var id = w.id;
      var t = techNorm(w);
      var blad = maBladPomiaru(w);
      var odm = listaOdmow(w).length > 0;
      var baza = 0;
      if (seria === 'OCENA' || seria === 'ODMOWY') {
        if (t === 'fail') baza = 0;
        else if (blad) baza = 1000;
        else if (t === 'warn') baza = 2000;
        else if (odm) baza = 3000;
        else baza = 4000;
      } else {
        if (id.indexOf('GOLD-') === 0) baza = 0;
        else if (id === 'O-01') baza = 1;
        else if (id.indexOf('P3D-') === 0) {
          var n = parseInt(id.replace(/^P3D-/, ''), 10);
          baza = 100 + (isFinite(n) ? n : 999);
        } else if (id.indexOf('TRE-') === 0) {
          var tr = parseInt(id.replace(/^TRE-/, ''), 10);
          baza = 10000 + (isFinite(tr) ? tr : 999);
        } else if (id.indexOf('LIB-') === 0) {
          var l = parseInt(id.replace(/^LIB-/, ''), 10);
          baza = 20000 + (isFinite(l) ? l : 999);
        } else baza = 50000;
      }
      return baza;
    };
    lista.sort(function (a, b) {
      var pa = priorytet(a);
      var pb = priorytet(b);
      if (pa !== pb) return pa - pb;
      return a.id.localeCompare(b.id);
    });
    return lista;
  }

  function policzOcenioneWKolejce(kolejka) {
    var n = 0;
    kolejka.forEach(function (w) {
      if (oceniona(czytajOcene(w.id))) n += 1;
    });
    return n;
  }

  function odswiezKolejke() {
    stan.kolejka = filtrujKolejke();
    var saved = parseInt(localStorage.getItem(LS_IDX) || '0', 10);
    if (!isFinite(saved) || saved < 0) saved = 0;
    if (saved >= stan.kolejka.length) saved = 0;
    stan.i = saved;
    if (stan.pack && stan.pack.wpisy) {
      var stat = $('naukaStat');
      if (stat) {
        var p3d = 0, tre = 0, lib = 0, gold = 0, moje = 0, odm = 0, failWarn = 0, blad = 0;
        stan.pack.wpisy.forEach(function (w) {
          if (w.id.indexOf('P3D-') === 0) p3d += 1;
          else if (w.id.indexOf('TRE-') === 0) tre += 1;
          else if (w.id.indexOf('LIB-') === 0) lib += 1;
          else if (w.id.indexOf('GOLD-') === 0) gold += 1;
          if (w.id.indexOf('P3D-') === 0 || w.id.indexOf('GOLD-') === 0 || w.id === 'O-01') moje += 1;
          if (listaOdmow(w).length) odm += 1;
          if (maBladPomiaru(w)) blad += 1;
          var t = techNorm(w);
          if (t === 'fail' || t === 'warn') failWarn += 1;
        });
        stat.textContent =
          'W bazie: ' + p3d + ' P3D · ' + gold + ' GOLD · ' + tre + ' TRE · ' + lib + ' LIB · ' +
          odm + ' z odmową (' + blad + ' BLAD_POMIARU) · ' + failWarn + ' FAIL/WARN harness. ' +
          'Seria „Do oceny” = odmowy + FAIL/WARN.';
      }
    }
    pokazBiezacy();
  }

  function badgeTech(w) {
    var t = techNorm(w);
    if (!t) return '<span class="nauka-badge nauka-warn">harness: —</span>';
    var cls = t === 'ok' ? 'ok' : (t === 'fail' ? 'fail' : 'warn');
    return '<span class="nauka-badge nauka-' + cls + '">harness: ' + escapHtml(t).toUpperCase() + '</span>';
  }

  function blokModelu(w) {
    var plik = nazwaPliku(w);
    var kat = kategoriaZWpisu(w);
    var ext = rozszerzeniePliku(plik);
    var zrodlo = skrotZrodla(w);
    var meta = [];
    if (kat) meta.push('<span class="nauka-kat">' + escapHtml(kat) + '</span>');
    if (ext) meta.push('<span class="nauka-meta">' + escapHtml(ext) + '</span>');
    if (w.gabaryt) meta.push('<span class="nauka-meta">' + escapHtml(w.gabaryt) + '</span>');
    if (w.n_czesci != null) meta.push('<span class="nauka-meta">' + w.n_czesci + ' części</span>');
    if (w.tri != null) meta.push('<span class="nauka-meta">' + w.tri + ' tri</span>');

    var html = '<div class="nauka-model">';
    html += '<div class="nauka-tytul">' + escapHtml(plik) + '</div>';
    html += '<div class="nauka-id-sek">' + escapHtml(w.id) + '</div>';
    if (meta.length) html += '<div class="nauka-harness">' + meta.join(' ') + '</div>';
    if (zrodlo) html += '<div class="nauka-zrodlo">' + escapHtml(zrodlo) + '</div>';
    html += '</div>';
    return html;
  }

  function blokHarnessWyjasnienie(w) {
    var t = techNorm(w);
    var html = '<div class="nauka-harness-wyjasnij">';
    html += badgeTech(w);
    html += '<p class="nauka-gloss">' + escapHtml(znaczenieHarness(t)) + '</p>';
    var cechy = podsumowanieCech(w);
    if (cechy.length) {
      html += '<ul class="nauka-auto">';
      cechy.forEach(function (a) { html += '<li>' + escapHtml(a) + '</li>'; });
      html += '</ul>';
    }
    html += '</div>';
    return html;
  }

  function blokOdmowy(w, oc) {
    var odm = listaOdmow(w);
    if (!odm.length) return '';
    var html = '<div class="nauka-sekcja nauka-odmowa-box">';
    html += '<p class="th"><strong>Odmowa detektora</strong></p>';
    html += '<ul class="nauka-odm-lista">';
    odm.forEach(function (kod) {
      html += '<li><code>' + escapHtml(kod) + '</code> — ' + escapHtml(glossOdmowy(kod)) + '</li>';
    });
    html += '</ul>';
    html += '<p class="th">Oznacz etykietę:</p>';
    html += '<div class="row nauka-odm-tagi" id="naukaOdmEtykiety">';
    ODM_ETYKIETY.forEach(function (e) {
      var on = oc.odmowa_etykieta === e.id;
      html += '<button type="button" class="nauka-btn nauka-tag' + (on ? ' on' : '') + '" data-odm-etykieta="' + e.id + '">' + e.t + '</button>';
    });
    html += '</div></div>';
    return html;
  }

  function listaAuto(w) {
    var bits = [];
    if (w.miesci_na_plycie === false) bits.push('>256 mm (nie mieści się na płycie)');
    if (w.notatka && !czytajOcene(w.id)) bits.push('manifest: ' + w.notatka);
    return bits;
  }

  function zbudujFormularz(w, oc) {
    var auto = listaAuto(w);
    var html = '';
    html += '<div class="nauka-instrukcja">' + escapHtml(instrukcjaKarty(w)) + '</div>';
    html += blokModelu(w);
    html += blokHarnessWyjasnienie(w);
    if (auto.length) {
      html += '<ul class="nauka-auto">';
      auto.forEach(function (a) { html += '<li>' + escapHtml(a) + '</li>'; });
      html += '</ul>';
    }
    html += blokOdmowy(w, oc);
    html += '<p class="th">Po rozmowie z agentem Projekt/Przerób — zaznacz checki. Na końcu pobierz JSON do folderu <code>ocen/</code>.</p>';

    html += '<div class="nauka-sekcja"><div class="t0-lista">';
    html += '<div class="t0-wiersz"><label><input type="checkbox" id="naukaP0" ' + (oc.punkt0_zdanie ? 'checked' : '') + '><span>Punkt 0 — agent powiedział jednym zdaniem co się fizycznie dzieje</span></label></div>';
    html += '<div class="t0-wiersz"><label><input type="checkbox" id="naukaPyt" ' + (oc.pytania_agenta === true ? 'checked' : '') + '><span>Pytał zanim budował (nie yes-man)</span></label></div>';
    html += '</div></div>';
    html += '<div class="nauka-sekcja"><p class="th">Postawy SYS_TALK (zaznacz które realnie zastosował):</p><div class="t0-lista" id="naukaPostawy">';
    POSTAWY.forEach(function (p) {
      var on = oc.postawy_1_6 && oc.postawy_1_6.indexOf(p.n) >= 0;
      html += '<div class="t0-wiersz"><label><input type="checkbox" data-postawa="' + p.n + '" ' + (on ? 'checked' : '') + '><span>' + p.t + '</span></label></div>';
    });
    html += '</div></div>';
    html += '<div class="nauka-sekcja"><p class="th">Szybkie problemy (dopisują notatkę):</p><div class="t0-lista" id="naukaSzybkie">';
    SZYBKIE.forEach(function (s) {
      html += '<div class="t0-wiersz"><label><input type="checkbox" data-szybki="' + s.id + '"><span>' + s.t + '</span></label></div>';
    });
    html += '</div></div>';
    html += '<div class="nauka-sekcja"><label>Notatka własnymi słowami<textarea id="naukaNotatka" rows="3" placeholder="np. fałszywy BLAD_POMIARU — otwór realny, detektor się myli…">' + escapHtml(oc.notatka || '') + '</textarea></label></div>';
    html += '<div class="nauka-sekcja row nauka-werdykt">';
    html += '<button type="button" class="nauka-btn ok" id="naukaOk">OK — gotowe</button>';
    html += '<button type="button" class="nauka-btn fail" id="naukaFail">FAIL — do poprawy</button>';
    html += '<button type="button" class="nauka-btn" id="naukaPomin">Pomiń (oczekuje)</button>';
    html += '</div>';
    html += '<div class="nauka-sekcja row">';
    html += '<button type="button" id="naukaWstecz">← Wstecz</button>';
    html += '<button type="button" id="naukaDalej">Dalej →</button>';
    html += '<button type="button" id="naukaPobierz">Pobierz ten JSON</button>';
    html += '</div>';
    return html;
  }

  function zFormularza(w, werdykt) {
    var oc = czytajOcene(w.id) || domyslnaOcena(w);
    oc.werdykt = werdykt || oc.werdykt;
    oc.when = new Date().toISOString();
    var p0 = $('naukaP0');
    var pyt = $('naukaPyt');
    if (p0 && p0.checked) oc.punkt0_zdanie = oc.punkt0_zdanie || '(zaznaczone w kreatorze — uzupełnij cytat jeśli chcesz)';
    else if (p0 && !p0.checked) oc.punkt0_zdanie = null;
    if (pyt) oc.pytania_agenta = !!pyt.checked;
    oc.postawy_1_6 = [];
    var root = $('naukaPostawy');
    if (root) {
      root.querySelectorAll('input[data-postawa]:checked').forEach(function (inp) {
        oc.postawy_1_6.push(parseInt(inp.getAttribute('data-postawa'), 10));
      });
    }
    var odmRoot = $('naukaOdmEtykiety');
    if (odmRoot) {
      var onBtn = odmRoot.querySelector('.nauka-tag.on');
      oc.odmowa_etykieta = onBtn ? onBtn.getAttribute('data-odm-etykieta') : (oc.odmowa_etykieta || null);
    } else if (!listaOdmow(w).length) {
      oc.odmowa_etykieta = null;
    }
    if (listaOdmow(w).length) oc.przerob_odmowa_kod = true;
    var not = ($('naukaNotatka') && $('naukaNotatka').value || '').trim();
    var dopiski = [];
    var szyb = $('naukaSzybkie');
    if (szyb) {
      szyb.querySelectorAll('input[data-szybki]:checked').forEach(function (inp) {
        var id = inp.getAttribute('data-szybki');
        var s = SZYBKIE.filter(function (x) { return x.id === id; })[0];
        if (s) dopiski.push(s.t);
      });
    }
    if (dopiski.length) not = (not ? not + '; ' : '') + dopiski.join('; ');
    oc.notatka = not || null;
    return oc;
  }

  function pobierzJson(id, obj) {
    var blob = new Blob([JSON.stringify(doEksportu(obj), null, 2) + '\n'], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = id + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
  }

  function pokazBiezacy() {
    var postep = $('naukaPostep');
    var karta = $('naukaOcenaKarta');
    if (!karta) return;
    if (!stan.kolejka.length) {
      karta.innerHTML = '<p class="tout">Brak wpisów w tej serii (albo wszystkie już ocenione). Zmień filtr u góry.</p>';
      if (postep) postep.textContent = '0 ocenionych / 0 w kolejce';
      return;
    }
    var w = stan.kolejka[stan.i];
    stan.biezacy = w;
    var ocenionych = policzOcenioneWKolejce(stan.kolejka);
    if (postep) {
      postep.textContent =
        (stan.i + 1) + ' / ' + stan.kolejka.length + ' · ' + nazwaPliku(w) + ' (' + w.id + ')' +
        ' · ocenionych: ' + ocenionych + ' / ' + stan.kolejka.length;
    }
    var oc = czytajOcene(w.id) || domyslnaOcena(w);
    karta.innerHTML = zbudujFormularz(w, oc);
    localStorage.setItem(LS_IDX, String(stan.i));
    var ok = $('naukaOk');
    var fail = $('naukaFail');
    var pomin = $('naukaPomin');
    var dalej = $('naukaDalej');
    var wstecz = $('naukaWstecz');
    var pob = $('naukaPobierz');
    var odmRoot = $('naukaOdmEtykiety');
    if (odmRoot) {
      odmRoot.querySelectorAll('[data-odm-etykieta]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          odmRoot.querySelectorAll('.nauka-tag').forEach(function (b) { b.classList.remove('on'); });
          btn.classList.add('on');
        });
      });
    }
    function zapiszIdz(werdykt) {
      zapiszOcene(w.id, zFormularza(w, werdykt));
      if (stan.i < stan.kolejka.length - 1) {
        stan.i += 1;
        pokazBiezacy();
      } else {
        var tylko = $('naukaTylkoNowe') && $('naukaTylkoNowe').checked;
        if (tylko) {
          odswiezKolejke();
        } else {
          pokazBiezacy();
        }
        var st = $('naukaStan');
        if (st && stan.i >= stan.kolejka.length - 1 && !tylko) {
          st.textContent = 'Koniec serii — pobierz JSON-y przyciskiem poniżej.';
        }
      }
    }
    if (ok) ok.addEventListener('click', function () { zapiszIdz('ok'); });
    if (fail) fail.addEventListener('click', function () { zapiszIdz('fail'); });
    if (pomin) pomin.addEventListener('click', function () { zapiszIdz('oczekuje'); });
    if (dalej) dalej.addEventListener('click', function () {
      zapiszOcene(w.id, zFormularza(w, oc.werdykt || 'oczekuje'));
      if (stan.i < stan.kolejka.length - 1) { stan.i++; pokazBiezacy(); }
    });
    if (wstecz) wstecz.addEventListener('click', function () {
      zapiszOcene(w.id, zFormularza(w, oc.werdykt || 'oczekuje'));
      if (stan.i > 0) { stan.i--; pokazBiezacy(); }
    });
    if (pob) pob.addEventListener('click', function () {
      pobierzJson(w.id, zFormularza(w, oc.werdykt || 'oczekuje'));
    });
  }

  function eksportWszystkie() {
    if (!stan.pack || !stan.pack.wpisy) return;
    var n = 0;
    stan.pack.wpisy.forEach(function (w) {
      var o = czytajOcene(w.id);
      if (!oceniona(o)) return;
      setTimeout(function () { pobierzJson(w.id, o); }, n * 300);
      n += 1;
    });
    var st = $('naukaStan');
    if (st) {
      st.textContent = n
        ? ('Pobieram ' + n + ' ukończonych ocen (OK/FAIL) — zapisz do e2e-projekt/nauka-modele/ocen/, potem: node _import-ocen-pobrane.mjs')
        : 'Brak ukończonych ocen (OK/FAIL) w tej przeglądarce.';
    }
  }

  function bind() {
    var root = $('tNaukaOcena');
    if (!root || root.getAttribute('data-bound') === '1') return;
    root.setAttribute('data-bound', '1');
    fetch('./nauka-pack.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (p) {
      stan.pack = p;
      var seria = $('naukaSeria');
      if (seria) {
        var savedSeria = localStorage.getItem(LS_SERIA);
        var val = savedSeria || DOMYSLNA_SERIA;
        if (![].some.call(seria.options, function (o) { return o.value === val; })) val = DOMYSLNA_SERIA;
        seria.value = val;
        localStorage.setItem(LS_SERIA, val);
        seria.addEventListener('change', function () {
          localStorage.setItem(LS_SERIA, seria.value);
          stan.i = 0;
          localStorage.setItem(LS_IDX, '0');
          odswiezKolejke();
        });
      }
      var tylko = $('naukaTylkoNowe');
      if (tylko) tylko.addEventListener('change', function () { stan.i = 0; odswiezKolejke(); });
      var ex = $('naukaEksportAll');
      if (ex) ex.addEventListener('click', eksportWszystkie);
      odswiezKolejke();
    }).catch(function () {
      var k = $('naukaOcenaKarta');
      if (k) k.innerHTML = '<p class="tout fail">Brak nauka-pack.json — uruchom build PWA.</p>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  global.__p2sNaukaOcena = {
    odswiez: odswiezKolejke,
    czytaj: czytajOcene,
    doOceny: doOceny,
    listaOdmow: listaOdmow,
    instrukcjaKarty: instrukcjaKarty,
    nazwaPliku: nazwaPliku
  };
})(typeof window !== 'undefined' ? window : global);
