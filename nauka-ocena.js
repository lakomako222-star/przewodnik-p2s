/**
 * Kreator oceny nauki agenta (karta-oceny.json) — checki, Dalej, eksport JSON.
 * Zapis: localStorage p2s.nauka.ocen.<id>. Eksport → e2e-projekt/nauka-modele/ocen/
 * Karta = przegląd jednego projektu druku (tytuł, opis, co system uważa, Twoja ocena).
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

  /** Mapowanie prostych przycisków → odmowa_etykieta + werdykt (karta-oceny.json). */
  var OCENA_PROSTA = [
    {
      id: 'zgoda',
      t: 'Zgadzam się z systemem',
      hint: 'Odmowa / FAIL słuszne',
      odmowa_etykieta: 'sluszna',
      werdykt: 'ok'
    },
    {
      id: 'myli',
      t: 'System się myli',
      hint: 'Fałszywa odmowa / niepotrzebny FAIL',
      odmowa_etykieta: 'falszywa',
      werdykt: 'fail'
    },
    {
      id: 'niepewn',
      t: 'Nie jestem pewien',
      hint: 'Zostawiam do późniejszej decyzji',
      odmowa_etykieta: 'niepewne',
      werdykt: 'oczekuje'
    }
  ];

  var ODM_GLOSS = {
    BLAD_POMIARU: 'Detektor znalazł coś jak otwór/gniazdo, ale nie umiał zmierzyć — odmówił',
    'BŁĄD_POMIARU': 'Detektor znalazł coś jak otwór/gniazdo, ale nie umiał zmierzyć — odmówił',
    NIE_WALEC: 'Przekrój nie jest gładkim walcem — nie edytuj jak zwykłego otworu',
    GWINT_LUB_NIEWALEC: 'Wygląda na gwint albo niewalec — nie wpisuj jednej średnicy',
    USZKODZONY: 'Plik/siatka wygląda na uszkodzoną albo nieczytelną',
    BLAD: 'Ogólny błąd detektora / pipeline'
  };

  var KAT_PL = {
    MECHANIKA: 'Mechanika',
    TOYS: 'Zabawki',
    DIY_HOME: 'DIY / dom',
    LIB: 'LIB',
    TRE: 'TRE',
    P3D: 'P3D',
    GOLD: 'GOLD'
  };

  var stan = {
    pack: null,
    kolejka: [],
    i: 0,
    biezacy: null
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

  /** Ma wybór człowieka (w tym „niepewne” z etykietą). */
  function maWyborCzlowieka(o) {
    return !!(o && (oceniona(o) || o.odmowa_etykieta));
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

  function tytulCzytelny(w) {
    if (w && w.tytul_czytelny) return String(w.tytul_czytelny);
    var n = nazwaPliku(w);
    n = n.replace(/\.(3mf|stl|obj|pdf)$/i, '');
    n = n.replace(/_\d{5,}$/g, '').replace(/\+/g, ' ').replace(/_/g, ' ');
    return n.trim() || (w && w.id) || '—';
  }

  function kategoriaZWpisu(w) {
    if (w && w.kategoria) return String(w.kategoria).toUpperCase();
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

  function formatPliku(w) {
    if (w && w.format) return String(w.format).toUpperCase();
    var m = String(nazwaPliku(w) || '').match(/\.([a-z0-9]{2,5})$/i);
    return m ? m[1].toUpperCase() : '';
  }

  function glossOdmowy(kod) {
    var k = String(kod || '').trim();
    if (ODM_GLOSS[k]) return ODM_GLOSS[k];
    return 'Kod odmowy detektora — oceń, czy decyzja była słuszna';
  }

  /** 2–4 bullets po polsku: z packa albo fallback z kodów. */
  function bulletsSystem(w) {
    if (w && Array.isArray(w.werdykt_po_ludzku) && w.werdykt_po_ludzku.length) {
      return w.werdykt_po_ludzku.slice(0, 4).map(String);
    }
    var bits = [];
    var odm = listaOdmow(w);
    odm.forEach(function (kod) {
      bits.push(glossOdmowy(kod) + ' (' + kod + ').');
    });
    var t = techNorm(w);
    if (t === 'fail') bits.push('Harness: FAIL — automat uznał model/plik za zły.');
    else if (t === 'warn') bits.push('Harness: WARN — coś podejrzanego, ale nie twarde FAIL.');
    if (w && Array.isArray(w.problemy) && w.problemy.length) {
      bits.push('Problem: ' + String(w.problemy[0]).slice(0, 120));
    }
    if (w && Array.isArray(w.ostrzezenia) && w.ostrzezenia.length && bits.length < 4) {
      bits.push(String(w.ostrzezenia[0]).replace(/^[^:]+:\s*/, '').replace(/^"|"$/g, '').slice(0, 140));
    }
    if (!bits.length) bits.push('Brak automatycznej odmowy ani FAIL w paczce — oceń samodzielnie.');
    return bits.slice(0, 4);
  }

  function opisModelu(w) {
    if (w && w.opis_krotki) return String(w.opis_krotki);
    var tyt = tytulCzytelny(w);
    var kat = kategoriaZWpisu(w);
    var katPl = KAT_PL[kat] || kat;
    var s = 'Wygląda na: ' + tyt;
    if (katPl) s += ' — kategoria ' + katPl.toLowerCase();
    s += '.';
    if (w && w.sylwetka) s += ' ' + w.sylwetka + '.';
    else if (w && w.gabaryt) s += ' Gabaryt: ' + w.gabaryt + '.';
    return s;
  }

  function aktywnaOcenaProsta(oc) {
    if (!oc) return null;
    for (var i = 0; i < OCENA_PROSTA.length; i++) {
      var p = OCENA_PROSTA[i];
      if (oc.odmowa_etykieta === p.odmowa_etykieta && oc.werdykt === p.werdykt) return p.id;
      // kompatybilność: stara etykieta bez dokładnego werdyktu
      if (oc.odmowa_etykieta === p.odmowa_etykieta && !oc.werdykt) return p.id;
    }
    if (oc.odmowa_etykieta === 'sluszna') return 'zgoda';
    if (oc.odmowa_etykieta === 'falszywa') return 'myli';
    if (oc.odmowa_etykieta === 'niepewne') return 'niepewn';
    if (oc.werdykt === 'ok' && !oc.odmowa_etykieta) return 'zgoda';
    if (oc.werdykt === 'fail' && !oc.odmowa_etykieta) return 'myli';
    return null;
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
        if (maWyborCzlowieka(czytajOcene(w.id))) return false;
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
      if (maWyborCzlowieka(czytajOcene(w.id))) n += 1;
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
        var p3d = 0, tre = 0, lib = 0, gold = 0, odm = 0, failWarn = 0, blad = 0;
        stan.pack.wpisy.forEach(function (w) {
          if (w.id.indexOf('P3D-') === 0) p3d += 1;
          else if (w.id.indexOf('TRE-') === 0) tre += 1;
          else if (w.id.indexOf('LIB-') === 0) lib += 1;
          else if (w.id.indexOf('GOLD-') === 0) gold += 1;
          if (listaOdmow(w).length) odm += 1;
          if (maBladPomiaru(w)) blad += 1;
          var t = techNorm(w);
          if (t === 'fail' || t === 'warn') failWarn += 1;
        });
        stat.textContent =
          'W bazie: ' + p3d + ' P3D · ' + gold + ' GOLD · ' + tre + ' TRE · ' + lib + ' LIB · ' +
          odm + ' z odmową (' + blad + ' BLAD_POMIARU) · ' + failWarn + ' FAIL/WARN. ' +
          'Karta = jeden projekt: co to jest → co system uważa → Twoja ocena.';
      }
    }
    pokazBiezacy();
  }

  function blokCoToJest(w) {
    var kat = kategoriaZWpisu(w);
    var katPl = KAT_PL[kat] || kat;
    var html = '<section class="nauka-card-sec">';
    html += '<p class="nauka-sec-label">Co to jest</p>';
    html += '<h2 class="nauka-tytul">' + escapHtml(tytulCzytelny(w)) + '</h2>';
    if (katPl) html += '<div class="nauka-harness"><span class="nauka-kat">' + escapHtml(katPl) + '</span></div>';
    html += '<p class="nauka-opis">' + escapHtml(opisModelu(w)) + '</p>';
    html += '<p class="nauka-id-sek">' + escapHtml(w.id) + ' · ' + escapHtml(nazwaPliku(w)) + '</p>';
    html += '</section>';
    return html;
  }

  function blokPodglad(w) {
    var fmt = formatPliku(w);
    var meta = [];
    if (w.gabaryt) meta.push(escapHtml(w.gabaryt));
    if (w.n_czesci != null) meta.push(w.n_czesci + ' części');
    if (fmt) meta.push(escapHtml(fmt));
    if (w.tri != null) meta.push(w.tri + ' tri');

    var html = '<section class="nauka-card-sec">';
    html += '<p class="nauka-sec-label">Podgląd modelu</p>';
    if (w.thumbnail) {
      html += '<div class="nauka-thumb"><img src="' + escapHtml(w.thumbnail) + '" alt=""></div>';
    } else {
      html += '<div class="nauka-placeholder">';
      html += '<div class="nauka-placeholder-ico" aria-hidden="true">⧉</div>';
      if (w.sylwetka) {
        html += '<p class="nauka-sylwetka">' + escapHtml(w.sylwetka) + '</p>';
      } else {
        html += '<p class="nauka-sylwetka">Brak podglądu 3D na telefonie</p>';
      }
      if (meta.length) html += '<p class="nauka-meta-line">' + meta.join(' · ') + '</p>';
      html += '<p class="nauka-placeholder-hint">Pełna siatka (3MF/STL) jest lokalnie na PC w folderze trening — nie pakujemy jej do PWA.</p>';
      html += '</div>';
    }
    html += '</section>';
    return html;
  }

  function blokSystem(w) {
    var bullets = bulletsSystem(w);
    var t = techNorm(w);
    var badge = '';
    if (t === 'fail') badge = '<span class="nauka-badge nauka-fail">system: FAIL</span>';
    else if (t === 'warn') badge = '<span class="nauka-badge nauka-warn">system: WARN</span>';
    else if (listaOdmow(w).length) badge = '<span class="nauka-badge nauka-warn">system: odmowa</span>';
    else if (t === 'ok') badge = '<span class="nauka-badge nauka-ok">system: OK</span>';

    var html = '<section class="nauka-card-sec nauka-system">';
    html += '<p class="nauka-sec-label">Co system uważa</p>';
    if (badge) html += '<div class="nauka-harness">' + badge + '</div>';
    html += '<ul class="nauka-ludzkie">';
    bullets.forEach(function (b) {
      html += '<li>' + escapHtml(b) + '</li>';
    });
    html += '</ul></section>';
    return html;
  }

  function blokTwojaOcena(w, oc) {
    var akt = aktywnaOcenaProsta(oc);
    var html = '<section class="nauka-card-sec">';
    html += '<p class="nauka-sec-label">Twoja ocena</p>';
    html += '<div class="nauka-ocena-prosta" id="naukaOcenaProsta">';
    OCENA_PROSTA.forEach(function (p) {
      var on = akt === p.id;
      html += '<button type="button" class="nauka-btn-big' + (on ? ' on' : '') +
        '" data-ocena-prosta="' + p.id + '">' +
        '<span class="nauka-btn-t">' + escapHtml(p.t) + '</span>' +
        '<span class="nauka-btn-h">' + escapHtml(p.hint) + '</span></button>';
    });
    html += '</div>';
    html += '<label class="nauka-notatka-lab">Co jest źle / co jest dobrze' +
      '<textarea id="naukaNotatka" rows="3" placeholder="Krótko własnymi słowami…">' +
      escapHtml(oc.notatka || '') + '</textarea></label>';

    html += '<details class="nauka-adv"><summary>Zaawansowane (postawy 1–6, checki)</summary>';
    html += '<div class="nauka-sekcja"><div class="t0-lista">';
    html += '<div class="t0-wiersz"><label><input type="checkbox" id="naukaP0" ' +
      (oc.punkt0_zdanie ? 'checked' : '') +
      '><span>Punkt 0 — agent powiedział jednym zdaniem co się fizycznie dzieje</span></label></div>';
    html += '<div class="t0-wiersz"><label><input type="checkbox" id="naukaPyt" ' +
      (oc.pytania_agenta === true ? 'checked' : '') +
      '><span>Pytał zanim budował (nie yes-man)</span></label></div>';
    html += '</div></div>';
    html += '<div class="nauka-sekcja"><p class="th">Postawy SYS_TALK:</p><div class="t0-lista" id="naukaPostawy">';
    POSTAWY.forEach(function (p) {
      var on = oc.postawy_1_6 && oc.postawy_1_6.indexOf(p.n) >= 0;
      html += '<div class="t0-wiersz"><label><input type="checkbox" data-postawa="' + p.n + '" ' +
        (on ? 'checked' : '') + '><span>' + p.t + '</span></label></div>';
    });
    html += '</div></div>';
    html += '<div class="nauka-sekcja"><p class="th">Szybkie problemy (dopisują notatkę):</p><div class="t0-lista" id="naukaSzybkie">';
    SZYBKIE.forEach(function (s) {
      html += '<div class="t0-wiersz"><label><input type="checkbox" data-szybki="' + s.id +
        '"><span>' + s.t + '</span></label></div>';
    });
    html += '</div></div></details>';

    html += '<div class="nauka-sekcja row">';
    html += '<button type="button" id="naukaWstecz">← Wstecz</button>';
    html += '<button type="button" class="nauka-btn ok" id="naukaZapiszDalej">Zapisz i dalej →</button>';
    html += '<button type="button" id="naukaPobierz">Pobierz JSON</button>';
    html += '</div></section>';
    return html;
  }

  function zbudujFormularz(w, oc) {
    return blokCoToJest(w) + blokPodglad(w) + blokSystem(w) + blokTwojaOcena(w, oc);
  }

  function zFormularza(w, override) {
    var oc = czytajOcene(w.id) || domyslnaOcena(w);
    oc.when = new Date().toISOString();

    var prostaRoot = $('naukaOcenaProsta');
    var prostaId = null;
    if (override && override.ocenaProsta) {
      prostaId = override.ocenaProsta;
    } else if (prostaRoot) {
      var onBtn = prostaRoot.querySelector('.nauka-btn-big.on');
      if (onBtn) prostaId = onBtn.getAttribute('data-ocena-prosta');
    }
    if (prostaId) {
      var map = OCENA_PROSTA.filter(function (x) { return x.id === prostaId; })[0];
      if (map) {
        oc.odmowa_etykieta = map.odmowa_etykieta;
        oc.werdykt = map.werdykt;
      }
    } else if (override && override.werdykt) {
      oc.werdykt = override.werdykt;
    }

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
    if (listaOdmow(w).length) oc.przerob_odmowa_kod = true;

    var not = ($('naukaNotatka') && $('naukaNotatka').value || '').trim();
    var dopiski = [];
    var szyb = $('naukaSzybkie');
    if (szyb) {
      szyb.querySelectorAll('input[data-szybki]:checked').forEach(function (inp) {
        var sid = inp.getAttribute('data-szybki');
        var s = SZYBKIE.filter(function (x) { return x.id === sid; })[0];
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

  function idzDalejPoZapisie() {
    if (stan.i < stan.kolejka.length - 1) {
      stan.i += 1;
      pokazBiezacy();
      return;
    }
    var tylko = $('naukaTylkoNowe') && $('naukaTylkoNowe').checked;
    if (tylko) odswiezKolejke();
    else pokazBiezacy();
    var st = $('naukaStan');
    if (st) st.textContent = 'Koniec serii — pobierz JSON-y przyciskiem poniżej.';
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
        (stan.i + 1) + ' / ' + stan.kolejka.length + ' · ' + tytulCzytelny(w) +
        ' · ocenionych: ' + ocenionych + ' / ' + stan.kolejka.length;
    }
    var oc = czytajOcene(w.id) || domyslnaOcena(w);
    karta.innerHTML = zbudujFormularz(w, oc);
    localStorage.setItem(LS_IDX, String(stan.i));

    var prostaRoot = $('naukaOcenaProsta');
    if (prostaRoot) {
      prostaRoot.querySelectorAll('[data-ocena-prosta]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          prostaRoot.querySelectorAll('.nauka-btn-big').forEach(function (b) { b.classList.remove('on'); });
          btn.classList.add('on');
        });
      });
    }

    var dalej = $('naukaZapiszDalej');
    var wstecz = $('naukaWstecz');
    var pob = $('naukaPobierz');
    if (dalej) dalej.addEventListener('click', function () {
      var o = zFormularza(w);
      if (!o.odmowa_etykieta && o.werdykt === 'oczekuje') {
        var st = $('naukaStan');
        if (st) st.textContent = 'Wybierz jedną z trzech ocen (Zgadzam się / System się myli / Nie jestem pewien), potem Zapisz i dalej.';
        return;
      }
      zapiszOcene(w.id, o);
      idzDalejPoZapisie();
    });
    if (wstecz) wstecz.addEventListener('click', function () {
      zapiszOcene(w.id, zFormularza(w));
      if (stan.i > 0) { stan.i--; pokazBiezacy(); }
    });
    if (pob) pob.addEventListener('click', function () {
      pobierzJson(w.id, zFormularza(w));
    });
  }

  function eksportWszystkie() {
    if (!stan.pack || !stan.pack.wpisy) return;
    var n = 0;
    stan.pack.wpisy.forEach(function (w) {
      var o = czytajOcene(w.id);
      if (!maWyborCzlowieka(o)) return;
      setTimeout(function () { pobierzJson(w.id, o); }, n * 300);
      n += 1;
    });
    var st = $('naukaStan');
    if (st) {
      st.textContent = n
        ? ('Pobieram ' + n + ' ocen — zapisz do e2e-projekt/nauka-modele/ocen/, potem: node _import-ocen-pobrane.mjs')
        : 'Brak zapisanych ocen w tej przeglądarce.';
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
    tytulCzytelny: tytulCzytelny,
    nazwaPliku: nazwaPliku,
    bulletsSystem: bulletsSystem
  };
})(typeof window !== 'undefined' ? window : global);
