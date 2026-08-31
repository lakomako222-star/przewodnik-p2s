/**
 * Czyje ustawienia w 3MF — funkcja czysta.
 * Porównanie do profilu systemowego Bambu po łańcuchu inherits, nie do płaskiego snapshotu.
 * Biblioteka: P2S_ANALIZATOR_PROFILE (analizator-profile.js) albo drugi argument.
 */
(function (global) {
  'use strict';

  var META_KLUCZE = {
    inherits: 1, name: 1, type: 1, description: 1
  };

  var A_KEY_PL = {
    sparse_infill_density: 'Wypełnienie',
    sparse_infill_pattern: 'Wzór wypełnienia',
    elefant_foot_compensation: 'Kompensacja stopy słonia',
    top_surface_speed: 'Prędkość górnej powierzchni',
    prime_tower_infill_gap: 'Wieża — szczelina wypełnienia',
    prime_tower_rib_wall: 'Wieża — ściana żebrowa',
    filament_flow_ratio: 'Przepływ',
    enable_pressure_advance: 'Dynamika przepływu (K)',
    fan_min_speed: 'Wentylator min.',
    fan_max_speed: 'Wentylator max.',
    fan_cooling_layer_time: 'Czas warstwy do max. wentylatora',
    first_x_layer_fan_speed: 'Wentylator pierwszych warstw',
    textured_plate_temp: 'Stół Textured PEI',
    textured_plate_temp_initial_layer: 'Stół Textured PEI, 1. warstwa',
    hot_plate_temp: 'Stół Smooth PEI / High Temp',
    hot_plate_temp_initial_layer: 'Stół Smooth PEI, 1. warstwa',
    eng_plate_temp: 'Stół Engineering',
    eng_plate_temp_initial_layer: 'Stół Engineering, 1. warstwa',
    supertack_plate_temp: 'Stół SuperTack',
    supertack_plate_temp_initial_layer: 'Stół SuperTack, 1. warstwa',
    filament_max_volumetric_speed: 'Limit przepływu objętościowego',
    nozzle_temperature: 'Dysza',
    filament_prime_volume: 'Objętość zapłonowa',
    filament_vendor: 'Dostawca filamentu',
    filament_notes: 'Notatki filamentu'
  };
  var A_ARTEFAKT = {
    prime_tower_infill_gap: 1,
    prime_tower_rib_wall: 1
  };

  function wczytajLib(lib) {
    if (lib && lib.proc && lib.fil) return lib;
    if (global.P2S_ANALIZATOR_PROFILE && global.P2S_ANALIZATOR_PROFILE.proc) {
      return global.P2S_ANALIZATOR_PROFILE;
    }
    return {
      meta: { studio_wersja: '', ostrzezenie: 'brak biblioteki profili — nie porównuję wersji Studio.' },
      proc: {},
      fil: {}
    };
  }

  function aFirstVal(v) {
    if (v == null) return '';
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) {
        var s = String(v[i] == null ? '' : v[i]).trim();
        if (s && s !== 'nil') return s;
      }
      return v.length ? String(v[0] == null ? '' : v[0]) : '';
    }
    return String(v);
  }

  function aCfgAt(cfg, key, slot) {
    var v = cfg[key];
    if (v == null) return '';
    if (!Array.isArray(v)) return String(v);
    if (slot >= 1) {
      var idx = slot - 1;
      if (idx < v.length) {
        var s = String(v[idx] == null ? '' : v[idx]).trim();
        if (s && s !== 'nil') return s;
      }
    }
    return aFirstVal(v);
  }

  function aSplitDiff(s) {
    if (s == null) return [];
    return String(s).split(';').map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function aShowVal(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '—';
    if (s.length > 72) s = s.slice(0, 70) + '…';
    if (/^-?\d+\.\d+$/.test(s)) return s.replace('.', ',');
    return s;
  }

  function aEpsilon(progi) {
    var e = progi && progi.epsilon_rownosci;
    var n = Number(e);
    return isFinite(n) && n > 0 ? n : 1e-6;
  }

  function aSameVal(a, b, progi) {
    if (a == null || b == null) return false;
    var x = String(a).trim().replace(',', '.').toLowerCase();
    var y = String(b).trim().replace(',', '.').toLowerCase();
    if (!x || !y || x === '—' || y === '—') return false;
    if (x === y) return true;
    var nx = parseFloat(x), ny = parseFloat(y);
    return isFinite(nx) && isFinite(ny) && Math.abs(nx - ny) < aEpsilon(progi);
  }

  function aProcSysId(id, lib) {
    var s = String(id || '').trim();
    if (lib.proc[s]) return s;
    var t = s.replace(/\s+-\s+(Kopiuj|czapa)\s*$/i, '');
    return lib.proc[t] ? t : s;
  }

  function aKluczWLiscie(profil) {
    if (!profil) return {};
    var out = {};
    for (var k in profil) {
      if (!Object.prototype.hasOwnProperty.call(profil, k)) continue;
      if (META_KLUCZE[k]) continue;
      out[k] = 1;
    }
    return out;
  }

  /**
   * Liść → rodzice. Wartość z liścia nadpisuje rodzica.
   * zrodlo[k] = nazwa warstwy, z której wzięto klucz.
   */
  function aRozwiazProfil(id, tabela, lib) {
    lib = wczytajLib(lib);
    var store = tabela === 'fil' ? lib.fil : lib.proc;
    var values = {};
    var zrodlo = {};
    var lancuch = [];
    var seen = {};
    var cur = String(id || '').trim();
    var warstwy = [];
    while (cur && !seen[cur]) {
      seen[cur] = true;
      lancuch.push(cur);
      var p = store[cur];
      if (!p) break;
      warstwy.push({ id: cur, data: p });
      cur = p.inherits ? String(p.inherits).trim() : '';
    }
    for (var i = warstwy.length - 1; i >= 0; i--) {
      var d = warstwy[i].data;
      for (var k in d) {
        if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
        if (META_KLUCZE[k]) continue;
        values[k] = d[k];
        zrodlo[k] = warstwy[i].id;
      }
    }
    var lisc = warstwy.length ? aKluczWLiscie(warstwy[0].data) : {};
    return {
      values: values,
      zrodlo: zrodlo,
      lancuch: lancuch,
      liscKlucze: lisc,
      brakProfilu: warstwy.length === 0
    };
  }

  function aSysKlucz(resolved, key) {
    if (!resolved || resolved.values[key] == null) {
      return { sys: '', zrodlo: '', tylkoLancuch: false };
    }
    var z = resolved.zrodlo[key] || '';
    var naLiscie = !!(resolved.liscKlucze && resolved.liscKlucze[key]);
    return {
      sys: aFirstVal(resolved.values[key]),
      zrodlo: z,
      tylkoLancuch: !naLiscie && !!z
    };
  }

  function aWierszKlucza(rows, key) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].key === key) return rows[i];
    }
    return null;
  }

  function aPorownajWersjeStudio(lib, cfg) {
    var snap = (lib.meta && lib.meta.studio_wersja) || '';
    var plik = aFirstVal(cfg && cfg.version);
    if (!snap) {
      return {
        snapshot: '',
        plik: plik,
        porownanie: 'brak',
        ostrzezenie: 'Nie mam ostemplowanej wersji Studio w bibliotece profili — nie twierdzę, że tabela jest aktualna.'
      };
    }
    if (!plik) {
      return {
        snapshot: snap,
        plik: '',
        porownanie: 'brak',
        ostrzezenie: 'W 3MF nie ma pola version — nie porównuję ze snapshotem Studio ' + snap + '.'
      };
    }
    if (plik === snap) {
      return { snapshot: snap, plik: plik, porownanie: 'zgodne', ostrzezenie: '' };
    }
    return {
      snapshot: snap,
      plik: plik,
      porownanie: 'rozne',
      ostrzezenie: '3MF podaje Studio ' + plik + ', snapshot profili jest z ' + snap + ' — porównanie może być nieaktualne.'
    };
  }

  function aOcenUstawienia3mf(cfg, libOrOpts) {
    var lib = wczytajLib(libOrOpts && libOrOpts.proc ? libOrOpts : (libOrOpts && libOrOpts.lib));
    var progi = (libOrOpts && libOrOpts.progi) || (lib.meta && lib.meta.progi) || null;
    if (!cfg || typeof cfg !== 'object') {
      return {
        kind: 'brak_cfg', werdykt: 'brak ustawień',
        opis: 'W tym 3MF nie ma Metadata/project_settings.config — tylko geometria.',
        infill: null, flow: null, stopa: null, procId: '', filId: '', rows: [],
        hasLista: false, studio: aPorownajWersjeStudio(lib, null),
        procLancuch: [], filLancuch: []
      };
    }
    var printId = aFirstVal(cfg.print_settings_id);
    var filId = aFirstVal(cfg.filament_settings_id);
    var ig = Array.isArray(cfg.inherits_group) ? cfg.inherits_group : [];
    var procRef = aProcSysId((ig[0] && String(ig[0]).trim()) || printId, lib);
    var diffs = cfg.different_settings_to_system;
    var hasLista = Array.isArray(diffs);
    var procRoz = aRozwiazProfil(procRef, 'proc', lib);
    var rows = [];
    var hasProc = false, hasFil = false;
    var filRozCache = {};
    if (hasLista) {
      for (var slot = 0; slot < diffs.length; slot++) {
        var keys = aSplitDiff(diffs[slot]);
        if (!keys.length) continue;
        if (slot === 0) hasProc = true; else hasFil = true;
        var filRef = '';
        var roz = procRoz;
        if (slot >= 1) {
          filRef = (ig[slot] && String(ig[slot]).trim()) || '';
          if (!filRef) {
            var ids = cfg.filament_settings_id;
            filRef = Array.isArray(ids) && ids[slot - 1] ? String(ids[slot - 1]) : filId;
          }
          if (!lib.fil[filRef] && lib.fil[filId]) filRef = filId;
          if (!filRozCache[filRef]) filRozCache[filRef] = aRozwiazProfil(filRef, 'fil', lib);
          roz = filRozCache[filRef];
        }
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          var plik = aCfgAt(cfg, key, slot);
          var sk = aSysKlucz(roz, key);
          rows.push({
            slot: slot, key: key, plik: plik, sys: sk.sys,
            strona: slot === 0 ? 'model' : 'twoje',
            artefakt: !!A_ARTEFAKT[key],
            sysRef: slot === 0 ? procRef : filRef,
            sysZrodlo: sk.zrodlo,
            tylkoLancuch: sk.tylkoLancuch,
            dowod: 'ODCZYTANE'
          });
        }
      }
    }
    var flowSlot = 1;
    var flowRef = (ig[1] && String(ig[1]).trim()) || filId;
    if (!lib.fil[flowRef] && lib.fil[filId]) flowRef = filId;
    if (!filRozCache[flowRef]) filRozCache[flowRef] = aRozwiazProfil(flowRef, 'fil', lib);
    var filRoz = filRozCache[flowRef];

    function pakiet(key, plikVal, roz, fallbackStrona) {
      var row = aWierszKlucza(rows, key);
      var sk = aSysKlucz(roz, key);
      var strona = row ? row.strona : fallbackStrona;
      return {
        plik: plikVal,
        sys: sk.sys,
        sysZrodlo: sk.zrodlo,
        tylkoLancuch: sk.tylkoLancuch,
        strona: strona,
        dowod: row ? 'ODCZYTANE' : 'WYWNIOSKOWANE'
      };
    }

    var infillPlik = aFirstVal(cfg.sparse_infill_density);
    var flowPlik = aCfgAt(cfg, 'filament_flow_ratio', flowSlot) || aFirstVal(cfg.filament_flow_ratio);
    var stopaPlik = aFirstVal(cfg.elefant_foot_compensation);
    var infill = infillPlik ? pakiet('sparse_infill_density', infillPlik, procRoz, 'model') : null;
    var flow = flowPlik ? pakiet('filament_flow_ratio', flowPlik, filRoz, 'twoje') : null;
    var stopa = stopaPlik ? pakiet('elefant_foot_compensation', stopaPlik, procRoz, 'model') : null;

    var werdykt, opis, kind, werdyktDowod;
    if (!hasLista) {
      kind = 'brak_listy';
      werdykt = 'brak listy';
      werdyktDowod = 'ODCZYTANE';
      opis = 'W tym 3MF nie ma klucza different_settings_to_system — nie rozstrzygam, czyje to ustawienia.';
    } else if (hasProc && hasFil) {
      kind = 'mieszane';
      werdykt = 'mieszane';
      werdyktDowod = 'WYWNIOSKOWANE';
      opis = 'Proces odbiega od systemu (zwykle z pobranego modelu) i filament też (zwykle Twój profil).';
    } else if (hasProc) {
      kind = 'model';
      werdykt = 'ustawienia z modelu';
      werdyktDowod = 'WYWNIOSKOWANE';
      opis = 'Odstępstwa są tylko w procesie — typowo ustawienia przywiezione z pobranego 3MF.';
    } else if (hasFil) {
      kind = 'twoje';
      werdykt = 'Twoje';
      werdyktDowod = 'WYWNIOSKOWANE';
      opis = 'Odstępstwa są tylko w filamentcie — typowo Twój profil, nie autora modelu.';
    } else {
      kind = 'system';
      werdykt = 'jak system';
      werdyktDowod = 'WYWNIOSKOWANE';
      opis = 'Studio nie zaznaczyło odstępstw od profilu systemowego.';
    }
    return {
      kind: kind, werdykt: werdykt, opis: opis, hasLista: hasLista,
      werdyktDowod: werdyktDowod,
      infill: infill, flow: flow, stopa: stopa,
      procId: printId, filId: filId, procRef: procRef, filRef: flowRef,
      procLancuch: procRoz.lancuch, filLancuch: filRoz.lancuch,
      rows: rows, printer: aFirstVal(cfg.printer_model),
      studio: aPorownajWersjeStudio(lib, cfg),
      progi: { epsilon_rownosci: aEpsilon(progi) }
    };
  }

  var api = {
    aOcenUstawienia3mf: aOcenUstawienia3mf,
    aRozwiazProfil: aRozwiazProfil,
    aSysKlucz: aSysKlucz,
    aFirstVal: aFirstVal,
    aCfgAt: aCfgAt,
    aShowVal: aShowVal,
    aSameVal: aSameVal,
    aSplitDiff: aSplitDiff,
    A_KEY_PL: A_KEY_PL,
    A_ARTEFAKT: A_ARTEFAKT,
    wczytajLib: wczytajLib
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.P2S_ocenUstawienia3mf = aOcenUstawienia3mf;
  global.P2S_ANALIZATOR = api;
})(typeof window !== 'undefined' ? window : globalThis);
