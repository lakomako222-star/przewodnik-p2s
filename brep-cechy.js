/**
 * T-37 — B-Rep opcjonalna (faza/zaokrąglenie). Test zanim UI.
 * Brak WASM = CSG jak dziś. occt nie wchodzi do index.html (Context7: ~40 MB).
 */
(function (global) {
  'use strict';

  var LS = 'p2s.brepCechy';
  var stan = { pack: null, wylacz: true };

  function flagaWlaczona() {
    if (stan.wylacz) return false;
    if (global.__P2S_BREP_CECHY === false) return false;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(LS) === '1') {
        return true;
      }
    } catch (e1) { /* deny */ }
    return false;
  }

  function ustawBrepCechy(on) {
    stan.wylacz = !on;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(LS, on ? '1' : '0');
    } catch (e) { /* ignore */ }
    return flagaWlaczona();
  }

  function wczytajPaczke(pack) {
    stan.pack = pack || null;
    return !!stan.pack;
  }

  function wasmIndexZakazany(html) {
    if (!html) return true;
    var s = String(html);
    // Zakaz: occt-wasm / libcascade / opencascade.js jako skrypt lub import.
    // Słowa w prozie Treści („brak WASM libcascade”) są dozwolone.
    var m;
    var srcRe = /<script\b[^>]*\bsrc\s*=\s*(["'])([^"']*)\1/gi;
    while ((m = srcRe.exec(s))) {
      if (/occt-wasm|libcascade|opencascade\.js/i.test(m[2])) return false;
    }
    var fromRe = /\b(?:import|export)\s+[^;'"\n]*from\s*(["'])([^"']*)\1/gi;
    while ((m = fromRe.exec(s))) {
      if (/occt-wasm|libcascade|opencascade\.js/i.test(m[2])) return false;
    }
    var dynRe = /\bimport\s*\(\s*(["'])([^"']*)\1\s*\)/gi;
    while ((m = dynRe.exec(s))) {
      if (/occt-wasm|libcascade|opencascade\.js/i.test(m[2])) return false;
    }
    return true;
  }

  function dostepne() {
    return false;
  }

  function etykieta() {
    return 'B-Rep niedostępne — faza/zaokrąglenie ścieżką CSG jak dziś. [WYWNIOSKOWANE]';
  }

  /**
   * OpenCascade.js / libcascade WASM ≈ 40 MB (Context7 /taucad/opencascade.js).
   * Sufit index.html 3,4 MB — nie ładujemy. Zawsze {ok:false}.
   */
  function zastosujBrepCeche(part, cecha, keep) {
    return {
      ok: false,
      powod: 'brak_modulu',
      etykieta: etykieta(),
      cecha: cecha && cecha.typ,
      part: null
    };
  }

  var api = {
    LS: LS,
    flagaWlaczona: flagaWlaczona,
    ustawBrepCechy: ustawBrepCechy,
    wczytajPaczke: wczytajPaczke,
    dostepne: dostepne,
    etykieta: etykieta,
    zastosujBrepCeche: zastosujBrepCeche,
    wasmIndexZakazany: wasmIndexZakazany
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.P2S = global.P2S || {};
  Object.assign(global.P2S, {
    zastosujBrepCeche: zastosujBrepCeche,
    flagaBrepCechy: flagaWlaczona,
    ustawBrepCechy: ustawBrepCechy,
    brepDostepne: dostepne,
    etykietaBrep: etykieta
  });
})(typeof window !== 'undefined' ? window : globalThis);
