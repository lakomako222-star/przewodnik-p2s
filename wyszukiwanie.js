/**
 * Hybryda słów + semantyka pojęć (Faza 1 / 03).
 * Progi i hasła z kryteria.json → sidecar. Brak sidecara = same słowa.
 */
(function (global) {
  'use strict';

  var stan = {
    sem: false,
    powod: 'brak_wektorow',
    etykieta: 'Szukam po słowach',
    dowod_trybu: 'WYWNIOSKOWANE',
    pack: null,
    wylacz: false
  };

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l').replace(/ń/g, 'n')
      .replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
  }

  function isHeadingOnly(r) {
    var body = (r && r[3] || '').trim();
    var sub = (r && r[2] || '').trim();
    var chapter = (r && r[1] || '').trim();
    return body === (sub || chapter);
  }

  function forms(t) {
    var a = [t];
    if (t.length >= 7) a.push(t.slice(0, t.length - 2));
    else if (t.length >= 5) a.push(t.slice(0, t.length - 1));
    return a;
  }

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function maHaslo(textNorm, haslo) {
    if (!haslo || !textNorm) return false;
    var re = new RegExp('(^|[^a-z0-9])' + escapeRe(haslo) + '[a-z0-9]*');
    return re.test(textNorm);
  }

  /* Krótkie spójniki — bez nich AND w lexPrzewodnik zeruje „jaki profil do PETG”. */
  var STOP = {
    jaki: 1, jaka: 1, jakie: 1, jak: 1,
    do: 1, na: 1, w: 1, z: 1, i: 1, o: 1, a: 1, u: 1, we: 1, ze: 1,
    od: 1, po: 1, za: 1, mi: 1, sie: 1,
    czy: 1, ten: 1, ta: 1, to: 1, tym: 1, tej: 1, te: 1,
    the: 1, for: 1, of: 1, and: 1, or: 1, mnie: 1
  };

  function termyLex(raw, minLen) {
    var min = minLen == null ? 1 : minLen;
    return norm(raw).split(/[^a-z0-9]+/).filter(function (t) {
      return t.length >= min && !STOP[t];
    });
  }

  function zbudujMacierz(pojecia, spec) {
    var dim = pojecia.length;
    var M = new Array(dim);
    var ids = {};
    var i, j, pary, a, b, w;
    for (i = 0; i < dim; i++) {
      ids[pojecia[i].id] = i;
      M[i] = new Float64Array(dim);
      M[i][i] = 1;
    }
    pary = (spec && spec.pary) || [];
    for (j = 0; j < pary.length; j++) {
      a = ids[pary[j][0]];
      b = ids[pary[j][1]];
      w = Number(pary[j][2]);
      if (a == null || b == null || a === b || !Number.isFinite(w)) continue;
      M[a][b] = w;
      M[b][a] = w;
    }
    return M;
  }

  function podobienstwo(q, d, M) {
    if (!M || !M.length) return kosinus(q, d);
    var dim = Math.min(q.length, d.length, M.length);
    var s = 0, i, j, acc;
    for (i = 0; i < dim; i++) {
      acc = 0;
      for (j = 0; j < dim; j++) acc += M[i][j] * d[j];
      s += q[i] * acc;
    }
    return s;
  }

  function progiZ(pack, extra) {
    var p = (pack && pack.progi) || {};
    var e = extra || {};
    return {
      waga_semantyki: num(e.waga_semantyki, num(p.waga_semantyki, 0.62)),
      waga_slow: num(e.waga_slow, num(p.waga_slow, 0.38)),
      prog_podobienstwa: num(e.prog_podobienstwa, num(p.prog_podobienstwa, 0.28)),
      wzor_kodu: e.wzor_kodu || p.wzor_kodu || '[0-9]{3,}[-–][0-9]{3,}',
      wymaga_webgpu: !!(e.wymaga_webgpu != null ? e.wymaga_webgpu : p.wymaga_webgpu)
    };
  }

  function num(v, d) {
    var n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  function jestKod(q, wzor) {
    try {
      return new RegExp(wzor).test(String(q || ''));
    } catch (e) {
      return false;
    }
  }

  function maWebGPU() {
    try {
      return !!(global.navigator && global.navigator.gpu);
    } catch (e) {
      return false;
    }
  }

  function semantykaDozwolona() {
    if (stan.wylacz) return false;
    if (global.__P2S_SZUKAJ_SEM === false) return false;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('p2s.szukajSem') === '0') {
        return false;
      }
    } catch (e1) { /* offline / deny */ }
    return true;
  }

  function ustawSemantyke(on) {
    stan.wylacz = !on;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('p2s.szukajSem', on ? '1' : '0');
      }
    } catch (e) { /* ignore */ }
    if (!on) {
      stan.etykieta = 'Szukam po słowach — semantyka wyłączona';
      stan.dowod_trybu = 'ODCZYTANE';
      stan.powod = 'wylacznik';
    } else if (stan.pack) {
      odswiezEtykiete(true, '');
    }
    return stanSzukania();
  }

  function odswiezEtykiete(sem, powod) {
    stan.sem = !!sem;
    stan.powod = powod || '';
    if (sem) {
      stan.etykieta = 'Szukam po słowach i znaczeniu';
      stan.dowod_trybu = 'WYWNIOSKOWANE';
    } else {
      stan.etykieta = powod === 'wylacznik'
        ? 'Szukam po słowach — semantyka wyłączona'
        : 'Szukam po słowach — semantyka niedostępna';
      stan.dowod_trybu = powod === 'wylacznik' ? 'ODCZYTANE' : 'WYWNIOSKOWANE';
    }
  }

  function stanSzukania() {
    return {
      sem: stan.sem && semantykaDozwolona(),
      powod: stan.powod,
      etykieta: stan.etykieta,
      dowod_trybu: stan.dowod_trybu,
      ma_paczke: !!stan.pack
    };
  }

  function wektorZHasel(textNorm, pojecia) {
    var dim = pojecia.length;
    var v = new Float64Array(dim);
    var i, j, h, n;
    for (i = 0; i < dim; i++) {
      h = pojecia[i].hasla || [];
      n = 0;
      for (j = 0; j < h.length; j++) {
        if (maHaslo(textNorm, norm(h[j]))) n++;
      }
      v[i] = n;
    }
    return v;
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

  function kwantyzujInt8(wektory) {
    var n = wektory.length;
    var dim = n ? wektory[0].length : 0;
    var raw = new Int8Array(n * dim);
    var skala = new Array(n);
    var i, j, mx, s, q;
    for (i = 0; i < n; i++) {
      mx = 0;
      for (j = 0; j < dim; j++) {
        if (Math.abs(wektory[i][j]) > mx) mx = Math.abs(wektory[i][j]);
      }
      s = mx > 0 ? mx / 127 : 1;
      skala[i] = s;
      for (j = 0; j < dim; j++) {
        q = Math.round(wektory[i][j] / s);
        if (q > 127) q = 127;
        if (q < -127) q = -127;
        raw[i * dim + j] = q;
      }
    }
    return { raw: raw, skala: skala, dim: dim, n: n };
  }

  function dekwantWiersz(pack, i) {
    var dim = pack.dim;
    var s = pack.skala[i] || 1;
    var o = new Float64Array(dim);
    var base = i * dim;
    var j;
    var src = pack.raw;
    for (j = 0; j < dim; j++) o[j] = src[base + j] * s;
    return o;
  }

  function b64zInt8(arr) {
    var u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    var chunk = 0x8000;
    var parts = [];
    var i;
    for (i = 0; i < u8.length; i += chunk) {
      parts.push(String.fromCharCode.apply(null, u8.subarray(i, i + chunk)));
    }
    return (typeof btoa === 'function' ? btoa : bufBtoa)(parts.join(''));
  }

  function bufBtoa(bin) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bin, 'binary').toString('base64');
    throw new Error('brak btoa');
  }

  function int8zB64(b64) {
    var bin;
    if (typeof atob === 'function') bin = atob(b64);
    else if (typeof Buffer !== 'undefined') bin = Buffer.from(b64, 'base64').toString('binary');
    else throw new Error('brak atob');
    var u8 = new Uint8Array(bin.length);
    var i;
    for (i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Int8Array(u8.buffer, u8.byteOffset, u8.byteLength);
  }

  function budujPaczke(DATA, kryWysz, meta) {
    var pojecia = (kryWysz && kryWysz.pojecia) || [];
    var dim = pojecia.length;
    var n = DATA.length;
    var vecs = new Array(n);
    var i, r, txt;
    for (i = 0; i < n; i++) {
      r = DATA[i];
      if (isHeadingOnly(r)) {
        vecs[i] = new Float64Array(dim);
        continue;
      }
      txt = norm((r[1] || '') + ' ' + (r[2] || '') + ' ' + (r[3] || ''));
      vecs[i] = normalizuj(wektorZHasel(txt, pojecia));
    }
    var q = kwantyzujInt8(vecs);
    return {
      v: 1,
      kwant: 'int8',
      dim: q.dim,
      n: q.n,
      guide_n: n,
      skala: q.skala,
      wektory_b64: b64zInt8(q.raw),
      pojecia: pojecia,
      macierz: {
        pary: ((kryWysz.macierz_pokrewienstwa && kryWysz.macierz_pokrewienstwa.pary) || []).slice()
      },
      progi: {
        waga_semantyki: kryWysz.waga_semantyki,
        waga_slow: kryWysz.waga_slow,
        prog_podobienstwa: kryWysz.prog_podobienstwa,
        wzor_kodu: kryWysz.wzor_kodu,
        wymaga_webgpu: !!kryWysz.wymaga_webgpu
      },
      meta: meta || {}
    };
  }

  function wczytajPaczke(obj) {
    if (!obj || obj.v !== 1 || obj.kwant !== 'int8' || !obj.wektory_b64) {
      odswiezEtykiete(false, 'zla_paczka');
      stan.pack = null;
      return false;
    }
    var raw = int8zB64(obj.wektory_b64);
    if (raw.length !== obj.n * obj.dim) {
      odswiezEtykiete(false, 'zla_paczka');
      stan.pack = null;
      return false;
    }
    stan.pack = {
      dim: obj.dim,
      n: obj.n,
      skala: obj.skala,
      raw: raw,
      pojecia: obj.pojecia || [],
      progi: obj.progi || {},
      M: zbudujMacierz(obj.pojecia || [], obj.macierz || {})
    };
    if (!semantykaDozwolona()) {
      odswiezEtykiete(false, 'wylacznik');
      return true;
    }
    if (stan.pack.progi.wymaga_webgpu && !maWebGPU()) {
      odswiezEtykiete(false, 'brak_webgpu');
      return true;
    }
    odswiezEtykiete(true, '');
    return true;
  }

  function zrzucPaczke(powod) {
    stan.pack = null;
    odswiezEtykiete(false, powod || 'brak_wektorow');
  }

  function wczytajWektory(url, fetchFn) {
    var f = fetchFn || (typeof fetch === 'function' ? fetch : null);
    if (!f) {
      zrzucPaczke('brak_fetch');
      return Promise.resolve(false);
    }
    return f(url).then(function (res) {
      if (!res || !res.ok) throw new Error('http');
      return res.json();
    }).then(function (j) {
      return wczytajPaczke(j);
    }).catch(function () {
      zrzucPaczke('blad_wczytania');
      return false;
    });
  }

  function przygotujSEARCH(DATA) {
    return DATA.map(function (r) {
      return { chapter: norm(r[1]), sub: norm(r[2]), body: norm(r[3]) };
    });
  }

  function lexPrzewodnik(raw, DATA, SEARCH) {
    var terms = termyLex(raw, 1);
    var phrase = norm(raw);
    var hits = [];
    var i, j, ok, f, t, inBody, inSub, inChapter, score, direct, r;
    if (!SEARCH || SEARCH.length !== DATA.length) SEARCH = przygotujSEARCH(DATA);
    for (i = 0; i < SEARCH.length; i++) {
      if (isHeadingOnly(DATA[i])) continue;
      f = SEARCH[i];
      score = 0;
      direct = 0;
      ok = true;
      for (j = 0; j < terms.length; j++) {
        t = terms[j];
        inBody = f.body.indexOf(t) >= 0;
        inSub = f.sub.indexOf(t) >= 0;
        inChapter = f.chapter.indexOf(t) >= 0;
        if (!inBody && !inSub && !inChapter) { ok = false; break; }
        if (inBody) { score += 6; direct++; }
        if (inSub) { score += 8; direct++; }
        if (inChapter) score += 1;
      }
      if (ok && direct > 0) {
        r = DATA[i];
        if (f.body.indexOf(phrase) >= 0) score += 5;
        if (f.sub.indexOf(phrase) >= 0) score += 7;
        score = score / (1 + Math.log(1 + r[3].length / 500));
        hits.push({ score: score, i: i, hitT: terms.length, lex: true });
      }
    }
    hits.sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    return { hits: hits, terms: terms, phrase: phrase };
  }

  function lexAsystent(raw, DATA) {
    var terms = termyLex(raw, 3);
    var phrase = norm(raw).trim();
    var hits = [];
    var hitTermsMax = 0;
    var i, j, k, score, hitT, directT, f, inBody, inSub, inChapter, GH, GS, GB;
    if (!terms.length) return { hits: [], terms: terms, phrase: phrase, hitTermsMax: 0 };
    for (i = 0; i < DATA.length; i++) {
      if (isHeadingOnly(DATA[i])) continue;
      score = 0;
      hitT = 0;
      directT = 0;
      GH = norm(DATA[i][1]);
      GS = norm(DATA[i][2]);
      GB = norm(DATA[i][3]);
      for (j = 0; j < terms.length; j++) {
        f = forms(terms[j]);
        inBody = false;
        inSub = false;
        inChapter = false;
        for (k = 0; k < f.length; k++) {
          if (!inBody && GB.indexOf(f[k]) >= 0) inBody = true;
          if (!inSub && GS.indexOf(f[k]) >= 0) inSub = true;
          if (!inChapter && GH.indexOf(f[k]) >= 0) inChapter = true;
        }
        if (!inBody && !inSub && !inChapter) continue;
        hitT++;
        if (inBody) { score += 6; directT++; }
        if (inSub) { score += 8; directT++; }
        if (inChapter) score += 1;
      }
      if (directT > 0) {
        if (GB.indexOf(phrase) >= 0) score += 5;
        if (GS.indexOf(phrase) >= 0) score += 7;
        if (hitT > hitTermsMax) hitTermsMax = hitT;
        hits.push({
          score: score / (1 + Math.log(1 + DATA[i][3].length / 400)),
          i: i,
          hitT: hitT,
          lex: true
        });
      }
    }
    hits.sort(function (a, b) { return b.score - a.score; });
    return { hits: hits, terms: terms, phrase: phrase, hitTermsMax: hitTermsMax };
  }

  function czySem() {
    if (!stan.pack || !semantykaDozwolona()) return false;
    if (stan.pack.progi && stan.pack.progi.wymaga_webgpu && !maWebGPU()) {
      odswiezEtykiete(false, 'brak_webgpu');
      return false;
    }
    return stan.sem;
  }

  function semScores(raw, DATA, progi) {
    var pack = stan.pack;
    var qv = normalizuj(wektorZHasel(norm(raw), pack.pojecia));
    if (l2(qv) === 0) return null;
    var n = Math.min(pack.n, DATA.length);
    var out = new Float64Array(DATA.length);
    var i, dv, c;
    for (i = 0; i < n; i++) {
      if (isHeadingOnly(DATA[i])) continue;
      dv = dekwantWiersz(pack, i);
      c = podobienstwo(qv, dv, pack.M);
      if (c >= progi.prog_podobienstwa) out[i] = c;
    }
    return out;
  }

  function scal(lexHits, sem, DATA, progi) {
    var wS = progi.waga_semantyki;
    var wL = progi.waga_slow;
    var maxLex = 0;
    var i, h, lexN, cos, seen, out;
    for (i = 0; i < lexHits.length; i++) {
      if (lexHits[i].score > maxLex) maxLex = lexHits[i].score;
    }
    seen = {};
    out = [];
    for (i = 0; i < lexHits.length; i++) {
      h = lexHits[i];
      cos = sem && sem[h.i] ? sem[h.i] : 0;
      lexN = maxLex > 0 ? h.score / maxLex : 0;
      out.push({
        score: wL * lexN + wS * cos,
        i: h.i,
        hitT: h.hitT,
        lex: true,
        cos: cos,
        dowod: 'ODCZYTANE'
      });
      seen[h.i] = 1;
    }
    if (sem) {
      for (i = 0; i < DATA.length; i++) {
        if (seen[i] || isHeadingOnly(DATA[i])) continue;
        cos = sem[i] || 0;
        if (cos < progi.prog_podobienstwa) continue;
        out.push({
          score: wS * cos,
          i: i,
          hitT: 0,
          lex: false,
          cos: cos,
          dowod: 'WYWNIOSKOWANE'
        });
      }
    }
    out.sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    return out;
  }

  function wzbogac(hits, DATA) {
    return hits.map(function (h) {
      var r = DATA[h.i];
      return {
        score: h.score,
        i: h.i,
        id: r[0],
        chapter: r[1],
        sub: r[2],
        body: r[3],
        row: r,
        hitT: h.hitT,
        lex: !!h.lex,
        cos: h.cos || 0,
        dowod: h.dowod || (h.lex ? 'ODCZYTANE' : 'WYWNIOSKOWANE')
      };
    });
  }

  function szukajHybryda(raw, DATA, opts) {
    opts = opts || {};
    var tryb = opts.tryb === 'asystent' ? 'asystent' : 'przewodnik';
    var progi = progiZ(stan.pack, opts.progi);
    var lex = tryb === 'asystent'
      ? lexAsystent(raw, DATA)
      : lexPrzewodnik(raw, DATA, opts.SEARCH);
    var kod = jestKod(raw, progi.wzor_kodu);
    var uzyjSem = !kod && !opts.tylkoSlowa && czySem();
    var sem = uzyjSem ? semScores(raw, DATA, progi) : null;
    var merged = uzyjSem ? scal(lex.hits, sem, DATA, progi) : lex.hits.map(function (h) {
      return {
        score: h.score, i: h.i, hitT: h.hitT, lex: true, cos: 0, dowod: 'ODCZYTANE'
      };
    });
    var limit = opts.limit || (tryb === 'asystent' ? 10 : 80);
    var hits = wzbogac(merged.slice(0, limit), DATA);
    var etykieta = kod
      ? 'Szukam po dokładnym kodzie'
      : (uzyjSem ? 'Szukam po słowach i znaczeniu' : stan.etykieta);
    var dowodTrybu = kod ? 'ODCZYTANE' : (uzyjSem ? 'WYWNIOSKOWANE' : stan.dowod_trybu);
    var chunks = [];
    var used = {};
    var chars = 0;
    var i, r, sig;
    if (tryb === 'asystent') {
      for (i = 0; i < merged.length && chunks.length < (opts.limit || 10); i++) {
        r = DATA[merged[i].i];
        sig = r[0] + '|' + r[3].slice(0, 40);
        if (used[sig]) continue;
        used[sig] = 1;
        if (chars + r[3].length > 6000) continue;
        chars += r[3].length;
        chunks.push(r);
      }
    }
    return {
      hits: hits,
      chunks: chunks,
      best: merged.length ? merged[0].score : 0,
      hitTerms: lex.hitTermsMax || 0,
      terms: lex.terms.length,
      termList: lex.terms,
      tryb: uzyjSem ? 'hybryda' : 'slowa',
      etykieta: etykieta,
      dowod_trybu: dowodTrybu,
      kod: kod
    };
  }

  function szukajPrzewodnik(raw, DATA, SEARCH) {
    return szukajHybryda(raw, DATA, { tryb: 'przewodnik', SEARCH: SEARCH, limit: 80 });
  }

  function szukajAsystent(raw, DATA, opts) {
    opts = opts || {};
    return szukajHybryda(raw, DATA, { tryb: 'asystent', limit: opts.limit || 10 });
  }

  function szukajSlowami(raw, DATA, opts) {
    opts = Object.assign({}, opts, { tylkoSlowa: true });
    return szukajHybryda(raw, DATA, opts);
  }

  var api = {
    norm: norm,
    isHeadingOnly: isHeadingOnly,
    maHaslo: maHaslo,
    wektorZHasel: wektorZHasel,
    budujPaczke: budujPaczke,
    wczytajPaczke: wczytajPaczke,
    zbudujMacierz: zbudujMacierz,
    podobienstwo: podobienstwo,
    zrzucPaczke: zrzucPaczke,
    wczytajWektory: wczytajWektory,
    ustawSemantyke: ustawSemantyke,
    stanSzukania: stanSzukania,
    szukajHybryda: szukajHybryda,
    szukajPrzewodnik: szukajPrzewodnik,
    szukajAsystent: szukajAsystent,
    szukajSlowami: szukajSlowami,
    lexPrzewodnik: lexPrzewodnik,
    lexAsystent: lexAsystent
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.P2S = global.P2S || {};
  Object.assign(global.P2S, api);

  if (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) {
    var src = document.currentScript.src;
    var url = src.replace(/wyszukiwanie\.js(\?.*)?$/, 'wektory-przewodnik.json');
    wczytajWektory(url);
  }
})(typeof window !== 'undefined' ? window : globalThis);
