/**
 * Faza 3 / 02 — pętla render→wizja po bramkach deterministycznych.
 * Stała kamera = WIDOKI z preview.js (izo/przód/bok/góra). Wizja NIGDY nie
 * kasuje FAIL bramki. Flaga off = ten sam werdykt co buildAndGate.
 * Progi z kryteria.json (wczytajPaczke). Etykieta [WYWNIOSKOWANE].
 */
(function (global) {
  'use strict';

  var LS = 'p2s.wizjaProjekt';
  var KODY = ['NAPIS_BELKA', 'NAPIS_POZA_OBRYSEM', 'TACA_BEZ_RANTU', 'STOJAK_BEZ_ZEBER'];
  var WIDOKI = {
    izo: { az: -35, el: 25, etykieta: 'izo' },
    przod: { az: 0, el: 0, etykieta: 'przód' },
    bok: { az: 90, el: 0, etykieta: 'bok' },
    gora: { az: 0, el: 90, etykieta: 'góra' }
  };

  var stan = { pack: null, wylacz: false };

  function num(v, d) {
    var n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  function progiZ(pack, extra) {
    var p = (pack && pack.progi) || {};
    var e = extra || {};
    return {
      max_iter: Math.max(1, num(e.max_iter, num(p.max_iter, 3))),
      max_chmura: Math.max(0, num(e.max_chmura, num(p.max_chmura, 1))),
      min_lapanych_z_4: num(e.min_lapanych_z_4, num(p.min_lapanych_z_4, 3)),
      siatka: Math.max(16, num(e.siatka, num(p.siatka, 96)))
    };
  }

  function flagaWlaczona() {
    if (stan.wylacz) return false;
    if (global.__P2S_WIZJA_PROJEKT === false) return false;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(LS) === '0') {
        return false;
      }
    } catch (e1) { /* deny */ }
    return true;
  }

  function ustawWizjeProjekt(on) {
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

  function foldPl(s) {
    return String(s || '').toLowerCase()
      .replace(/ł/g, 'l').replace(/ó/g, 'o').replace(/ą/g, 'a').replace(/ę/g, 'e')
      .replace(/ś/g, 's').replace(/ć/g, 'c').replace(/ń/g, 'n').replace(/[żź]/g, 'z');
  }

  function blobSpec(spec) {
    return foldPl([
      spec && spec.nazwa,
      spec && spec.opis_slowny,
      ((spec && spec.bryly) || []).map(function (b) { return b && b.id; }).join(' ')
    ].filter(Boolean).join(' '));
  }

  function jestTaca(spec) {
    var blob = blobSpec(spec);
    var wklad = /grzebien|stelaz|koszyk|insert|wklad|palec|zab-|ramie/.test(blob);
    return !wklad && /\btac[aeoy]|wanienk|rynienk|ociekacz/.test(blob);
  }

  function jestStojakZebrowany(spec) {
    var blob = blobSpec(spec);
    var jestStojak = /stojak|uchwyt|holder|kosz na |podajnik|rolk|recznik|papier/.test(blob);
    var chceZebra = /zeberk|zebrow|zebrowan|ribbed|zlobk/.test(blob);
    return !!(jestStojak && chceZebra);
  }

  function napisBryla(spec) {
    var bryly = (spec && spec.bryly) || [];
    var i;
    for (i = 0; i < bryly.length; i++) {
      if (bryly[i] && bryly[i].ksztalt && bryly[i].ksztalt.typ === 'napis') return bryly[i];
    }
    return null;
  }

  function obceNapis(spec) {
    var nap = napisBryla(spec);
    if (!nap) return [];
    return ((spec && spec.bryly) || []).filter(function (b) {
      return b && b !== nap && b.operacja === 'dodaj' && b.ksztalt && b.ksztalt.typ !== 'napis';
    });
  }

  function bboxMesh(mesh) {
    var b = mesh && mesh.bbox;
    if (!b) return null;
    var min = b.min || [0, 0, 0];
    var max = b.max || [b.x || 0, b.y || 0, b.z || 0];
    return {
      x: b.x != null ? b.x : (max[0] - min[0]),
      y: b.y != null ? b.y : (max[1] - min[1]),
      z: b.z != null ? b.z : (max[2] - min[2]),
      min: min,
      max: max
    };
  }

  function dot3(a, x, y, z) {
    return a[0] * x + a[1] * y + a[2] * z;
  }

  function kamera(widok) {
    var az = widok.az * Math.PI / 180;
    var el = widok.el * Math.PI / 180;
    var ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
    return {
      r: [ca, -sa, 0],
      u: [sa * se, ca * se, ce],
      f: [sa * ce, ca * ce, -se]
    };
  }

  /** Siatka zajęcia wierzchołków — bez canvas, stała kamera, deterministyczna. */
  function siatkaZajecia(mesh, widok, W, H) {
    W = W || 96;
    H = H || 96;
    var grid = new Uint8Array(W * H);
    if (!mesh || !mesh.vertProperties) return grid;
    var k = kamera(widok);
    var np = mesh.numProp || 3;
    var vp = mesh.vertProperties;
    var n = (vp.length / np) | 0;
    var i, x, y, z, a, b;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    var xs = new Float64Array(n);
    var ys = new Float64Array(n);
    for (i = 0; i < n; i++) {
      x = vp[i * np];
      y = vp[i * np + 1];
      z = vp[i * np + 2];
      a = dot3(k.r, x, y, z);
      b = dot3(k.u, x, y, z);
      xs[i] = a;
      ys[i] = b;
      if (a < minX) minX = a;
      if (a > maxX) maxX = a;
      if (b < minY) minY = b;
      if (b > maxY) maxY = b;
    }
    var dx = Math.max(maxX - minX, 1e-6);
    var dy = Math.max(maxY - minY, 1e-6);
    var pad = 1;
    var sx = (W - 2 * pad) / dx;
    var sy = (H - 2 * pad) / dy;
    var s = sx < sy ? sx : sy;
    var ox = pad - minX * s + ((W - 2 * pad) - dx * s) / 2;
    var oy = pad - minY * s + ((H - 2 * pad) - dy * s) / 2;
    var px, py, ix, iy;
    for (i = 0; i < n; i++) {
      px = xs[i] * s + ox;
      py = ys[i] * s + oy;
      ix = px | 0;
      iy = py | 0;
      if (ix >= 0 && iy >= 0 && ix < W && iy < H) grid[iy * W + ix] = 1;
    }
    return grid;
  }

  function hashSiatki(bytes) {
    var h = 2166136261;
    var i;
    for (i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  function renderDeterministyczny(mesh, opts) {
    opts = opts || {};
    var p = progiZ(stan.pack, opts);
    var W = p.siatka;
    var klucze = ['izo', 'przod', 'bok', 'gora'];
    var i, g, parts = [];
    var total = new Uint8Array(klucze.length * W * W);
    var off = 0;
    for (i = 0; i < klucze.length; i++) {
      g = siatkaZajecia(mesh, WIDOKI[klucze[i]], W, W);
      total.set(g, off);
      off += g.length;
      parts.push(hashSiatki(g));
    }
    return {
      kamera: WIDOKI,
      siatka: W,
      hash: hashSiatki(total),
      hashe: parts,
      zajete: (function () {
        var n = 0, j;
        for (j = 0; j < total.length; j++) n += total[j];
        return n;
      })()
    };
  }

  function gestoscPasaY(mesh, y0, y1, nBin) {
    var bb = bboxMesh(mesh);
    if (!bb || !mesh.vertProperties) return 0;
    var xmin = bb.min[0], dx = Math.max(bb.x, 1e-6);
    var bins = new Uint8Array(nBin);
    var vp = mesh.vertProperties, np = mesh.numProp || 3;
    var n = (vp.length / np) | 0;
    var i, x, y, b, on = 0;
    for (i = 0; i < n; i++) {
      y = vp[i * np + 1];
      if (y < y0 || y > y1) continue;
      x = vp[i * np];
      b = Math.floor((x - xmin) / dx * nBin);
      if (b < 0) b = 0;
      if (b >= nBin) b = nBin - 1;
      bins[b] = 1;
    }
    for (i = 0; i < nBin; i++) on += bins[i];
    return on / nBin;
  }

  function wizjaNapisBelka(mesh, spec) {
    var nap = napisBryla(spec);
    if (!nap) return false;
    var obce = obceNapis(spec);
    var h = (nap.ksztalt && nap.ksztalt.wysokosc_mm) || 32;
    var i, k, py, yMm, xMm;
    for (i = 0; i < obce.length; i++) {
      k = obce[i].ksztalt || {};
      py = ((obce[i].pozycja_mm) || [0, 0, 0])[1];
      yMm = k.y_mm || 0;
      xMm = k.x_mm || 0;
      if (k.typ === 'prostopadloscian' && xMm >= 80 && yMm <= 8 && py >= -2 && py <= h) {
        return true;
      }
    }
    var bb = bboxMesh(mesh);
    if (!bb) return false;
    var mostek = 3;
    var yLo = bb.min[1] + mostek + 4;
    var yHi = Math.min(bb.max[1] - 2, yLo + h * 0.45);
    if (yHi <= yLo) return false;
    return gestoscPasaY(mesh, yLo, yHi, 48) >= 0.72;
  }

  function wizjaNapisPoza(mesh, spec) {
    var nap = napisBryla(spec);
    if (!nap) return false;
    var maxSzer = (nap.ksztalt && nap.ksztalt.max_szer_mm) || 240;
    var bb = bboxMesh(mesh);
    if (bb && bb.x > maxSzer + 20) return true;
    var obce = obceNapis(spec);
    var i, k, xMm, px;
    for (i = 0; i < obce.length; i++) {
      k = obce[i].ksztalt || {};
      xMm = k.x_mm || k.srednica_dolna_mm || 0;
      px = ((obce[i].pozycja_mm) || [0, 0, 0])[0];
      if (xMm > maxSzer + 10) return true;
      if (px + xMm < -maxSzer / 2 - 12 || px > maxSzer / 2 + 12) return true;
    }
    return false;
  }

  function liczbaScianRantu(mesh) {
    var bb = bboxMesh(mesh);
    if (!bb || !mesh.vertProperties) return 0;
    var zMin = bb.min[2] + Math.max(8, bb.z * 0.32);
    var tol = 5;
    var yLo = bb.min[1] + Math.min(12, bb.y * 0.12);
    var yHi = bb.max[1] - Math.min(12, bb.y * 0.12);
    var xLo = bb.min[0] + Math.min(12, bb.x * 0.12);
    var xHi = bb.max[0] - Math.min(12, bb.x * 0.12);
    var sciany = [0, 0, 0, 0];
    var vp = mesh.vertProperties, np = mesh.numProp || 3;
    var n = (vp.length / np) | 0;
    var i, x, y, z;
    for (i = 0; i < n; i++) {
      z = vp[i * np + 2];
      if (z < zMin) continue;
      x = vp[i * np];
      y = vp[i * np + 1];
      if (Math.abs(x - bb.min[0]) < tol && y >= yLo && y <= yHi) sciany[0]++;
      if (Math.abs(x - bb.max[0]) < tol && y >= yLo && y <= yHi) sciany[1]++;
      if (Math.abs(y - bb.min[1]) < tol && x >= xLo && x <= xHi) sciany[2]++;
      if (Math.abs(y - bb.max[1]) < tol && x >= xLo && x <= xHi) sciany[3]++;
    }
    return sciany.filter(function (c) { return c >= 2; }).length;
  }

  function wizjaTaca(mesh, spec) {
    if (!jestTaca(spec)) return false;
    var bb = bboxMesh(mesh);
    if (!bb) return false;
    if (bb.z < 12) return true;
    var bryly = (spec && spec.bryly) || [];
    var studnia = bryly.some(function (b) {
      var k = b && b.ksztalt;
      return b && b.operacja === 'odejmij' && k && k.typ === 'prostopadloscian'
        && (k.x_mm || 0) > 40 && (k.y_mm || 0) > 40;
    });
    if (studnia) return false;
    var ranty = bryly.filter(function (b) {
      var k = b && b.ksztalt;
      if (!b || b.operacja === 'odejmij' || !k) return false;
      return k.typ === 'prostopadloscian' && (k.z_mm || 0) > 8
        && ((k.x_mm || 0) <= 8 || (k.y_mm || 0) <= 8);
    });
    if (ranty.length >= 4) return false;
    if (liczbaScianRantu(mesh) >= 4) return false;
    return ranty.length < 4;
  }

  function liczbaWybrzuszen(mesh) {
    var bb = bboxMesh(mesh);
    if (!bb || !mesh.vertProperties) return 0;
    var cx = (bb.min[0] + bb.max[0]) / 2;
    var cy = (bb.min[1] + bb.max[1]) / 2;
    var vp = mesh.vertProperties, np = mesh.numProp || 3;
    var n = (vp.length / np) | 0;
    var B = 72;
    var maxR = [];
    var i, r, a, b, med, peaks, prev, vals;
    for (i = 0; i < B; i++) maxR[i] = 0;
    for (i = 0; i < n; i++) {
      r = Math.hypot(vp[i * np] - cx, vp[i * np + 1] - cy);
      if (r < 1) continue;
      a = Math.atan2(vp[i * np + 1] - cy, vp[i * np] - cx);
      b = ((a + Math.PI) / (2 * Math.PI) * B) | 0;
      if (b < 0) b = 0;
      if (b >= B) b = B - 1;
      if (r > maxR[b]) maxR[b] = r;
    }
    vals = maxR.filter(function (x) { return x > 1; }).sort(function (p, q) { return p - q; });
    if (!vals.length) return 0;
    med = vals[vals.length >> 1];
    peaks = 0;
    for (i = 0; i < B; i++) {
      prev = maxR[(i + B - 1) % B] > med + 0.7;
      if (maxR[i] > med + 0.7 && !prev) peaks++;
    }
    return peaks;
  }

  function wizjaStojak(mesh, spec) {
    if (!jestStojakZebrowany(spec)) return false;
    return liczbaWybrzuszen(mesh) < 6;
  }

  var TEKSTY = {
    NAPIS_BELKA: 'Wizja (stała kamera): belka przez litery — [WYWNIOSKOWANE]. Usuń bryłę w poprzek napisu.',
    NAPIS_POZA_OBRYSEM: 'Wizja (stała kamera): dodatek wystaje poza obrys napisu — [WYWNIOSKOWANE].',
    TACA_BEZ_RANTU: 'Wizja (stała kamera): taca bez rantu dookoła — [WYWNIOSKOWANE].',
    STOJAK_BEZ_ZEBER: 'Wizja (stała kamera): stojak obiecuje żebra, siatka ich nie ma — [WYWNIOSKOWANE].'
  };

  function ocenWizjaProjekt(mesh, spec, opts) {
    opts = opts || {};
    var kody = [];
    var render = null;
    try {
      render = renderDeterministyczny(mesh, opts);
    } catch (e) {
      render = { hash: null, blad: String((e && e.message) || e) };
    }
    if (wizjaNapisBelka(mesh, spec)) kody.push('NAPIS_BELKA');
    if (wizjaNapisPoza(mesh, spec)) kody.push('NAPIS_POZA_OBRYSEM');
    if (wizjaTaca(mesh, spec)) kody.push('TACA_BEZ_RANTU');
    if (wizjaStojak(mesh, spec)) kody.push('STOJAK_BEZ_ZEBER');
    return {
      kody: kody,
      teksty: TEKSTY,
      render: render,
      dowod: 'WYWNIOSKOWANE',
      kamera: WIDOKI
    };
  }

  function bledyBramki(preview) {
    var wp = (preview && preview.werdykt && preview.werdykt.wpisy) || [];
    return wp.filter(function (w) { return w && w.poziom === 'blad'; });
  }

  function scalWerdykt(gateWpisy, wizjaKody, gateFail) {
    var merged = (gateWpisy || []).slice();
    var i, k;
    for (i = 0; i < (wizjaKody || []).length; i++) {
      k = wizjaKody[i];
      if (!merged.some(function (w) { return w.kod === k && w.poziom === 'blad'; })) {
        merged.push({
          poziom: 'blad',
          kod: k,
          tekst: TEKSTY[k] || k,
          dowod: 'WYWNIOSKOWANE'
        });
      }
    }
    var fail = !!gateFail || merged.some(function (w) { return w.poziom === 'blad'; });
    if (gateFail) fail = true;
    return { wpisy: merged, eksportOk: !fail, gateFail: !!gateFail };
  }

  /**
   * Bramki ZAWSZE pierwsze. Wizja nie kasuje FAIL.
   * max_iter 2–3, max +1 chmura. Flaga off = sam buduj, bez ocen.
   */
  async function petlaWizjaProjekt(args) {
    args = args || {};
    var spec = args.spec;
    var buduj = args.buduj;
    var chmura = args.chmura;
    var flaga = args.flaga;
    if (flaga == null) flaga = flagaWlaczona();
    var p = progiZ(stan.pack, args);
    var maxIter = p.max_iter;
    var maxChmura = p.max_chmura;
    var wylaczBramki = args.wylaczBramki || [];
    var ocen = args.ocen || ocenWizjaProjekt;
    var cloudCalls = 0;
    var hist = [];
    var i, preview, gate, wizja, scalone, last;
    var optsBuduj = wylaczBramki.length ? { wylaczBramki: wylaczBramki } : (args.optsBuduj || {});

    for (i = 0; i < maxIter; i++) {
      preview = typeof buduj === 'function' ? buduj(spec, optsBuduj) : args.preview;
      gate = bledyBramki(preview);
      var gateFail = gate.length > 0
        || (preview && preview.werdykt && preview.werdykt.eksportOk === false && gate.length > 0);
      if (preview && preview.werdykt && preview.werdykt.eksportOk === false) {
        gateFail = gateFail || gate.length > 0;
      }
      gateFail = gate.length > 0;

      wizja = { kody: [], pominieto: true };
      if (flaga) {
        try {
          wizja = ocen(preview && preview.mesh, spec, args) || { kody: [] };
          wizja.pominieto = false;
        } catch (e) {
          wizja = {
            kody: [],
            pominieto: true,
            powod: 'blad_wizji',
            etykieta: 'wizja niedostępna — tylko bramki',
            blad: String((e && e.message) || e)
          };
        }
      }

      scalone = scalWerdykt(
        (preview && preview.werdykt && preview.werdykt.wpisy) || [],
        flaga && !wizja.pominieto ? (wizja.kody || []) : [],
        gateFail
      );
      last = {
        preview: preview,
        werdykt: scalone,
        eksportOk: scalone.eksportOk,
        gateFail: gateFail,
        gateKody: gate.map(function (w) { return w.kod; }),
        wizja: wizja,
        cloudCalls: cloudCalls,
        iteracje: i + 1,
        flaga: !!flaga
      };
      hist.push({
        iter: i,
        gateKody: last.gateKody.slice(),
        wizjaKody: (wizja.kody || []).slice(),
        eksportOk: last.eksportOk
      });
      last.hist = hist;

      if (gateFail) {
        last.powod = 'bramka';
        last.eksportOk = false;
        last.werdykt.eksportOk = false;
        return last;
      }
      if (!flaga || wizja.pominieto || !(wizja.kody && wizja.kody.length)) {
        last.powod = flaga ? 'ok' : 'wylacz';
        return last;
      }
      if (cloudCalls >= maxChmura || typeof chmura !== 'function') {
        last.powod = 'wizja';
        last.eksportOk = false;
        last.werdykt.eksportOk = false;
        return last;
      }
      cloudCalls += 1;
      spec = await chmura(spec, wizja);
    }
    last.powod = 'limit';
    last.cloudCalls = cloudCalls;
    last.eksportOk = false;
    last.werdykt.eksportOk = false;
    return last;
  }

  var api = {
    KODY: KODY,
    WIDOKI: WIDOKI,
    LS: LS,
    progiZ: progiZ,
    flagaWlaczona: flagaWlaczona,
    ustawWizjeProjekt: ustawWizjeProjekt,
    wczytajPaczke: wczytajPaczke,
    siatkaZajecia: siatkaZajecia,
    renderDeterministyczny: renderDeterministyczny,
    ocenWizjaProjekt: ocenWizjaProjekt,
    petlaWizjaProjekt: petlaWizjaProjekt,
    scalWerdykt: scalWerdykt,
    liczbaScianRantu: liczbaScianRantu,
    liczbaWybrzuszen: liczbaWybrzuszen,
    jestTaca: jestTaca,
    jestStojakZebrowany: jestStojakZebrowany
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.P2S = global.P2S || {};
  Object.assign(global.P2S, {
    ocenWizjaProjekt: ocenWizjaProjekt,
    petlaWizjaProjekt: petlaWizjaProjekt,
    ustawWizjeProjekt: ustawWizjeProjekt,
    flagaWizjaProjekt: flagaWlaczona,
    renderDeterministyczny: renderDeterministyczny,
    WIDOKI_WIZJA: WIDOKI
  });
})(typeof window !== 'undefined' ? window : globalThis);
