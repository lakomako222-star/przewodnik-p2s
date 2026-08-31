/**
 * Faza 2 / 04 — odczyt LAN MQTT (tylko status). Zero poleceń.
 * Kontrakt 2: APK P2SNative.statusDrukarki. PWA / flaga off = jak dziś.
 * Progi i mapowanie spd_lvl z kryteria.json (przez sidecar albo pack testowy).
 */
(function (global) {
  'use strict';

  var KONTRAKT = '2';
  var PORT = 8883;
  var TEMAT = 'device/#';
  var USER = 'bblp';
  var LS = 'p2s.drukarkaLan';
  var czekaj = {};
  var packProgi = null;

  function num(v, d) {
    var n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  function wczytajPaczke(p) {
    packProgi = p || null;
    return !!(packProgi && packProgi.id === 'T-34');
  }

  function progi() {
    var p = packProgi || {};
    return {
      kontrakt: String(p.kontrakt || KONTRAKT),
      port: num(p.port, PORT),
      temat: String(p.temat || TEMAT),
      user: String(p.user || USER),
      timeout_ms: num(p.timeout_ms, 8000),
      spd_lvl: p.spd_lvl || { 1: 'silent', 2: 'standard', 3: 'sport', 4: 'ludicrous' },
      hosty_ok: p.hosty_ok || [],
      hosty_zle: p.hosty_zle || []
    };
  }

  function octetowIPv4(host) {
    var s = String(host || '').trim();
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)) return null;
    var p = s.split('.');
    var o = [];
    for (var i = 0; i < 4; i++) {
      var n = Number(p[i]);
      if (!Number.isInteger(n) || n < 0 || n > 255) return null;
      o.push(n);
    }
    return o;
  }

  /** RFC1918 literal IPv4 only. Hostname, loopback, public, IPv6 = nie. */
  function hostDozwolonyLan(host) {
    var o = octetowIPv4(host);
    if (!o) return false;
    if (o[0] === 10) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
    return false;
  }

  function serialOk(s) {
    return /^[A-Za-z0-9_-]{6,32}$/.test(String(s || ''));
  }

  var ZAKAZ_KLUCZE = [
    'publish', 'command', 'gcode', 'gcode_file', 'print_speed',
    'pause', 'resume', 'stop', 'request', 'ams_control', 'ledctrl'
  ];

  function odrzucPublish(cfg) {
    if (!cfg || typeof cfg !== 'object') return 'cfg';
    if (cfg.temat && /request/i.test(String(cfg.temat))) return 'temat request';
    var k;
    for (k in cfg) {
      if (!Object.prototype.hasOwnProperty.call(cfg, k)) continue;
      var kl = String(k).toLowerCase();
      if (ZAKAZ_KLUCZE.indexOf(kl) >= 0) return k;
      if (kl.indexOf('publish') >= 0 || kl.indexOf('command') >= 0) return k;
    }
    if (cfg.metoda && String(cfg.metoda).toLowerCase() !== 'subscribe') return 'metoda';
    return null;
  }

  function czytajLs() {
    try {
      if (typeof localStorage === 'undefined') return {};
      return JSON.parse(localStorage.getItem(LS) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function zapiszLs(obj) {
    var cur = czytajLs();
    var n = Object.assign({}, cur, obj || {});
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(LS, JSON.stringify(n));
    } catch (e) { /* deny */ }
    return n;
  }

  function flagaWlaczona() {
    if (global.__P2S_LAN_ODCZYT === false) return false;
    var z = czytajLs();
    if (z.wlacz === false || z.wlacz === 0 || z.wlacz === '0') return false;
    return z.wlacz === true || z.wlacz === 1 || z.wlacz === '1';
  }

  function ustawLanOdczyt(on) {
    zapiszLs({ wlacz: !!on });
    return flagaWlaczona();
  }

  function maMostek() {
    return !!(global.P2SNative && typeof global.P2SNative.statusDrukarki === 'function');
  }

  global.__p2sStatusDrukarkiCb = function (id, wynik) {
    var fn = czekaj[id];
    if (!fn) return;
    delete czekaj[id];
    fn(wynik && typeof wynik === 'object' ? wynik : { ok: false, powod: 'mostek' });
  };

  function trybZSpd(lvl, mapa) {
    var k = String(lvl);
    var m = mapa || progi().spd_lvl;
    return m[k] || m[lvl] || null;
  }

  function taceAms(ams) {
    var out = [];
    if (!ams) return out;
    var jednostki = Array.isArray(ams.ams) ? ams.ams : (Array.isArray(ams) ? ams : []);
    for (var i = 0; i < jednostki.length; i++) {
      var u = jednostki[i] || {};
      var tace = Array.isArray(u.tray) ? u.tray : [];
      var t = [];
      for (var j = 0; j < tace.length; j++) {
        var tr = tace[j] || {};
        t.push({
          id: String(tr.id != null ? tr.id : j),
          typ: tr.tray_type || tr.type || '',
          pozostalo: tr.remain != null ? num(tr.remain, null) : null,
          kolor: tr.tray_color || ''
        });
      }
      out.push({
        id: String(u.id != null ? u.id : i),
        wilgoc: u.humidity != null ? String(u.humidity) : '',
        temp_C: u.temp != null ? num(u.temp, null) : null,
        tace: t
      });
    }
    return out;
  }

  function parsujRaport(raw) {
    var obj = raw;
    if (typeof raw === 'string') {
      try { obj = JSON.parse(raw); } catch (e) {
        return { ok: false, powod: 'json', dowod: 'ODCZYTANE' };
      }
    }
    if (!obj || typeof obj !== 'object') {
      return { ok: false, powod: 'pusty', dowod: 'ODCZYTANE' };
    }
    var pr = obj.print || obj;
    if (!pr || typeof pr !== 'object') {
      return { ok: false, powod: 'pusty', dowod: 'ODCZYTANE' };
    }
    var pg = progi();
    var lvl = pr.spd_lvl != null ? num(pr.spd_lvl, null) : null;
    var tryb = lvl != null ? trybZSpd(lvl, pg.spd_lvl) : null;
    return {
      ok: true,
      kontrakt: pg.kontrakt,
      temat: pg.temat,
      tryb: tryb,
      spd_lvl: lvl,
      gcode_state: pr.gcode_state ? String(pr.gcode_state) : '',
      postep_pct: pr.mc_percent != null ? num(pr.mc_percent, null) : null,
      min_zostalo: pr.mc_remaining_time != null ? num(pr.mc_remaining_time, null) : null,
      dysza_C: pr.nozzle_temper != null ? num(pr.nozzle_temper, null) : null,
      stol_C: pr.bed_temper != null ? num(pr.bed_temper, null) : null,
      komora_C: pr.chamber_temper != null ? num(pr.chamber_temper, null) : null,
      ams: taceAms(pr.ams),
      dowod: 'ODCZYTANE'
    };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function htmlChipSport(st) {
    if (!st || !st.ok) return '';
    var czesci = ['[' + (st.dowod || 'ODCZYTANE') + ']'];
    if (st.tryb) czesci.push('tryb ' + st.tryb);
    else if (st.spd_lvl != null) czesci.push('spd_lvl ' + st.spd_lvl);
    if (st.dysza_C != null) czesci.push('dysza ' + Math.round(st.dysza_C) + ' °C');
    if (st.stol_C != null) czesci.push('stół ' + Math.round(st.stol_C) + ' °C');
    if (st.postep_pct != null) czesci.push('postęp ' + Math.round(st.postep_pct) + ' %');
    if (st.ams && st.ams.length) czesci.push('AMS ' + st.ams.length);
    return '<span class="tnote p2s-lan-chip">' + esc(czesci.join(' · ')) + '</span><br>';
  }

  function cfgDoMostka() {
    var pg = progi();
    var z = czytajLs();
    var cfg = {
      kontrakt: pg.kontrakt,
      host: String(z.host || '').trim(),
      port: pg.port,
      user: pg.user,
      haslo: String(z.haslo || z.kod || '').trim(),
      serial: String(z.serial || '').trim(),
      temat: pg.temat,
      timeout_ms: pg.timeout_ms,
      metoda: 'subscribe'
    };
    return cfg;
  }

  function walidujCfg(cfg) {
    var pg = progi();
    if (!cfg || cfg.kontrakt !== pg.kontrakt) return { ok: false, powod: 'kontrakt' };
    var zakaz = odrzucPublish(cfg);
    if (zakaz) return { ok: false, powod: 'zakaz', szczegol: zakaz };
    if (num(cfg.port, 0) !== pg.port) return { ok: false, powod: 'port' };
    if (!hostDozwolonyLan(cfg.host)) return { ok: false, powod: 'host poza allowlistą' };
    if (cfg.serial && !serialOk(cfg.serial)) return { ok: false, powod: 'serial' };
    if (cfg.temat && cfg.temat !== pg.temat && !/^device\/[A-Za-z0-9_-]+\/report$/.test(cfg.temat)) {
      return { ok: false, powod: 'temat' };
    }
    return { ok: true };
  }

  function wezStatus(opcje) {
    opcje = opcje || {};
    var pg = progi();
    if (!flagaWlaczona() && !opcje.wymusz) {
      return Promise.resolve({ ok: false, powod: 'wylacz', dowod: 'WYWNIOSKOWANE' });
    }
    if (!maMostek()) {
      return Promise.resolve({
        ok: false,
        powod: 'apk',
        etykieta: 'bez mostka APK — pytam jak dziś',
        dowod: 'WYWNIOSKOWANE'
      });
    }
    var cfg = Object.assign({}, cfgDoMostka(), opcje.cfg || {});
    cfg.kontrakt = pg.kontrakt;
    cfg.port = pg.port;
    cfg.temat = pg.temat;
    cfg.user = pg.user;
    cfg.metoda = 'subscribe';
    var w = walidujCfg(cfg);
    if (!w.ok) return Promise.resolve(w);
    if (!cfg.haslo) {
      return Promise.resolve({ ok: false, powod: 'brak', dowod: 'WYWNIOSKOWANE' });
    }
    return new Promise(function (resolve) {
      var id = 'm' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      czekaj[id] = function (wynik) {
        if (!wynik || !wynik.ok) {
          resolve({
            ok: false,
            powod: (wynik && wynik.powod) || 'brak',
            dowod: 'WYWNIOSKOWANE'
          });
          return;
        }
        var parsed = parsujRaport(wynik.raport || wynik.body || wynik.print || wynik);
        resolve(parsed);
      };
      try {
        global.P2SNative.statusDrukarki(pg.kontrakt, JSON.stringify(cfg), id);
      } catch (e) {
        delete czekaj[id];
        resolve({ ok: false, powod: 'mostek', dowod: 'WYWNIOSKOWANE' });
      }
    });
  }

  function doradcaWzbogacSport(n, id, rysuj) {
    if (!n) { if (rysuj) rysuj(n); return; }
    if (rysuj) rysuj(n);
    if (!flagaWlaczona() || !maMostek()) return;
    wezStatus({ cisza: true }).then(function (st) {
      if (!st || !st.ok) return;
      var chip = htmlChipSport(st);
      if (!chip) return;
      rysuj({
        t: n.t,
        b: chip + (n.b || ''),
        ref: n.ref,
        ok: n.ok,
        no: n.no
      });
    });
  }

  function bindUi() {
    var host = document.getElementById && document.getElementById('lanHost');
    var ser = document.getElementById && document.getElementById('lanSerial');
    var kod = document.getElementById && document.getElementById('lanKod');
    var wl = document.getElementById && document.getElementById('lanWlacz');
    var btn = document.getElementById && document.getElementById('lanTest');
    var out = document.getElementById && document.getElementById('lanOut');
    if (!host && !wl) return;
    var z = czytajLs();
    if (host && z.host) host.value = z.host;
    if (ser && z.serial) ser.value = z.serial;
    if (kod && z.haslo) kod.value = z.haslo;
    if (wl) wl.checked = flagaWlaczona();
    function zbierz() {
      return zapiszLs({
        host: host ? host.value.trim() : z.host,
        serial: ser ? ser.value.trim() : z.serial,
        haslo: kod ? kod.value.trim() : z.haslo,
        wlacz: wl ? !!wl.checked : flagaWlaczona()
      });
    }
    if (wl) wl.addEventListener('change', zbierz);
    [host, ser, kod].forEach(function (el) {
      if (el) el.addEventListener('change', zbierz);
    });
    if (btn) {
      btn.addEventListener('click', function () {
        zbierz();
        if (out) out.textContent = 'Czytam status (tylko odczyt)…';
        wezStatus({ wymusz: true }).then(function (st) {
          if (!out) return;
          if (!st.ok) {
            out.textContent = 'Brak odczytu: ' + (st.powod || 'brak') +
              '. Doradca w węźle Sport pyta jak dziś.';
            return;
          }
          out.textContent = htmlChipSport(st).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        });
      });
    }
  }

  var api = {
    KONTRAKT: KONTRAKT,
    PORT: PORT,
    TEMAT: TEMAT,
    USER: USER,
    wczytajPaczke: wczytajPaczke,
    progi: progi,
    hostDozwolonyLan: hostDozwolonyLan,
    serialOk: serialOk,
    odrzucPublish: odrzucPublish,
    walidujCfg: walidujCfg,
    parsujRaport: parsujRaport,
    htmlChipSport: htmlChipSport,
    flagaWlaczona: flagaWlaczona,
    ustawLanOdczyt: ustawLanOdczyt,
    maMostek: maMostek,
    wezStatus: wezStatus,
    doradcaWzbogacSport: doradcaWzbogacSport,
    czytajLs: czytajLs,
    zapiszLs: zapiszLs,
    cfgDoMostka: cfgDoMostka
  };

  global.P2S = global.P2S || {};
  Object.assign(global.P2S, {
    hostDozwolonyLan: hostDozwolonyLan,
    parsujRaportDrukarki: parsujRaport,
    wezStatusDrukarki: wezStatus,
    doradcaWzbogacSport: doradcaWzbogacSport,
    ustawLanOdczyt: ustawLanOdczyt
  });

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUi);
    else bindUi();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
