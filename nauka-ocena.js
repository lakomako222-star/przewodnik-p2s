/**
 * Nauka z wzorców (karta-oceny.json). LIB/TRE/GOLD = dobre przykłady, nie odrzuty.
 * Odmowa pomiaru = dziura detektora. Zapis: localStorage p2s.nauka.ocen.<id>.
 */
(function (global) {
  'use strict';

  var LS_PREF = 'p2s.nauka.ocen.';
  var LS_IDX = 'p2s.nauka.ocena.idx';
  var LS_SERIA = 'p2s.nauka.ocena.seria.v3';
  var DOMYSLNA_SERIA = 'WZORCE';

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

  /** Główna akcja: to dobry przykład. Śmieć = rzadkość. */
  var OCENA_PROSTA = [
    {
      id: 'wzorzec',
      t: 'Zgadzam się że to dobry przykład',
      hint: 'Ucz się kształtu i kategorii — model jest OK',
      odmowa_etykieta: 'falszywa',
      werdykt: 'ok',
      priorytet: true
    },
    {
      id: 'niepewn',
      t: 'Nie jestem pewien',
      hint: 'Zostawiam do późniejszej decyzji',
      odmowa_etykieta: 'niepewne',
      werdykt: 'oczekuje'
    },
    {
      id: 'smiec',
      t: 'Ten wpis jest śmieciem',
      hint: 'Rzadko: zła nazwa, zepsuty plik — nie uczyć się z tego',
      odmowa_etykieta: 'smiec',
      werdykt: 'fail'
    }
  ];

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

  function maWyborCzlowieka(o) {
    return !!(o && (oceniona(o) || o.odmowa_etykieta));
  }

  function listaOdmow(w) {
    if (!w || !w.przerob_odmowy) return [];
    return String(w.przerob_odmowy).split(/[,;\s]+/).map(function (s) {
      return s.trim();
    }).filter(Boolean);
  }

  function jestBladPomiaruKod(kod) {
    return kod === 'BLAD_POMIARU' || kod === 'BŁĄD_POMIARU';
  }

  function maBladPomiaru(w) {
    return listaOdmow(w).some(jestBladPomiaruKod);
  }

  function techNorm(w) {
    return String((w && w.werdykt_techniczny) || '').toLowerCase();
  }

  function jestWzorzec(w) {
    if (!w) return false;
    if (w.rola === 'wzorzec') return true;
    var id = String(w.id || '');
    return id.indexOf('LIB-') === 0 || id.indexOf('TRE-') === 0 || id.indexOf('GOLD-') === 0;
  }

  function escapHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapMd(s) {
    return escapHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
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
    if (w && w.tytul_printables) return String(w.tytul_printables);
    if (w && w.tytul_czytelny) return String(w.tytul_czytelny);
    var n = nazwaPliku(w);
    n = n.replace(/\.(3mf|stl|obj|pdf)$/i, '');
    n = n.replace(/_\d{5,}$/g, '').replace(/\+/g, ' ').replace(/_/g, ' ');
    return n.trim() || (w && w.id) || '—';
  }

  function kategoriaZWpisu(w) {
    if (w && w.kategoria) return String(w.kategoria).toUpperCase();
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

  function zdanieOpisu(w) {
    if (w && w.opis_printables) return String(w.opis_printables);
    if (w && w.opis_krotki) {
      var k = String(w.opis_krotki);
      var m = k.match(/^[\s\S]{12,240}?[.!?]/);
      var cut = m ? m[0] : k;
      return cut.length > 280 ? cut.slice(0, 277) + '…' : cut;
    }
    if (w && w.sylwetka) return 'Sylwetka z pomiaru: ' + w.sylwetka + '.';
    return 'Nazwa i kategoria już mówią, co to jest.';
  }

  function urlPodgladu(w) {
    if (!w) return '';
    return String(w.podglad_url || w.thumbnail || '').trim();
  }

  /** Punkty nauki — nie lista wad modelu. */
  function punktyNauki(w) {
    var out = [];
    function dodaj(kod, badge, tytul, opis) {
      if (out.length >= 3) return;
      out.push({ n: out.length + 1, kod: kod || '', badge: badge, tytul: tytul, opis: opis });
    }

    if (w && w.powod_po_ludzku && !/odrzu|zły model|za zły/i.test(String(w.powod_po_ludzku))) {
      dodaj('wzorzec', 'ok', 'Wzorzec — ucz się z tego', String(w.powod_po_ludzku));
    } else {
      dodaj('wzorzec', 'ok', 'Wzorzec (dobry model)',
        'To jest: ' + tytulCzytelny(w) + '. ' + zdanieOpisu(w) +
        ' Ucz się kształtu i kategorii. Plik jest przykładem, nie odrzutem.');
    }

    if (maBladPomiaru(w)) {
      dodaj('BLAD_POMIARU', 'falszywa', 'Dziura detektora (nie wada modelu)',
        'Detektor nie zmierzył otworu/gniazda automatycznie. To **nie** przeczy nazwie ani opisowi — plik i tak jest OK.');
    }

    if (w && Array.isArray(w.problemy)) {
      w.problemy.slice(0, 1).forEach(function (p) {
        var s = String(p);
        if (/gabaryt_aabb/i.test(s)) {
          var mm = s.match(/max_mm["\s:]*([\d.]+)/);
          dodaj('gabaryt_aabb', 'warn', 'Na P2S dziel (nadal wzorzec)',
            (mm ? 'Najdłuższy wymiar ~' + mm[1] + ' mm' : 'Gabaryt powyżej 256 mm') +
            ' — na płycie P2S trzeba dzielić. To nadal dobry przykład tego, jak obiekt wygląda.');
        }
      });
    } else if (w && w.n_czesci != null && w.n_czesci > 8) {
      dodaj('czesci', 'warn', 'Wiele części w paczce',
        w.n_czesci + ' części — ucz się podziału, nie odrzucaj całego wpisu jako złego modelu.');
    }

    return out.slice(0, 3);
  }

  function aktywnaOcenaProsta(oc) {
    if (!oc) return null;
    for (var i = 0; i < OCENA_PROSTA.length; i++) {
      var p = OCENA_PROSTA[i];
      if (oc.odmowa_etykieta === p.odmowa_etykieta && oc.werdykt === p.werdykt) return p.id;
      if (oc.odmowa_etykieta === p.odmowa_etykieta && !oc.werdykt) return p.id;
    }
    if (oc.odmowa_etykieta === 'falszywa') return 'wzorzec';
    if (oc.odmowa_etykieta === 'smiec' || oc.odmowa_etykieta === 'sluszna') return 'smiec';
    if (oc.odmowa_etykieta === 'niepewne') return 'niepewn';
    if (oc.werdykt === 'ok') return 'wzorzec';
    if (oc.werdykt === 'fail') return 'smiec';
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
      if (seria === 'WZORCE') {
        if (!jestWzorzec(w)) return false;
      } else if (seria === 'OCENA' || seria === 'ODMOWY') {
        if (!listaOdmow(w).length && techNorm(w) !== 'fail' && techNorm(w) !== 'warn') return false;
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
    lista.sort(function (a, b) {
      function baza(w) {
        var id = w.id;
        if (id.indexOf('GOLD-') === 0) return 0;
        if (id.indexOf('LIB-') === 0) {
          var l = parseInt(id.replace(/^LIB-/, ''), 10);
          return 1000 + (isFinite(l) ? l : 999);
        }
        if (id.indexOf('TRE-') === 0) {
          var tr = parseInt(id.replace(/^TRE-/, ''), 10);
          return 10000 + (isFinite(tr) ? tr : 999);
        }
        if (id.indexOf('P3D-') === 0) {
          var n = parseInt(id.replace(/^P3D-/, ''), 10);
          return 20000 + (isFinite(n) ? n : 999);
        }
        return 50000;
      }
      var pa = baza(a);
      var pb = baza(b);
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

  function wypelnijKatalog() {
    var el = $('naukaKatalogStat');
    var traf = $('naukaKatalogTrafienia');
    if (!el && !traf) return;
    var wp = (stan.pack && stan.pack.wpisy) || [];
    var kat = {};
    var wz = 0;
    wp.forEach(function (w) {
      if (jestWzorzec(w)) wz += 1;
      var k = String(w.kategoria || '?');
      kat[k] = (kat[k] || 0) + 1;
    });
    var nKat = Object.keys(kat).length;
    if (el) {
      el.textContent = 'Wzorce: ' + wz + ' · wpisów: ' + wp.length + ' · kategorii: ' + nKat
        + '. Pamięć katalogu w Projekcie — 5 trafień co turę (tagi + opis z 3MF). To nie trening GPU.';
    }
    if (traf) {
      var last = null;
      try { last = JSON.parse(localStorage.getItem('p2s.nauka.rag.ostatnie') || 'null'); } catch (e) { last = null; }
      if (last && last.hits && last.hits.length) {
        traf.textContent = 'Trafienia pamięci („' + String(last.query || '').slice(0, 60) + '”): '
          + last.hits.map(function (h) {
            var bit = (h.id ? (h.id + ' ') : '') + (h.tytul || '?')
              + (h.kategoria ? (' [' + h.kategoria + ']') : '')
              + (h.gabaryt ? (' ' + h.gabaryt) : '');
            if (h.tagi && h.tagi.length) bit += ' {' + h.tagi.slice(0, 4).join(',') + '}';
            return bit;
          }).join(' · ');
      } else {
        traf.textContent = 'Trafienia pamięci: brak (wyślij wiadomość w Projekcie).';
      }
    }
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
        var p3d = 0, tre = 0, lib = 0, gold = 0, wz = 0, blad = 0;
        stan.pack.wpisy.forEach(function (w) {
          if (w.id.indexOf('P3D-') === 0) p3d += 1;
          else if (w.id.indexOf('TRE-') === 0) tre += 1;
          else if (w.id.indexOf('LIB-') === 0) lib += 1;
          else if (w.id.indexOf('GOLD-') === 0) gold += 1;
          if (jestWzorzec(w)) wz += 1;
          if (maBladPomiaru(w)) blad += 1;
        });
        stat.textContent =
          'Wzorce do nauki: ' + wz + ' (LIB ' + lib + ' · TRE ' + tre + ' · GOLD ' + gold +
          ') · P3D ' + p3d + '. ' + blad +
          ' razy detektor nie zmierzył otworu — to dziura detektora, nie 552 złe pliki. ' +
          'Karta: tytuł + opis → ucz się kształtu.';
      }
    }
    wypelnijKatalog();
    pokazBiezacy();
  }

  function blokWzorzec(w) {
    var kat = kategoriaZWpisu(w);
    var katPl = KAT_PL[kat] || kat;
    var html = '<section class="nauka-card-sec nauka-wzorzec-sec">';
    html += '<p class="nauka-sec-label">Wzorzec (dobry model)</p>';
    html += '<h2 class="nauka-tytul">' + escapHtml(tytulCzytelny(w)) + '</h2>';
    html += '<div class="nauka-harness">';
    html += '<span class="nauka-badge nauka-ok">wzorzec</span>';
    if (katPl) html += '<span class="nauka-kat">' + escapHtml(katPl) + '</span>';
    html += '</div>';
    html += '<p class="nauka-lead">To jest: <strong>' + escapHtml(tytulCzytelny(w)) +
      '</strong>. ' + escapHtml(zdanieOpisu(w)) + '</p>';
    html += '<p class="nauka-ramka">Ucz się kształtu i kategorii. Tytuł i opis (jak na Printables) już mówią, co to. ' +
      'Cała baza treningowa jest <strong>dobra</strong> — nie odrzucaj jej.</p>';
    html += '<p class="nauka-id-sek">' + escapHtml(w.id) + ' · ' + escapHtml(nazwaPliku(w)) + '</p>';
    return html + '</section>';
  }

  function blokDetektor(w) {
    var punkty = punktyNauki(w);
    var fmt = formatPliku(w);
    var meta = [];
    if (w.gabaryt) meta.push(escapHtml(w.gabaryt));
    if (w.n_czesci != null) meta.push(w.n_czesci + (w.n_czesci === 1 ? ' część' : ' części'));
    if (fmt) meta.push(escapHtml(fmt));
    var img = urlPodgladu(w);

    var html = '<section class="nauka-card-sec nauka-system">';
    html += '<p class="nauka-sec-label">Czego się uczyć</p>';
    html += '<div class="nauka-viewer">';
    if (img) {
      html += '<img class="nauka-viewer-img" src="' + escapHtml(img) +
        '" alt="' + escapHtml(tytulCzytelny(w)) + '" loading="lazy" referrerpolicy="no-referrer">';
    } else {
      html += '<div class="nauka-placeholder nauka-viewer-ph">';
      html += '<p class="nauka-sylwetka">' + escapHtml(w.sylwetka || 'Brak podglądu zdjęcia') + '</p>';
      html += '</div>';
    }
    html += '</div>';
    if (meta.length) html += '<p class="nauka-meta-line">' + meta.join(' · ') + '</p>';

    html += '<ol class="nauka-zastrzezenia">';
    punkty.forEach(function (z) {
      html += '<li><span class="nauka-nr nauka-nr-' + escapHtml(z.badge) + '">' + z.n + '</span>' +
        '<div class="nauka-z-body"><p class="nauka-z-t">' + escapHtml(z.tytul) + '</p>' +
        '<p class="nauka-z-d">' + escapMd(z.opis) + '</p></div></li>';
    });
    html += '</ol>';
    if (maBladPomiaru(w)) {
      html += '<p class="nauka-ramka">Detektor nie zmierzył walca automatycznie. To <strong>nie</strong> znaczy, ' +
        'że model jest zły — nazwa już go opisuje.</p>';
    }
    if (w.printables_url) {
      html += '<p class="nauka-printables"><a href="' + escapHtml(w.printables_url) +
        '" target="_blank" rel="noopener">Model na Printables</a></p>';
    }
    html += '</section>';
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
        (p.priorytet ? ' nauka-btn-priorytet' : '') +
        '" data-ocena-prosta="' + p.id + '">' +
        '<span class="nauka-btn-t">' + escapHtml(p.t) + '</span>' +
        '<span class="nauka-btn-h">' + escapHtml(p.hint) + '</span></button>';
    });
    html += '</div>';
    html += '<label class="nauka-notatka-lab">Notatka do nauki (opcjonalnie)' +
      '<textarea id="naukaNotatka" rows="3" placeholder="Np. typowy adapter 2040, ucz się gniazda baterii…">' +
      escapHtml(oc.notatka || '') + '</textarea></label>';

    html += '<details class="nauka-adv"><summary>Zaawansowane (postawy 1–6, checki rozmowy)</summary>';
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
    html += '<div class="nauka-sekcja"><p class="th">Szybkie problemy rozmowy (dopisują notatkę):</p><div class="t0-lista" id="naukaSzybkie">';
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
    return blokWzorzec(w) + blokDetektor(w) + blokTwojaOcena(w, oc);
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
      karta.innerHTML = '<p class="tout">Brak wpisów w tej serii (albo wszystkie już oznaczone). Zmień filtr u góry.</p>';
      if (postep) postep.textContent = '0 oznaczonych / 0 w kolejce';
      return;
    }
    var w = stan.kolejka[stan.i];
    stan.biezacy = w;
    var ocenionych = policzOcenioneWKolejce(stan.kolejka);
    if (postep) {
      postep.textContent =
        (stan.i + 1) + ' / ' + stan.kolejka.length + ' · ' + tytulCzytelny(w) +
        ' · oznaczonych: ' + ocenionych + ' / ' + stan.kolejka.length;
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
        if (st) st.textContent = 'Wybierz: dobry przykład / niepewny / śmieć, potem Zapisz i dalej.';
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
        if (val === 'OCENA' || val === 'ODMOWY') val = DOMYSLNA_SERIA;
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
    document.addEventListener('p2s-nauka-rag', function () { wypelnijKatalog(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  global.__p2sNaukaOcena = {
    odswiez: odswiezKolejke,
    czytaj: czytajOcene,
    listaOdmow: listaOdmow,
    tytulCzytelny: tytulCzytelny,
    nazwaPliku: nazwaPliku,
    jestWzorzec: jestWzorzec,
    punktyNauki: punktyNauki
  };
})(typeof window !== 'undefined' ? window : global);
