/**
 * T-38 / T-0 — start wydruku, Frostbite, offline.
 * Zero sieci, zero poleceń Handy/Studio. 8 punktów: localStorage na dzień (Europe/Warsaw).
 * Flow 0,8645 = kanon profilu KALIBROWANE SUNLU PLA+ CUSTOM (skalibrowane). Nie zgaduj 0,98.
 */
(function (global) {
  'use strict';

  var PREFIX = 'p2s.t0.';
  var TZ = 'Europe/Warsaw';
  var ID = 'T-38';

  var ITEMS = [
    { id: 'plyta_fizyczna', kind: 'dzien', label: 'Płyta fizyczna: niebieska Frostbite (CryoGrip Pro), nie czapa.', href: 'r-jak-korzystac-z-przewodnika-dzien-dzisiejszy-frostbite', chip: 'dziś' },
    { id: 'plyta_studio', kind: 'dzien', label: 'Studio i ekran P2S: High Temp / Smooth PEI (curr_bed_type 3), nie Textured.', href: 'r-7-biqu-panda-cryogrip-pro-frostbite-7-4-rozpoznawanie-plyty-i-pierwsza-warstwa', chip: '7.4' },
    { id: 'proces', kind: 'dzien', label: 'Proces: 0.20mm Standard @BBL P2S — bez „czapa”.', href: 'r-5-filament-innej-marki-od-a-do-z-sunlu-5-18-proces-warstwa-osobna-lista', chip: '5.18' },
    { id: 'filament', kind: 'dzien', label: 'Filament: KALIBROWANE SUNLU PLA+ CUSTOM z dopiskiem Frostbite (nie czapa/ORYGINAL).', href: 'r-5-filament-innej-marki-od-a-do-z-sunlu-5-17-nowa-szpula-ktory-profil', chip: '5.17' },
    { id: 'flow', kind: 'dzien', label: 'Flow: zostaw 0,8645 (skalibrowane, nie zgaduj 0,98).', href: 'r-6-kalibracje-krok-po-kroku-6-4-natezenie-przeplywu-etap-1', chip: '6.4' },
    { id: 'detekcja', kind: 'dzien', label: 'Detekcja płyty: Frostbite nie ma QR — ostrzeżenie 0500-8062 jest normalne.', href: 'r-16-komunikaty-hms-i-praca-z-bledami-16-1-jak-pracowac-z-kodem-hms', chip: '16.1' },
    { id: 'sport', kind: 'dzien', label: 'Sport: na ekranie drukarki, nie w procesie.', href: 'r-5-filament-innej-marki-od-a-do-z-sunlu-5-18-proces-warstwa-osobna-lista', chip: '5.18' },
    { id: 'po_druku', kind: 'dzien', label: 'Po druku: ostygnąć, giąć płytę, woda+mydło, nie alkohol.', href: 'r-7-biqu-panda-cryogrip-pro-frostbite-7-5-zdejmowanie-wydrukow-i-ochrona-powloki', chip: '7.5' }
  ];

  var FLOW_PLA_PLUS = '0.8645';
  var PROCES = '0.20mm Standard @BBL P2S';
  var CURR_BED = 3;
  var mounted = false;

  function mapPunkt(it) {
    var id = String((it && it.id) || '');
    var kind = String((it && it.kind) || 'dzien');
    if (kind !== 'dlug') kind = 'dzien';
    return {
      id: id,
      kind: kind,
      label: String((it && it.label) || ''),
      href: String((it && it.href) || ''),
      chip: String((it && it.chip) || '')
    };
  }

  function jestDlug(it) {
    if (!it) return false;
    if (typeof it === 'string') {
      return ITEMS.some(function (p) { return p.id === it && jestDlug(p); });
    }
    return it.kind === 'dlug';
  }

  function wczytajPaczke(p) {
    if (!p || p.id !== ID) return false;
    if (Array.isArray(p.punkty) && p.punkty.length) {
      ITEMS = p.punkty.map(mapPunkt);
    }
    if (p.flow_pla_plus) FLOW_PLA_PLUS = String(p.flow_pla_plus);
    if (p.proces) PROCES = String(p.proces);
    if (p.curr_bed_type != null) CURR_BED = Number(p.curr_bed_type);
    return true;
  }

  function normPrzecinek(v) {
    return String(v == null ? '' : v).trim().replace(',', '.');
  }

  function flowPlaPlusOk(v) {
    return normPrzecinek(v) === FLOW_PLA_PLUS;
  }

  function procesOk(s) {
    var t = String(s || '').replace(/\s+/g, ' ').trim();
    if (/czapa/i.test(t)) return false;
    return t === PROCES;
  }

  function nazwaFilamentuOk(s) {
    var t = String(s || '');
    if (/czapa|oryginal/i.test(t)) return false;
    return /frostbite/i.test(t) && /kalibrowane/i.test(t);
  }

  function plytaStudioOk(s, curr) {
    if (curr != null && Number(curr) !== CURR_BED) return false;
    var t = String(s || '');
    if (/textured/i.test(t)) return false;
    return /high\s*temp/i.test(t) && /smooth\s*pei/i.test(t);
  }

  function plytaFizycznaOk(s) {
    var t = String(s || '');
    if (/czapa/i.test(t) && !/nie czapa/i.test(t)) return false;
    return /frostbite/i.test(t);
  }

  function currBedTypeOk(n) {
    return Number(n) === CURR_BED;
  }

  function dzien() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
    } catch (e) {
      var d = new Date();
      var m = d.getMonth() + 1;
      var day = d.getDate();
      return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
    }
  }

  function klucz() {
    return PREFIX + dzien();
  }

  function czytaj() {
    try {
      var raw = localStorage.getItem(klucz());
      if (!raw) return {};
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return {};
      return o;
    } catch (e) {
      return {};
    }
  }

  function zapisz(stan) {
    try {
      localStorage.setItem(klucz(), JSON.stringify(stan || {}));
    } catch (e) {}
  }

  function punktyDzienne() {
    return ITEMS.filter(function (it) { return !jestDlug(it); });
  }

  function policz(stan) {
    var n = 0;
    punktyDzienne().forEach(function (it) {
      if (stan[it.id]) n += 1;
    });
    return n;
  }

  function maDlug() {
    return ITEMS.some(jestDlug);
  }

  function skocz(id) {
    if (!id) return;
    if (typeof global.__goGuide === 'function') {
      global.__goGuide(id);
      return;
    }
    if (typeof global.__p2sShow === 'function') global.__p2sShow('guide');
    if (typeof global.__p2sOpenChapter === 'function') global.__p2sOpenChapter(id);
    try { location.hash = id; } catch (e) {}
  }

  function chipHtml(it) {
    return it.href
      ? '<a class="t0-chip" href="#' + it.href + '">' + it.chip + '</a>'
      : '';
  }

  function wierszHtml(it) {
    return '<li class="t0-wiersz">'
      + '<label><input type="checkbox" data-t0="' + it.id + '"><span>' + it.label + '</span></label>'
      + chipHtml(it)
      + '</li>';
  }

  function wierszeHtml() {
    return ITEMS.map(wierszHtml).join('');
  }

  function listaHtml(resetId) {
    return '<p class="t0-hint">Start wydruku. Offline. Zero sieci. Nie steruje drukarką.</p>'
      + '<ul class="check t0-lista">' + wierszeHtml() + '</ul>'
      + '<button type="button" class="t0-reset" data-t0-reset="' + resetId + '">nowy wydruk</button>';
  }

  function homeHtml() {
    return '<div class="t0-home-chip" id="t0HomeChip">'
      + '<strong>T-0 start wydruku</strong>'
      + '<span class="t0-postep" id="t0HomePostep">0/' + punktyDzienne().length + '</span>'
      + '</div>'
      + '<div id="t0HomePanel">' + listaHtml('home') + '</div>';
  }

  function narzHtml() {
    return listaHtml('narz');
  }

  function zsynchronizuj() {
    if (typeof document === 'undefined') return;
    var stan = czytaj();
    var n = policz(stan);
    var dailyN = punktyDzienne().length;
    var txt = n + '/' + dailyN;
    if (maDlug()) txt += ' · dług';
    document.querySelectorAll('[data-t0]').forEach(function (inp) {
      var id = inp.getAttribute('data-t0');
      inp.checked = !!stan[id];
    });
    document.querySelectorAll('.t0-postep').forEach(function (el) {
      el.textContent = txt;
    });
    var chip = document.getElementById('t0HomeChip');
    if (chip) {
      chip.setAttribute('data-done', (n === dailyN && dailyN > 0) ? '1' : '0');
      chip.setAttribute('data-dlug', maDlug() ? '1' : '0');
    }
  }

  function ustaw(id, on) {
    if (!id) return;
    var stan = czytaj();
    if (on) stan[id] = 1;
    else delete stan[id];
    zapisz(stan);
    zsynchronizuj();
  }

  function resetDzis() {
    try { localStorage.removeItem(klucz()); } catch (e) {}
    zsynchronizuj();
  }

  function bindRoot(root) {
    if (!root || root.getAttribute('data-t0-bound') === '1') return;
    root.setAttribute('data-t0-bound', '1');
    root.addEventListener('change', function (e) {
      var inp = e.target.closest('input[data-t0]');
      if (!inp) return;
      ustaw(inp.getAttribute('data-t0'), !!inp.checked);
    });
    root.addEventListener('click', function (e) {
      var rst = e.target.closest('[data-t0-reset]');
      if (rst) {
        e.preventDefault();
        resetDzis();
        return;
      }
      var a = e.target.closest('a.t0-chip[href^="#"]');
      if (!a) return;
      var id = (a.getAttribute('href') || '').replace(/^#/, '');
      if (!id || id.indexOf('r-') !== 0) return;
      e.preventDefault();
      skocz(id);
    });
  }

  function mount() {
    if (typeof document === 'undefined') return;
    var home = document.getElementById('t0HomeKarta');
    if (home && !home.getAttribute('data-t0-filled')) {
      home.setAttribute('data-t0-filled', '1');
      home.innerHTML = homeHtml();
      bindRoot(home);
    }
    var narz = document.getElementById('t0Lista');
    if (narz && !narz.getAttribute('data-t0-filled')) {
      narz.setAttribute('data-t0-filled', '1');
      narz.innerHTML = narzHtml();
      bindRoot(narz);
    }
    zsynchronizuj();
    mounted = true;
  }

  var api = {
    ID: ID,
    mount: mount,
    items: function () { return ITEMS.slice(); },
    dzien: dzien,
    klucz: klucz,
    jestDlug: jestDlug,
    maDlug: maDlug,
    reset: resetDzis,
    wczytajPaczke: wczytajPaczke,
    flowPlaPlusOk: flowPlaPlusOk,
    procesOk: procesOk,
    nazwaFilamentuOk: nazwaFilamentuOk,
    plytaStudioOk: plytaStudioOk,
    plytaFizycznaOk: plytaFizycznaOk,
    currBedTypeOk: currBedTypeOk,
    FLOW_PLA_PLUS: FLOW_PLA_PLUS,
    PROCES: PROCES,
    CURR_BED: CURR_BED
  };
  global.P2S_t0 = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
