/**
 * Faza 1 / 05 — lokalna pierwsza ocena zdjęcia wydruku.
 * ONNX (Apache-2.0) tylko przy WebGPU. Klasa FDM = najbliższy prototyp z sidecara.
 * Progi z kryteria.json (przez sidecar). Brak GPU → chmura, klasyfikator się nie odpala.
 */
(function (global) {
  'use strict';

  var stan = {
    pack: null,
    sesja: null,
    ortLadowane: false,
    wylacz: false,
    powod: 'brak_paczki',
    etykieta: 'lokalnie niedostępne — chmura'
  };

  function num(v, d) {
    var n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  function progiZ(pack, extra) {
    var p = (pack && pack.progi) || {};
    var e = extra || {};
    return {
      prog_pewnosci: num(e.prog_pewnosci, num(p.prog_pewnosci, 0.22)),
      wymaga_webgpu: !!(e.wymaga_webgpu != null ? e.wymaga_webgpu : (p.wymaga_webgpu != null ? p.wymaga_webgpu : true)),
      siatka: num(e.siatka, num(p.siatka, 8))
    };
  }

  function maWebGPU(nav) {
    try {
      var n = nav || (typeof navigator !== 'undefined' ? navigator : null);
      return !!(n && n.gpu);
    } catch (e) {
      return false;
    }
  }

  function flagaWlaczona() {
    if (stan.wylacz) return false;
    if (global.__P2S_OCENA_LOK === false) return false;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('p2s.ocenaLok') === '0') {
        return false;
      }
    } catch (e1) { /* deny */ }
    return true;
  }

  function ustawOceneLok(on) {
    stan.wylacz = !on;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('p2s.ocenaLok', on ? '1' : '0');
      }
    } catch (e) { /* ignore */ }
    return stanBramki({ gpu: true, pack: stan.pack });
  }

  function l2(v) {
    var s = 0, i;
    for (i = 0; i < v.length; i++) s += v[i] * v[i];
    return Math.sqrt(s);
  }

  function normalizuj(v) {
    var n = l2(v);
    var o = new Float64Array(v.length);
    var i;
    if (!n) return o;
    for (i = 0; i < v.length; i++) o[i] = v[i] / n;
    return o;
  }

  function kosinus(a, b) {
    var s = 0, i, n = Math.min(a.length, b.length);
    for (i = 0; i < n; i++) s += a[i] * b[i];
    return s;
  }

  function softmax2(a, b) {
    var ma = a > b ? a : b;
    var ea = Math.exp(a - ma);
    var eb = Math.exp(b - ma);
    var d = ea + eb;
    return [ea / d, eb / d];
  }

  /**
   * Deskryptor: 8×8 RGB (wyśrodkowane, L2) + cechy barwy/krawędzi (L2).
   * Dwie jednostki — cosine ≈ ½ przestrzeń + ½ barwa. rgb: w*h*3 RGB.
   */
  function wektorObrazu(rgb, w, h, siatka) {
    var g = siatka || 8;
    var spatN = g * g * 3;
    var v = new Float64Array(spatN);
    var cw = Math.max(1, Math.floor(w / g));
    var ch = Math.max(1, Math.floor(h / g));
    var counts = new Float64Array(g * g);
    var x, y, i, cx, cy, cell, off, r, gv, b, lum, dx, dy, prev;
    var n = w * h;
    var edgeH = 0, edgeV = 0, hf = 0, lumSum = 0, lumSq = 0, dark = 0;
    var rSum = 0, gSum = 0, bSum = 0, orange = 0;
    for (y = 0; y < h; y++) {
      cy = Math.min(g - 1, Math.floor(y / ch));
      for (x = 0; x < w; x++) {
        cx = Math.min(g - 1, Math.floor(x / cw));
        i = (y * w + x) * 3;
        r = rgb[i]; gv = rgb[i + 1]; b = rgb[i + 2];
        cell = cy * g + cx;
        v[cell * 3] += r;
        v[cell * 3 + 1] += gv;
        v[cell * 3 + 2] += b;
        counts[cell] += 1;
        lum = (r + gv + b) / 3;
        lumSum += lum;
        lumSq += lum * lum;
        rSum += r; gSum += gv; bSum += b;
        if (lum < 40) dark++;
        if (r > gv + 20 && r > b + 20 && r > 90) orange++;
        if (x > 0) {
          prev = rgb[i - 3] + rgb[i - 2] + rgb[i - 1];
          dx = Math.abs((r + gv + b) - prev);
          edgeH += dx;
          if (dx > 80) hf++;
        }
        if (y > 0) {
          off = ((y - 1) * w + x) * 3;
          dy = Math.abs((r + gv + b) - (rgb[off] + rgb[off + 1] + rgb[off + 2]));
          edgeV += dy;
          if (dy > 80) hf++;
        }
      }
    }
    for (i = 0; i < g * g; i++) {
      if (counts[i] > 0) {
        v[i * 3] /= counts[i] * 255;
        v[i * 3 + 1] /= counts[i] * 255;
        v[i * 3 + 2] /= counts[i] * 255;
      }
    }
    var spatMean = 0;
    for (i = 0; i < spatN; i++) spatMean += v[i];
    spatMean /= spatN;
    var spat = new Float64Array(spatN);
    for (i = 0; i < spatN; i++) spat[i] = v[i] - spatMean;
    spat = normalizuj(spat);
    var mean = lumSum / n;
    var col = normalizuj([
      (rSum / n) / 255,
      (gSum / n) / 255,
      (bSum / n) / 255,
      dark / n,
      orange / n,
      edgeH / (n * 255 * 3),
      edgeV / (n * 255 * 3),
      hf / n,
      Math.sqrt(Math.max(0, lumSq / n - mean * mean)) / 255
    ]);
    var out = new Float64Array(spat.length + col.length);
    out.set(spat, 0);
    out.set(col, spat.length);
    return normalizuj(out);
  }

  function klasyPack(pack) {
    return (pack && pack.klasy) || [];
  }

  function etykietaKlasy(pack, id) {
    var k = klasyPack(pack);
    var i;
    for (i = 0; i < k.length; i++) {
      if (k[i].id === id) return k[i].etykieta || id;
    }
    return id;
  }

  function listyW(p) {
    var out = [], i, src;
    if (!p) return out;
    src = (p.w_list && p.w_list.length) ? p.w_list : (p.w ? [p.w] : []);
    for (i = 0; i < src.length; i++) {
      out.push(src[i] instanceof Float64Array ? src[i] : Float64Array.from(src[i]));
    }
    return out;
  }

  function najblizszyPrototyp(wektor, pack) {
    var proto = (pack && pack.prototypy) || {};
    var klasy = klasyPack(pack);
    var i, t, id, listy, arr, cos, bestCos, best = null, second = -2;
    for (i = 0; i < klasy.length; i++) {
      id = klasy[i].id;
      listy = listyW(proto[id]);
      if (!listy.length) continue;
      bestCos = -2;
      for (t = 0; t < listy.length; t++) {
        arr = listy[t];
        cos = kosinus(wektor, arr);
        if (cos > bestCos) bestCos = cos;
      }
      if (!best || bestCos > best.cos) {
        if (best) second = best.cos;
        best = { id: id, cos: bestCos, etykieta: klasy[i].etykieta || id };
      } else if (bestCos > second) {
        second = bestCos;
      }
    }
    if (!best) return null;
    best.second = second < -1 ? -1 : second;
    return best;
  }

  function pewnoscZCos(best, prog) {
    if (!best) return 0;
    var margin = best.cos - (best.second > -1 ? best.second : 0);
    var p = (best.cos + 1) / 2;
    if (margin > 0) p = Math.min(1, p + margin * 0.25);
    if (prog > 1) return p;
    return p;
  }

  function ocenZWektora(wektor, pack, logits, extraProgi) {
    var progi = progiZ(pack, extraProgi);
    var best = najblizszyPrototyp(wektor, pack);
    var pFail = null;
    var onnxKlasa = null;
    if (logits && logits.length >= 2) {
      var sm = softmax2(logits[0], logits[1]);
      var map = (pack && pack.id2label_onnx) || { '0': 'normal', '1': 'failure' };
      onnxKlasa = sm[1] >= sm[0] ? (map['1'] || 'failure') : (map['0'] || 'normal');
      pFail = sm[1];
    }
    if (!best) {
      return {
        tryb: 'lokalnie',
        klasa: null,
        etykieta_klasy: null,
        pewnosc: 0,
        dowod: 'WYWNIOSKOWANE',
        niska: true,
        onnx_klasa: onnxKlasa,
        p_failure: pFail,
        powod: 'brak_prototypow'
      };
    }
    var pew = pewnoscZCos(best, progi.prog_pewnosci);
    if (pew > 1) pew = 1;
    if (pew < 0) pew = 0;
    var niska = pew < progi.prog_pewnosci;
    return {
      tryb: 'lokalnie',
      klasa: best.id,
      etykieta_klasy: best.etykieta,
      pewnosc: pew,
      cos: best.cos,
      dowod: 'WYWNIOSKOWANE',
      niska: niska,
      prog_pewnosci: progi.prog_pewnosci,
      onnx_klasa: onnxKlasa,
      p_failure: pFail
    };
  }

  function tekstWerdyktu(wyn) {
    if (!wyn) return '';
    if (wyn.tryb !== 'lokalnie') {
      return wyn.etykieta || 'lokalnie niedostępne — chmura';
    }
    var et = wyn.etykieta_klasy || wyn.klasa || 'nieznane';
    var pew = typeof wyn.pewnosc === 'number' ? wyn.pewnosc.toFixed(2).replace('.', ',') : '?';
    return 'lokalnie: wygląda na ' + et + ', pewność ' + pew + ' [' + (wyn.dowod || 'WYWNIOSKOWANE') + ']';
  }

  function opisDegradacji(powod) {
    if (powod === 'brak_webgpu') {
      return 'Brak WebGPU — klasyfikator się nie odpala. Chmura wymaga sieci i klucza OpenRouter.';
    }
    if (powod === 'wylacznik') {
      return 'Lokalna ocena wyłączona. Chmura wymaga sieci i klucza OpenRouter.';
    }
    if (powod === 'brak_paczki' || powod === 'brak_modelu') {
      return 'Brak lokalnego modelu. Chmura wymaga sieci i klucza OpenRouter.';
    }
    return 'Lokalnie niedostępne — chmura. Chmura wymaga sieci i klucza OpenRouter.';
  }

  function stanBramki(opts) {
    opts = opts || {};
    var pack = opts.pack !== undefined ? opts.pack : stan.pack;
    var progi = progiZ(pack, opts.progi);
    var gpu = opts.gpu != null ? !!opts.gpu : maWebGPU(opts.navigator);
    if (!flagaWlaczona()) {
      return {
        ok: false,
        tryb: 'chmura',
        powod: 'wylacznik',
        etykieta: 'lokalnie niedostępne — chmura',
        dowod: 'ODCZYTANE',
        opis_degradacji: opisDegradacji('wylacznik'),
        odpala_klasyfikator: false
      };
    }
    if (progi.wymaga_webgpu && !gpu) {
      return {
        ok: false,
        tryb: 'chmura',
        powod: 'brak_webgpu',
        etykieta: 'lokalnie niedostępne — chmura',
        dowod: 'WYWNIOSKOWANE',
        opis_degradacji: opisDegradacji('brak_webgpu'),
        odpala_klasyfikator: false
      };
    }
    if (!pack) {
      return {
        ok: false,
        tryb: 'chmura',
        powod: 'brak_paczki',
        etykieta: 'lokalnie niedostępne — chmura',
        dowod: 'WYWNIOSKOWANE',
        opis_degradacji: opisDegradacji('brak_paczki'),
        odpala_klasyfikator: false
      };
    }
    return {
      ok: true,
      tryb: 'lokalnie',
      powod: '',
      etykieta: 'lokalna pierwsza ocena',
      dowod: 'WYWNIOSKOWANE',
      odpala_klasyfikator: true
    };
  }

  function wczytajPaczke(obj) {
    if (!obj || obj.v !== 1 || !obj.prototypy || !obj.klasy) {
      stan.pack = null;
      stan.powod = 'zla_paczka';
      return false;
    }
    stan.pack = obj;
    stan.powod = '';
    return true;
  }

  function wczytajSidecar(url, fetchFn) {
    var f = fetchFn || (typeof fetch === 'function' ? fetch : null);
    if (!f) return Promise.resolve(false);
    return f(url).then(function (res) {
      if (!res || !res.ok) throw new Error('http');
      return res.json();
    }).then(function (j) {
      return wczytajPaczke(j);
    }).catch(function () {
      stan.pack = null;
      stan.powod = 'blad_wczytania';
      return false;
    });
  }

  function chwZRgb(rgb, w, h, bgr) {
    var out = new Float32Array(1 * 3 * h * w);
    var x, y, i, r, g, b, p;
    var scale = 1 / 255;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = (y * w + x) * 3;
        r = rgb[i] * scale;
        g = rgb[i + 1] * scale;
        b = rgb[i + 2] * scale;
        p = y * w + x;
        if (bgr) {
          out[0 * h * w + p] = b;
          out[1 * h * w + p] = g;
          out[2 * h * w + p] = r;
        } else {
          out[0 * h * w + p] = r;
          out[1 * h * w + p] = g;
          out[2 * h * w + p] = b;
        }
      }
    }
    return out;
  }

  function budujPrototypy(klasyRgb, siatka) {
    var out = {};
    var id, lista, i, acc, wek, j, n, wlist;
    for (id in klasyRgb) {
      if (!Object.prototype.hasOwnProperty.call(klasyRgb, id)) continue;
      lista = klasyRgb[id] || [];
      n = lista.length;
      if (!n) continue;
      acc = null;
      wlist = [];
      for (i = 0; i < n; i++) {
        wek = wektorObrazu(lista[i].rgb, lista[i].w, lista[i].h, siatka);
        wlist.push(Array.from(wek));
        if (!acc) acc = new Float64Array(wek.length);
        for (j = 0; j < wek.length; j++) acc[j] += wek[j];
      }
      for (j = 0; j < acc.length; j++) acc[j] /= n;
      out[id] = { w: Array.from(normalizuj(acc)), w_list: wlist, n: n };
    }
    return out;
  }

  function uruchomSesje(chw, opts) {
    if (opts && typeof opts.infer === 'function') {
      return opts.infer(chw);
    }
    if (stan.sesja && typeof stan.sesja.run === 'function') {
      var inp = (stan.pack && stan.pack.preprocess && stan.pack.preprocess.input) || 'pixel_values';
      var ort = global.ort;
      var tensor = (ort && ort.Tensor)
        ? new ort.Tensor('float32', chw, [1, 3, 256, 256])
        : chw;
      var feeds = {};
      feeds[inp] = tensor;
      return stan.sesja.run(feeds).then(function (res) {
        var k, t;
        for (k in res) {
          if (!res[k]) continue;
          t = res[k].data || res[k];
          if (t && t.length >= 2) return { logits: [t[0], t[1]] };
        }
        return { logits: null };
      });
    }
    return Promise.reject(new Error('brak_sesji'));
  }

  function ocenRgb(rgb, w, h, opts) {
    opts = opts || {};
    var bramka = stanBramki(opts);
    if (!bramka.ok) {
      return Promise.resolve({
        tryb: 'chmura',
        powod: bramka.powod,
        etykieta: bramka.etykieta,
        dowod: bramka.dowod,
        opis_degradacji: bramka.opis_degradacji,
        odpala_klasyfikator: false,
        klasa: null,
        pewnosc: 0
      });
    }
    var pack = opts.pack || stan.pack;
    var progi = progiZ(pack, opts.progi);
    var wek = wektorObrazu(rgb, w, h, progi.siatka);
    var poInfer = function (logits) {
      var out = ocenZWektora(wek, pack, logits, progi);
      out.odpala_klasyfikator = true;
      return out;
    };
    if (opts.pominOnnx) {
      return Promise.resolve(poInfer(null));
    }
    var prep = (pack && pack.preprocess) || {};
    var chw = chwZRgb(rgb, w, h, prep.bgr !== false);
    return Promise.resolve()
      .then(function () { return uruchomSesje(chw, opts); })
      .then(function (inf) {
        var logits = inf && inf.logits ? inf.logits : inf;
        return poInfer(logits);
      })
      .catch(function () {
        var out = ocenZWektora(wek, pack, null, progi);
        out.odpala_klasyfikator = true;
        out.onnx_blad = true;
        return out;
      });
  }

  function rysuj256(img) {
    var s = 256;
    var c = document.createElement('canvas');
    c.width = s;
    c.height = s;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var scale = s / Math.min(w, h);
    var nw = w * scale;
    var nh = h * scale;
    ctx.drawImage(img, (s - nw) / 2, (s - nh) / 2, nw, nh);
    var data = ctx.getImageData(0, 0, s, s).data;
    var rgb = new Uint8Array(s * s * 3);
    var i, j = 0;
    for (i = 0; i < data.length; i += 4) {
      rgb[j++] = data[i];
      rgb[j++] = data[i + 1];
      rgb[j++] = data[i + 2];
    }
    return { rgb: rgb, w: s, h: s };
  }

  function dataUrlDoRgb(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(rysuj256(img)); };
      img.onerror = function () { reject(new Error('obraz')); };
      img.src = url;
    });
  }

  function ladujSkrypt(src) {
    return new Promise(function (resolve, reject) {
      if (global.ort) { resolve(); return; }
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('ort_skrypt')); };
      document.head.appendChild(s);
    });
  }

  function utworzSesje() {
    var ort = global.ort;
    if (!ort || !ort.InferenceSession) return Promise.reject(new Error('brak_ort'));
    if (stan.sesja) return Promise.resolve(stan.sesja);
    var model = (stan.pack && stan.pack.model && stan.pack.model.plik) || 'modele/ocena-zdjecia.onnx';
    if (ort.env && ort.env.wasm) {
      ort.env.wasm.wasmPaths = 'vendor/ort/';
      ort.env.wasm.numThreads = 1;
    }
    return ort.InferenceSession.create(model, { executionProviders: ['webgpu'] }).then(function (s) {
      stan.sesja = s;
      if (s.inputNames && s.inputNames[0] && stan.pack) {
        stan.pack.preprocess = stan.pack.preprocess || {};
        stan.pack.preprocess.input = s.inputNames[0];
      }
      return s;
    });
  }

  function ensureOrt(opts) {
    if (opts && (opts.infer || opts.pominOnnx)) return Promise.resolve();
    if (typeof document === 'undefined') return Promise.resolve();
    var p = global.ort ? Promise.resolve() : ladujSkrypt('vendor/ort/ort.webgpu.min.js');
    return p.then(utworzSesje).catch(function () { return null; });
  }

  function ocenZdjecie(dataUrl, opts) {
    opts = opts || {};
    var bramka = stanBramki(opts);
    if (!bramka.ok) {
      return Promise.resolve({
        tryb: 'chmura',
        powod: bramka.powod,
        etykieta: bramka.etykieta,
        dowod: bramka.dowod,
        opis_degradacji: bramka.opis_degradacji,
        odpala_klasyfikator: false,
        klasa: null,
        pewnosc: 0
      });
    }
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('ocenZdjecie wymaga przeglądarki — w teście użyj ocenRgb'));
    }
    return ensureOrt(opts).then(function () {
      return dataUrlDoRgb(dataUrl);
    }).then(function (im) {
      return ocenRgb(im.rgb, im.w, im.h, opts);
    });
  }

  var api = {
    maWebGPU: maWebGPU,
    flagaWlaczona: flagaWlaczona,
    ustawOceneLok: ustawOceneLok,
    progiZ: progiZ,
    wektorObrazu: wektorObrazu,
    normalizuj: normalizuj,
    kosinus: kosinus,
    softmax2: softmax2,
    ocenZWektora: ocenZWektora,
    ocenRgb: ocenRgb,
    ocenZdjecie: ocenZdjecie,
    stanBramki: stanBramki,
    wczytajPaczke: wczytajPaczke,
    wczytajSidecar: wczytajSidecar,
    budujPrototypy: budujPrototypy,
    tekstWerdyktu: tekstWerdyktu,
    opisDegradacji: opisDegradacji,
    chwZRgb: chwZRgb,
    etykietaKlasy: etykietaKlasy,
    uruchomSesje: uruchomSesje,
    stan: function () {
      return {
        ma_paczke: !!stan.pack,
        wylacz: stan.wylacz,
        powod: stan.powod
      };
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.P2S = global.P2S || {};
  Object.assign(global.P2S, {
    ocenZdjecie: ocenZdjecie,
    ocenZdjecieRgb: ocenRgb,
    ocenZWektora: ocenZWektora,
    stanBramkiOceny: stanBramki,
    ustawOceneLok: ustawOceneLok,
    tekstWerdyktuOceny: tekstWerdyktu,
    wczytajPaczkeOceny: wczytajPaczke,
    wczytajSidecarOceny: wczytajSidecar,
    wektorObrazuOceny: wektorObrazu
  });

  if (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) {
    var src = document.currentScript.src;
    var url = src.replace(/ocena-zdjecia\.js(\?.*)?$/, 'ocena-zdjecia.json');
    wczytajSidecar(url);
  }
})(typeof window !== 'undefined' ? window : globalThis);
