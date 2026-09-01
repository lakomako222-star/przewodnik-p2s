/**
 * T-40 — dekoder HMS offline. Wklej kod → jedna akcja.
 * Kody 16.1 pieczone. Hybryda = ta sama szukajka co Przewodnik. Zero chmury.
 */
(function (global) {
  'use strict';

  var ID = 'T-40';
  var ROZDZIAL = 'r-16-komunikaty-hms-i-praca-z-bledami-16-1-jak-pracowac-z-kodem-hms';
  var KODY = [
    {
      kod: '0500-8062',
      komunikat: 'Nie wykryto znacznika płyty',
      na_frostbite: 'Kamera nie widzi kodu QR Bambu. CryoGrip / Frostbite go nie ma. Build Plate Detection wstrzymuje start.'
    },
    {
      kod: '0500-8051',
      komunikat: 'Typ płyty nie zgadza się z G-code',
      na_frostbite: 'Profil płyty w Studio nie zgadza się z tym, co drukarka rozpoznała, albo ze stanem bez znacznika.'
    },
    {
      kod: 'Build Plate Detection',
      komunikat: 'Wykrywanie płyty kamerą live-view',
      na_frostbite: 'Czyta kod QR na tylnym zaczepie. Działa tylko na płytach Bambu 2. generacji (P2S/X2D). Na Frostbite wyłącz detekcję albo potwierdzaj Ignoruj przy każdym starcie.'
    }
  ];

  function wczytajPaczke(p) {
    if (!p || p.id !== ID) return false;
    if (Array.isArray(p.kody) && p.kody.length) KODY = p.kody.slice();
    if (p.rozdzial) ROZDZIAL = String(p.rozdzial);
    return true;
  }

  function normalizujKod(s) {
    var t = String(s || '').trim().toLowerCase().replace(/[–—]/g, '-');
    t = t.replace(/[_/\s]+/g, '-');
    var m = t.replace(/[^0-9-]/g, ' ').match(/(\d{4})-?(\d{4})/);
    if (!m) m = t.match(/(\d{4})-(\d{4})/);
    if (m) return m[1] + '-' + m[2];
    if (/build.?plate.?detect/.test(t)) return 'build-plate-detection';
    return t;
  }

  function kluczKarty(k) {
    if (/build.?plate.?detect/i.test(k)) return 'build-plate-detection';
    return normalizujKod(k);
  }

  function kartaDla(raw) {
    var k = normalizujKod(raw);
    var i, it;
    for (i = 0; i < KODY.length; i++) {
      it = KODY[i];
      if (kluczKarty(it.kod) === k) return it;
    }
    return null;
  }

  function hybryda(raw, DATA) {
    var fn = global.P2S && global.P2S.szukajHybryda;
    if (typeof fn !== 'function' || !DATA) return null;
    return fn(raw, DATA, { tryb: 'przewodnik' });
  }

  function dekoduj(raw, DATA) {
    var q = String(raw || '').trim();
    if (!q) {
      return { ok: false, puste: true, karta: null, hybryda: null, ids: [] };
    }
    var karta = kartaDla(q);
    var h = hybryda(q, DATA);
    var ids = (h && h.hits) ? h.hits.map(function (x) { return x.id; }) : [];
    return {
      ok: true,
      puste: false,
      kod: normalizujKod(q),
      karta: karta,
      hybryda: h,
      ids: ids,
      dokladnyKod: !!(h && h.kod),
      etykieta: h ? h.etykieta : (karta ? 'Karta 16.1' : 'Brak karty 16.1'),
      rozdzial: ROZDZIAL
    };
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function htmlWyniku(w) {
    if (!w || w.puste) return '<p>Wklej kod z ekranu.</p>';
    var bits = [];
    if (w.karta) {
      bits.push('<article class="hms-karta">'
        + '<p class="hms-kod">' + esc(w.karta.kod) + '</p>'
        + '<p><b>' + esc(w.karta.komunikat) + '</b></p>'
        + '<p>' + esc(w.karta.na_frostbite) + '</p>'
        + '<p class="dowod">Rozdział 16.1 · offline · zero chmury</p>'
        + '</article>');
    } else {
      bits.push('<p>Brak karty 16.1 dla «' + esc(w.kod) + '». Poniżej ta sama szukajka co w Przewodniku.</p>');
    }
    if (w.hybryda) {
      bits.push('<p class="dowod">' + esc(w.hybryda.etykieta) + (w.hybryda.kod ? ' [ODCZYTANE]' : '') + '</p>');
      var hits = (w.hybryda.hits || []).slice(0, 5);
      if (hits.length) {
        bits.push('<ul class="hms-hity">' + hits.map(function (h) {
          return '<li><a href="#' + esc(h.id) + '">' + esc(h.sub || h.chapter || h.id) + '</a></li>';
        }).join('') + '</ul>');
      }
    }
    return bits.join('');
  }

  function uruchom() {
    if (typeof document === 'undefined') return;
    var inp = document.getElementById('hmsIn');
    var out = document.getElementById('hmsOut');
    if (!out) return;
    var DATA = global.__GUIDE__ || (global.window && global.window.__GUIDE__);
    var w = dekoduj(inp ? inp.value : '', DATA);
    out.innerHTML = htmlWyniku(w);
  }

  function bindUi() {
    if (typeof document === 'undefined') return;
    var btn = document.getElementById('hmsIdz');
    var inp = document.getElementById('hmsIn');
    if (btn && btn.getAttribute('data-hms-bound') !== '1') {
      btn.setAttribute('data-hms-bound', '1');
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        uruchom();
      });
    }
    if (inp && inp.getAttribute('data-hms-bound') !== '1') {
      inp.setAttribute('data-hms-bound', '1');
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          uruchom();
        }
      });
    }
  }

  function mount() {
    bindUi();
  }

  var api = {
    ID: ID,
    wczytajPaczke: wczytajPaczke,
    normalizujKod: normalizujKod,
    kartaDla: kartaDla,
    dekoduj: dekoduj,
    htmlWyniku: htmlWyniku,
    kody: function () { return KODY.slice(); },
    mount: mount,
    uruchom: uruchom
  };
  global.P2S_hms = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
