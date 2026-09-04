/**
 * Przeróbka 4.2 — detektor / operacje / bramka w przeglądarce (ten sam kod co Node).
 * Manifold z window.P2S.initEngine(), fflate.unzipSync, P2S.luzMm.
 */
(function () {
'use strict';
const unzipSync = (...a) => {
  const z = globalThis.fflate;
  if (!z || typeof z.unzipSync !== 'function') throw new Error('brak fflate.unzipSync');
  return z.unzipSync(...a);
};
const luzMm = (...a) => {
  if (!window.P2S || typeof window.P2S.luzMm !== 'function')
    throw new Error('brak P2S.luzMm');
  return window.P2S.luzMm(...a);
};
/**
 * Przeróbka 4.2 — detektor cech walcowych, operacje, bramka.
 * Manifold liczy geometrię. LLM nie podaje średnic z siebie.
 * Rezerwa (bez kodu): szczelina, kieszen_prostokatna, grubosc_scianki, czop, wymiar_gabarytowy.
 */

const KOM_USZKODZONY =
  'Ten plik nie jest zamkniętą bryłą i nie da się go bezpiecznie przerobić. ' +
  'Otwórz go w Bambu Studio albo w Meshmixerze, użyj naprawy modelu, zapisz i wróć tutaj. ' +
  'Nie naprawiam plików sam, bo naprawa zmienia geometrię, a wtedy wymiary, które ci podam, nie byłyby twoje.';

const RODZAJE_V1 = ['gniazdo_walcowe', 'wzor_otworow', 'czop_walcowy'];
const RODZAJE_REZERWA = ['szczelina', 'kieszen_prostokatna', 'grubosc_scianki', 'czop', 'wymiar_gabarytowy'];

const OSIE = { x: [0, 1, 2], y: [1, 2, 0], z: [2, 0, 1] };
/**
 * Próg drukowalnej ścianki ma JEDEN korzeń — SCIANKA_DRUKOWALNA_MM w gate.js.
 * Bez własnej liczby zapasowej: cicha kopia rozjechałaby się po wydruku kuponu 6.15
 * i wtedy Projekt z Przerobem sądziłyby co innego o tej samej drukarce.
 * Odczyt leniwy jak przy luzMm — gdyby kolejność wklejania kiedyś się zmieniła,
 * padnie jedna operacja z czytelnym powodem, a nie cała zakładka przy ładowaniu.
 */
const sciankaMin = () => {
  const fn = window.P2S && window.P2S.wymaganaSciankaDrukowalna;
  if (typeof fn !== 'function') throw new Error('brak P2S.wymaganaSciankaDrukowalna');
  return fn(window.P2S);
};
/** Tylko margines cięcia — nie jest częścią pomiaru zakresu cechy. */
const MARGINES_CIECIA_MM = 2;
/** Zapas boolean, żeby wypełnienie zrosło się ze ścianką. Nie jest naddatkiem wymiaru. */
const ZAKLADKA_BOOLEAN_MM = 0.05;
const PRZEROBKA_CIRCULAR_SEGMENTS = 192;
let wasmMod = null;
let circularSegmentsUstawione = PRZEROBKA_CIRCULAR_SEGMENTS;
const kandydaciDbg = [];
const klamra = (v, a, b) => Math.min(b, Math.max(a, v));
const usun = arr => { for (const o of arr || []) { try { o.delete(); } catch {} } };

let Manifold = null;

function progiZGabarytu(bb) {
  const D = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
  return {
    D,
    // EKSPERYMENTALNE — dobrane na tutucu1 (D≈117 mm), potem sprawdzone na kilku plikach z dysku.
    zgrzew_mm: klamra(D * 1e-5, 1e-4, 1e-2),
    tol_r_mm: klamra(D * 0.0015, 0.05, 0.50),
    r_min_mm: klamra(D * 0.008, 0.50, 5.00),
    r_max_mm: D * 0.75,
    krok_skanu_mm: klamra(D * 0.02, 0.5, 3.0),
    tol_osi: 0.06,
    // 0.985 = cos≈10°. Promień inlierów liczony z mediany i progu 0.99 (stożki odrzucane przy pomiarze).
    celowanie: 0.985,
    min_kat_deg: 40,
    stopien_mm: 0.6
  };
}

async function initPrzerobka() {
  if (Manifold) {
    ustawNPrzerobki();
    return Manifold;
  }
  if (!window.P2S || typeof window.P2S.initEngine !== 'function')
    throw new Error('brak silnika Manifold');
  const eng = await window.P2S.initEngine();
  Manifold = eng.Manifold;
  try {
    wasmMod = eng.wasm;
    ustawNPrzerobki();
  } catch (e) {
    throw e;
  }
  return Manifold;
}

function getManifold() {
  if (!Manifold) throw new Error('initPrzerobka() najpierw');
  return Manifold;
}

function zgrzej(Vsrc, Fsrc, tol) {
  const mapa = new Map(), V = [], F = new Uint32Array(Fsrc.length);
  const q = 1 / tol;
  for (let i = 0; i < Fsrc.length; i++) {
    const vi = Fsrc[i] * 3;
    const x = Vsrc[vi], y = Vsrc[vi + 1], z = Vsrc[vi + 2];
    const key = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    let id = mapa.get(key);
    if (id === undefined) { id = V.length / 3; mapa.set(key, id); V.push(x, y, z); }
    F[i] = id;
  }
  return { V: new Float32Array(V), F };
}

function czytajSTL(buf, tol = 1e-3) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let binary = false, nTri = 0;
  if (u8.byteLength >= 84) {
    nTri = dv.getUint32(80, true);
    if (84 + nTri * 50 === u8.byteLength) binary = true;
  }
  const mapa = new Map(), V = [], F = [];
  const q = 1 / tol;
  const dodaj = (x, y, z) => {
    const key = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    let i = mapa.get(key);
    if (i === undefined) { i = V.length / 3; mapa.set(key, i); V.push(x, y, z); }
    F.push(i);
  };
  if (binary) {
    let off = 84;
    for (let t = 0; t < nTri; t++) {
      off += 12;
      for (let k = 0; k < 3; k++) {
        dodaj(dv.getFloat32(off, true), dv.getFloat32(off + 4, true), dv.getFloat32(off + 8, true));
        off += 12;
      }
      off += 2;
    }
  } else {
    const txt = new TextDecoder().decode(u8);
    const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
    let m, acc = [];
    while ((m = re.exec(txt))) {
      acc.push(+m[1], +m[2], +m[3]);
      if (acc.length === 9) {
        dodaj(acc[0], acc[1], acc[2]); dodaj(acc[3], acc[4], acc[5]); dodaj(acc[6], acc[7], acc[8]);
        acc = [];
      }
    }
  }
  return { V: new Float32Array(V), F: new Uint32Array(F), nTri: F.length / 3 };
}

const IDENT_3MF = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

function parsujTransform3mf(s) {
  if (s == null || String(s).trim() === '') return IDENT_3MF.slice();
  const a = String(s).trim().split(/[\s,]+/).map(Number);
  if (a.length !== 12 || a.some(function (x) { return !Number.isFinite(x); })) return IDENT_3MF.slice();
  return a;
}

function zastosujTransform3mf(x, y, z, t) {
  return [
    t[0] * x + t[3] * y + t[6] * z + t[9],
    t[1] * x + t[4] * y + t[7] * z + t[10],
    t[2] * x + t[5] * y + t[8] * z + t[11]
  ];
}

function zlozTransform3mf(a, b) {
  const A = [
    [a[0], a[1], a[2], 0],
    [a[3], a[4], a[5], 0],
    [a[6], a[7], a[8], 0],
    [a[9], a[10], a[11], 1]
  ];
  const B = [
    [b[0], b[1], b[2], 0],
    [b[3], b[4], b[5], 0],
    [b[6], b[7], b[8], 0],
    [b[9], b[10], b[11], 1]
  ];
  const C = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) C[i][j] += A[i][k] * B[k][j];
    }
  }
  return [C[0][0], C[0][1], C[0][2], C[1][0], C[1][1], C[1][2], C[2][0], C[2][1], C[2][2], C[3][0], C[3][1], C[3][2]];
}

function attr3mf(blok, nazwa) {
  const m = String(blok || '').match(new RegExp('\\b' + nazwa + '="([^"]*)"'));
  return m ? m[1] : '';
}

function transformujVerts3mf(V, t) {
  const out = V.slice();
  for (let i = 0; i + 2 < out.length; i += 3) {
    const p = zastosujTransform3mf(out[i], out[i + 1], out[i + 2], t);
    out[i] = p[0];
    out[i + 1] = p[1];
    out[i + 2] = p[2];
  }
  return out;
}

function parsujModel3mfPelny(xml) {
  const obiekty = [];
  const objRe = /<object\b([^>]*)>([\s\S]*?)<\/object>/gi;
  let om;
  while ((om = objRe.exec(xml))) {
    const attrs = om[1];
    const body = om[2];
    const id = attr3mf(attrs, 'id');
    if (!id) continue;
    const name = attr3mf(attrs, 'name') || 'obiekt';
    const verts = [];
    const faces = [];
    const vRe = /<vertex\b([^>]*)\/?\s*>/gi;
    let vm;
    while ((vm = vRe.exec(body))) {
      const a = vm[1];
      verts.push(+(attr3mf(a, 'x') || 0), +(attr3mf(a, 'y') || 0), +(attr3mf(a, 'z') || 0));
    }
    const tRe = /<triangle\b([^>]*)\/?\s*>/gi;
    let tm;
    while ((tm = tRe.exec(body))) {
      const a = tm[1];
      faces.push(+(attr3mf(a, 'v1') || 0), +(attr3mf(a, 'v2') || 0), +(attr3mf(a, 'v3') || 0));
    }
    const components = [];
    const cRe = /<component\b([^>]*)\/?\s*>/gi;
    let cm;
    while ((cm = cRe.exec(body))) {
      const a = cm[1];
      const oid = attr3mf(a, 'objectid');
      if (!oid) continue;
      components.push({ objectid: oid, transform: parsujTransform3mf(attr3mf(a, 'transform')) });
    }
    obiekty.push({ id: id, name: name, V: verts, F: faces, components: components });
  }
  const itemy = [];
  const build = (xml.match(/<build\b[^>]*>([\s\S]*?)<\/build>/i) || ['', ''])[1];
  const iRe = /<item\b([^>]*)\/?\s*>/gi;
  let im;
  while ((im = iRe.exec(build))) {
    const a = im[1];
    const oid = attr3mf(a, 'objectid');
    if (!oid) continue;
    itemy.push({ objectid: oid, transform: parsujTransform3mf(attr3mf(a, 'transform')) });
  }
  return { obiekty: obiekty, itemy: itemy };
}

function rozwinObiekt3mf(byId, id, parentT, stos) {
  const key = String(id);
  if (stos.has(key)) return [];
  const obj = byId.get(key);
  if (!obj) return [];
  stos.add(key);
  const out = [];
  if (obj.V.length && obj.F.length) {
    out.push({
      name: obj.name,
      objectid: key,
      V: transformujVerts3mf(obj.V, parentT),
      F: obj.F.slice(),
      transform: parentT.slice()
    });
  }
  for (let ci = 0; ci < obj.components.length; ci++) {
    const c = obj.components[ci];
    const t = zlozTransform3mf(c.transform, parentT);
    out.push.apply(out, rozwinObiekt3mf(byId, c.objectid, t, stos));
  }
  stos.delete(key);
  return out;
}

function instancjeZXmls(xmls) {
  const byId = new Map();
  const itemy = [];
  for (let xi = 0; xi < xmls.length; xi++) {
    const p = parsujModel3mfPelny(xmls[xi]);
    for (let oi = 0; oi < p.obiekty.length; oi++) byId.set(String(p.obiekty[oi].id), p.obiekty[oi]);
    for (let ii = 0; ii < p.itemy.length; ii++) itemy.push(p.itemy[ii]);
  }
  const surowe = [];
  if (itemy.length) {
    for (let i = 0; i < itemy.length; i++) {
      const it = itemy[i];
      surowe.push.apply(surowe, rozwinObiekt3mf(byId, it.objectid, it.transform, new Set()));
    }
  }
  if (!surowe.length) {
    byId.forEach(function (o) {
      if (o.V.length && o.F.length) {
        surowe.push({
          name: o.name,
          objectid: o.id,
          V: o.V.slice(),
          F: o.F.slice(),
          transform: IDENT_3MF.slice()
        });
      }
    });
  }
  return surowe;
}

function xmlsZ3mf(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const files = unzipSync(u8);
  const xmls = [];
  for (const name of Object.keys(files)) {
    if (/\.model$/i.test(name)) xmls.push(new TextDecoder().decode(files[name]));
  }
  return xmls;
}

const URI_CORE = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
const URI_PRODUCTION = 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06';
const URI_MATERIALS = 'http://schemas.microsoft.com/3dmanufacturing/material/2015/02';
const URI_BEAM = 'http://schemas.microsoft.com/3dmanufacturing/beamlattice/2017/02';
const URI_SLICE = 'http://schemas.microsoft.com/3dmanufacturing/slice/2015/07';
const ROZSZERZENIA_UMIEMY = {};
ROZSZERZENIA_UMIEMY[URI_CORE] = true;
ROZSZERZENIA_UMIEMY[URI_PRODUCTION] = true;
const URI_ETYKIETA = {};
URI_ETYKIETA[URI_CORE] = 'core';
URI_ETYKIETA[URI_PRODUCTION] = 'production (instancje)';
URI_ETYKIETA[URI_MATERIALS] = 'materials (kolory i materiały)';
URI_ETYKIETA[URI_BEAM] = 'beamlattice (kratownica belkowa — bele i kule, nie trójkąty)';
URI_ETYKIETA[URI_SLICE] = 'slice';

function parsujNaglowekModelu(xml) {
  const open = (String(xml).match(/<model\b[^>]*>/i) || [''])[0];
  const xmlns = {};
  const def = open.match(/\sxmlns="([^"]+)"/);
  if (def) xmlns[''] = def[1];
  const pxRe = /\sxmlns:([A-Za-z_][\w]*)="([^"]+)"/g;
  let px;
  while ((px = pxRe.exec(open))) xmlns[px[1]] = px[2];
  const reqRaw = attr3mf(open, 'requiredextensions');
  const requiredextensions = reqRaw.trim() ? reqRaw.trim().split(/\s+/) : [];
  const unit = attr3mf(open, 'unit') || '';
  const metadata = [];
  const mdRe = /<metadata\b([^>]*)>([\s\S]*?)<\/metadata>/gi;
  let mm;
  while ((mm = mdRe.exec(xml))) {
    metadata.push({ name: attr3mf(mm[1], 'name') || '', value: String(mm[2] || '').trim() });
  }
  return { xmlns: xmlns, requiredextensions: requiredextensions, unit: unit, metadata: metadata };
}

function brakujaceRozszerzenia(naglowek) {
  const h = naglowek || { xmlns: {}, requiredextensions: [] };
  const brak = [];
  const req = h.requiredextensions || [];
  for (let i = 0; i < req.length; i++) {
    const prefix = req[i];
    const uri = prefix === '' ? (h.xmlns[''] || URI_CORE) : (h.xmlns[prefix] || '');
    if (!uri) {
      brak.push({ prefix: prefix, uri: '', nazwa: 'nieznany prefiks „' + prefix + '” (brak xmlns)' });
      continue;
    }
    if (ROZSZERZENIA_UMIEMY[uri]) continue;
    brak.push({ prefix: prefix, uri: uri, nazwa: URI_ETYKIETA[uri] || (prefix + ' → ' + uri) });
  }
  return brak;
}

function rzucJesliNieUmiemy(xmls) {
  const brak = [];
  const seen = {};
  for (let i = 0; i < xmls.length; i++) {
    const lista = brakujaceRozszerzenia(parsujNaglowekModelu(xmls[i]));
    for (let j = 0; j < lista.length; j++) {
      const b = lista[j];
      const k = b.prefix + '|' + b.uri;
      if (seen[k]) continue;
      seen[k] = true;
      brak.push(b);
    }
  }
  if (!brak.length) return;
  const err = new Error(
    'Ten 3MF wymaga rozszerzenia, którego nie obsługuję: '
    + brak.map(function (b) { return b.nazwa; }).join(', ')
    + '. Nie wczytuję go częściowo — w pliku jest napisane, że bez tego rozszerzenia nie wolno go przetworzyć.'
  );
  err.kod = 'NIEOBSLUGIWANE_ROZSZERZENIE';
  err.rozszerzenia = brak;
  throw err;
}

function inwentarz3mf(buf) {
  const xmls = xmlsZ3mf(buf);
  let obiekty = 0, itemy = 0, trojkatyZasoby = 0;
  const nazwy = [];
  const metadata = [];
  const requiredextensions = [];
  const xmlns = {};
  let unit = '';
  for (let i = 0; i < xmls.length; i++) {
    const h = parsujNaglowekModelu(xmls[i]);
    Object.assign(xmlns, h.xmlns);
    if (h.unit) unit = h.unit;
    for (let r = 0; r < h.requiredextensions.length; r++) {
      if (requiredextensions.indexOf(h.requiredextensions[r]) < 0) requiredextensions.push(h.requiredextensions[r]);
    }
    for (let m = 0; m < h.metadata.length; m++) metadata.push(h.metadata[m]);
    const p = parsujModel3mfPelny(xmls[i]);
    obiekty += p.obiekty.length;
    itemy += p.itemy.length;
    for (let o = 0; o < p.obiekty.length; o++) {
      nazwy.push(p.obiekty[o].name);
      trojkatyZasoby += p.obiekty[o].F.length / 3;
    }
  }
  let trojkatyPlyta = 0;
  const inst = xmls.length ? instancjeZXmls(xmls) : [];
  for (let s = 0; s < inst.length; s++) trojkatyPlyta += inst[s].F.length / 3;
  return {
    obiekty: obiekty, itemy: itemy,
    trojkaty_zasoby: trojkatyZasoby, trojkaty_plyta: trojkatyPlyta,
    instancje: inst.length, nazwy: nazwy, metadata: metadata,
    requiredextensions: requiredextensions, xmlns: xmlns, unit: unit
  };
}

function porownajInwentarz(we, wy) {
  const gubie = [];
  if (!we || !wy) return { ok: false, gubie: ['brak inwentarza'], we: we || null, wy: wy || null };
  if (we.itemy > 0 && wy.itemy < we.itemy) gubie.push('<item>: było ' + we.itemy + ', jest ' + wy.itemy);
  if (we.obiekty > 0 && wy.obiekty < we.obiekty && !(we.itemy > 0 && wy.itemy >= we.itemy)) {
    gubie.push('<object>: było ' + we.obiekty + ', jest ' + wy.obiekty);
  }
  if (we.trojkaty_plyta > 0 && wy.trojkaty_plyta + 0.5 < we.trojkaty_plyta) {
    gubie.push('trójkąty na płycie: było ' + we.trojkaty_plyta + ', jest ' + wy.trojkaty_plyta);
  }
  if (Number.isFinite(we.objetosc_mm3) && Number.isFinite(wy.objetosc_mm3)
      && wy.objetosc_mm3 < we.objetosc_mm3 * 0.5) {
    gubie.push('objętość: było ' + we.objetosc_mm3.toFixed(1) + ' mm³, jest ' + wy.objetosc_mm3.toFixed(1)
      + ' mm³ (spadek o więcej niż połowę)');
  }
  const metaWy = {};
  const mdWy = wy.metadata || [];
  for (let i = 0; i < mdWy.length; i++) if (mdWy[i].name) metaWy[mdWy[i].name] = true;
  const mdWe = we.metadata || [];
  for (let i = 0; i < mdWe.length; i++) {
    if (mdWe[i].name && !metaWy[mdWe[i].name]) {
      if (/^copyright$/i.test(mdWe[i].name)) {
        gubie.push('metadata „Copyright” (atrybucja CC BY-SA — wymóg licencji, nie kosmetyka)');
      } else {
        gubie.push('metadata „' + mdWe[i].name + '”');
      }
    }
  }
  return { ok: gubie.length === 0, gubie: gubie, we: we, wy: wy };
}

function tekstInwentarza(porownanie) {
  const we = (porownanie && porownanie.we) || {};
  const wy = (porownanie && porownanie.wy) || {};
  const linie = [];
  linie.push('Weszło: ' + (we.itemy || 0) + ' × <item>, ' + (we.obiekty || 0) + ' × <object>, '
    + (we.trojkaty_plyta || 0) + ' trójkątów na płycie'
    + (Number.isFinite(we.objetosc_mm3) ? ', ' + Math.round(we.objetosc_mm3) + ' mm³' : '') + '.');
  linie.push('Wyszło: ' + (wy.itemy || 0) + ' × <item>, ' + (wy.obiekty || 0) + ' × <object>, '
    + (wy.trojkaty_plyta || 0) + ' trójkątów na płycie'
    + (Number.isFinite(wy.objetosc_mm3) ? ', ' + Math.round(wy.objetosc_mm3) + ' mm³' : '') + '.');
  if (porownanie && porownanie.gubie && porownanie.gubie.length) {
    linie.push('Nie umiałem zachować: ' + porownanie.gubie.join('; ') + '.');
  } else {
    linie.push('Inwentarz <item> / trójkąty na płycie się zgadza.');
  }
  return linie.join(' ');
}

function zgrzejInstancje3mf(buf, tol) {
  const xmls = xmlsZ3mf(buf);
  if (!xmls.length) throw new Error('W 3MF nie ma siatki (.model).');
  rzucJesliNieUmiemy(xmls);
  const surowe = instancjeZXmls(xmls);
  if (!surowe.length) throw new Error('W 3MF nie znalazłem wierzchołków.');
  return surowe.map(function (o) {
    const z = zgrzej(o.V, o.F, tol);
    return {
      V: z.V,
      F: z.F,
      nTri: z.F.length / 3,
      nazwa: o.name,
      objectid: o.objectid,
      transform: o.transform
    };
  });
}

function czytaj3MF(buf, tol) {
  if (tol == null) tol = 1e-3;
  const wszystkie = zgrzejInstancje3mf(buf, tol);
  return wszystkie.slice().sort(function (a, b) { return b.nTri - a.nTri; })[0];
}

function czytaj3MFWszystkie(buf, tol) {
  if (tol == null) tol = 1e-3;
  return zgrzejInstancje3mf(buf, tol);
}

function czytaj3MFInstancje(buf, tol) {
  if (tol == null) tol = 1e-3;
  return zgrzejInstancje3mf(buf, tol);
}

function wczytajPlik() {
  throw new Error('w przeglądarce użyj rozpoznajZBufora');
}

function bboxWym(m) {
  const bb = m.boundingBox();
  const mn = Array.isArray(bb.min) ? bb.min : [bb.min.x, bb.min.y, bb.min.z];
  const mx = Array.isArray(bb.max) ? bb.max : [bb.max.x, bb.max.y, bb.max.z];
  return [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], mn, mx];
}

function brylaZSiatki(V, F) {
  const tols = [null, 0.05, 0.08];
  let lastErr;
  let bbox0 = null;
  for (const tol of tols) {
    const src = tol == null ? { V: V, F: F } : zgrzej(V, F, tol);
    try {
      const m = Manifold.ofMesh({ numProp: 3, vertProperties: src.V, triVerts: src.F });
      if (typeof m.isEmpty === 'function' && m.isEmpty()) {
        try { m.delete(); } catch (e2) {}
        continue;
      }
      const b = bboxWym(m);
      if (!bbox0) bbox0 = b;
      else {
        const d = Math.max(Math.abs(b[0] - bbox0[0]), Math.abs(b[1] - bbox0[1]), Math.abs(b[2] - bbox0[2]));
        if (d > 0.25) {
          try { m.delete(); } catch (e2) {}
          continue;
        }
      }
      return m;
    } catch (e) {
      lastErr = e;
    }
  }
  const err = new Error(KOM_USZKODZONY);
  err.kod = 'USZKODZONY';
  err.przyczyna = String(lastErr && lastErr.message || lastErr);
  throw err;
}

function elementyWalca(V, F, os, P) {
  const [A, U, W] = OSIE[os];
  const el = [];
  for (let t = 0; t < F.length; t += 3) {
    const a = F[t] * 3, b = F[t + 1] * 3, c = F[t + 2] * 3;
    const e1 = [V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]];
    const e2 = [V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]];
    // Normalna z nawinięcia, nie z nagłówka STL — te bywają zerowe albo odwrócone.
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const ln = Math.hypot(n[0], n[1], n[2]); if (ln < 1e-10) continue;
    n[0] /= ln; n[1] /= ln; n[2] /= ln;
    if (Math.abs(n[A]) > P.tol_osi) continue;
    const cu = (V[a + U] + V[b + U] + V[c + U]) / 3, cw = (V[a + W] + V[b + W] + V[c + W]) / 3;
    const nu = n[U], nw = n[W], l2 = Math.hypot(nu, nw); if (l2 < 0.9) continue;
    const za = V[a + A], zb = V[b + A], zc = V[c + A];
    el.push([cu, cw, nu / l2, nw / l2, ln / 2, Math.min(za, zb, zc), Math.max(za, zb, zc)]);
  }
  return el;
}

















function przeciecie(p, q) {
  const det = p[2] * (-q[3]) - p[3] * (-q[2]);
  if (Math.abs(det) < 0.15) return null;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const s = (dx * (-q[3]) - dy * (-q[2])) / det;
  return [p[0] + s * p[2], p[1] + s * p[3]];
}

function mediana(arr) {
  if (!arr.length) return NaN;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
}





















function dopasujOkreg(pts) {
  if (!pts || pts.length < 8) return null;
  const n = pts.length;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p[0]; my += p[1]; }
  mx /= n; my /= n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of pts) {
    const u = p[0] - mx, v = p[1] - my;
    const uu = u * u, vv = v * v;
    suu += uu; svv += vv; suv += u * v;
    suuu += uu * u; svvv += vv * v; suvv += u * vv; svuu += v * uu;
  }
  const den = 2 * (suu * svv - suv * suv);
  if (Math.abs(den) < 1e-18) return null;
  const uc = (svv * (suuu + suvv) - suv * (svvv + svuu)) / den;
  const vc = (suu * (svvv + svuu) - suv * (suuu + suvv)) / den;
  const cx = mx + uc, cy = my + vc;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const rs = pts.map(p => Math.hypot(p[0] - cx, p[1] - cy)).filter(r => r > 1e-9);
  if (rs.length < 8) return null;
  const r = mediana(rs);
  if (!Number.isFinite(r) || r < 1e-6) return null;
  return { cx, cy, r };
}



















function celZnak(dx, dy, nx, ny) {
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) return 0;
  return (dx * nx + dy * ny) / d;
}











function rozbijBimodalnie(uzyte, rFin, P) {
  if (!uzyte || uzyte.length < 16) return [uzyte];
  const rs = uzyte.map(k => k.d).slice().sort((a, b) => a - b);
  let bestGap = 0, splitAt = -1;
  for (let i = 1; i < rs.length; i++) {
    const gap = rs[i] - rs[i - 1];
    if (gap > bestGap) { bestGap = gap; splitAt = i; }
  }
  if (bestGap <= 2 * P.tol_r_mm || splitAt < 8 || rs.length - splitAt < 8) return [uzyte];
  const lo = uzyte.filter(k => k.d < rs[splitAt]);
  const hi = uzyte.filter(k => k.d >= rs[splitAt]);
  if (lo.length < 8 || hi.length < 8) return [uzyte];
  return [lo, hi];
}
















function walceZNormalnych(V, F, os, P) {
  const el = elementyWalca(V, F, os, P);
  if (el.length < 30) return [];
  const [, U, W] = OSIE[os];
  let uLo = Infinity, uHi = -Infinity, wLo = Infinity, wHi = -Infinity;
  for (let i = 0; i < V.length; i += 3) {
    const u = V[i + U], w = V[i + W];
    if (u < uLo) uLo = u; if (u > uHi) uHi = u;
    if (w < wLo) wLo = w; if (w > wHi) wHi = w;
  }
  let poz = el.slice(), out = [];
  const probeN = Math.min(800, poz.length);
  for (let runda = 0; runda < 12 && poz.length >= 30; runda++) {
    let best = null;
    const nIt = Math.min(20000, 80 * poz.length);
    for (let it = 0; it < nIt; it++) {
      const i = (it * 7919 + runda * 13) % poz.length;
      const j = (it * 104729 + 17 + runda) % poz.length;
      if (i === j) continue;
      const s = przeciecie(poz[i], poz[j]); if (!s) continue;
      const r = Math.hypot(poz[i][0] - s[0], poz[i][1] - s[1]);
      if (r < P.r_min_mm || r > P.r_max_mm) continue;
      let n = 0, pole = 0;
      const krok = Math.max(1, Math.floor(poz.length / probeN));
      for (let k = 0; k < poz.length; k += krok) {
        const e = poz[k];
        const dx = e[0] - s[0], dy = e[1] - s[1], d = Math.hypot(dx, dy);
        if (Math.abs(d - r) > P.tol_r_mm) continue;
        // |cel|: czy ściana jest radialna. Znak tu nie rozstrzyga gniazda od czopa.
        if (Math.abs(celZnak(dx, dy, e[2], e[3])) < P.celowanie) continue;
        n++; pole += e[4];
      }
      if (!best || pole > best.pole) best = { cu: s[0], cw: s[1], r, n, pole };
    }
    if (!best || best.n < 8) break;
    const celOstre = Math.max(P.celowanie, 0.99);
    const kand = [];
    for (const e of poz) {
      const dx = e[0] - best.cu, dy = e[1] - best.cw, d = Math.hypot(dx, dy);
      if (d < 1e-9) continue;
      const aimAbs = Math.abs(celZnak(dx, dy, e[2], e[3]));
      if (Math.abs(d - best.r) > P.tol_r_mm || aimAbs < P.celowanie) continue;
      kand.push({ e, d, aim: aimAbs, dx, dy });
    }
    let uzyte = kand.filter(k => k.aim >= celOstre);
    if (uzyte.length < 12) uzyte = kand;
    const rMed = mediana(uzyte.map(k => k.d));
    const uzyte2 = uzyte.filter(k => Math.abs(k.d - rMed) <= P.tol_r_mm);
    if (uzyte2.length >= 12) uzyte = uzyte2;
    const xs = [], ys = [];
    for (let i = 0; i < uzyte.length; i += Math.max(1, Math.floor(uzyte.length / 40))) {
      const j = (i + Math.floor(uzyte.length / 3)) % uzyte.length;
      const s2 = przeciecie(uzyte[i].e, uzyte[j].e);
      if (s2) { xs.push(s2[0]); ys.push(s2[1]); }
    }
    const fitC0 = dopasujOkreg(uzyte.map(k => [k.e[0], k.e[1]]));
    const fitC = (fitC0
      && Math.hypot(fitC0.cx - best.cu, fitC0.cy - best.cw) <= 2
      && Math.abs(fitC0.r - rMed) <= 1.5) ? fitC0 : null;
    const cu2 = fitC ? fitC.cx : (xs.length >= 5 ? mediana(xs) : best.cu);
    const cw2 = fitC ? fitC.cy : (ys.length >= 5 ? mediana(ys) : best.cw);
    const rFin = mediana(uzyte.map(k => Math.hypot(k.e[0] - cu2, k.e[1] - cw2)));
    let doSrodka = 0, katy = new Set(), nPelne = 0, polePelne = 0, odch = 0, zmin = Infinity, zmax = -Infinity;
    for (const k of uzyte) {
      const rr = Math.hypot(k.e[0] - cu2, k.e[1] - cw2);
      nPelne++; polePelne += k.e[4]; odch += Math.abs(rr - rFin);
      if (celZnak(k.e[0] - cu2, k.e[1] - cw2, k.e[2], k.e[3]) <= -P.celowanie) doSrodka++;
      katy.add(Math.round(Math.atan2(k.dy, k.dx) * 180 / Math.PI / 5));
      if (k.e[5] < zmin) zmin = k.e[5];
      if (k.e[6] > zmax) zmax = k.e[6];
    }
    const pokrycie = katy.size * 5;
    const powodOdrz = [];
    if (pokrycie < P.min_kat_deg) powodOdrz.push('min_kat_deg');
    if (nPelne < 12) powodOdrz.push('min_inlierow');
    kandydaciDbg.push({
      os, r: rFin, srednica_mm: +(rFin * 2).toFixed(3),
      inlierow: nPelne, pokrycie_kata_deg: pokrycie,
      z_od: zmin, z_do: zmax,
      przyjety: pokrycie >= P.min_kat_deg && nPelne >= 12,
      powod_odrzucenia: powodOdrz.join(',') || null
    });
    if (pokrycie >= P.min_kat_deg && nPelne >= 12) {
      const grupyR = rozbijBimodalnie(uzyte, rFin, P);
      for (const gr of grupyR) {
        const rG = mediana(gr.map(k => Math.hypot(k.e[0] - cu2, k.e[1] - cw2)));
        let z0g = Infinity, z1g = -Infinity, z0c = Infinity, z1c = -Infinity;
        let nG = 0, poleG = 0, doSr = 0, odSr = 0, odchG = 0, su = 0, sw = 0;
        const katG = new Set();
        for (const k of gr) {
          const rr = Math.hypot(k.e[0] - cu2, k.e[1] - cw2);
          nG++; poleG += k.e[4]; odchG += Math.abs(rr - rG);
          su += k.e[0]; sw += k.e[1];
          const zn = celZnak(k.e[0] - cu2, k.e[1] - cw2, k.e[2], k.e[3]);
          if (zn <= -P.celowanie) doSr++;
          else if (zn >= P.celowanie) odSr++;
          katG.add(Math.round(Math.atan2(k.dy, k.dx) * 180 / Math.PI / 5));
          if (k.e[5] < z0g) z0g = k.e[5];
          if (k.e[6] > z1g) z1g = k.e[6];
          if (Math.abs(rr - rG) <= 0.15) {
            if (k.e[5] < z0c) z0c = k.e[5];
            if (k.e[6] > z1c) z1c = k.e[6];
          }
        }
        if (nG < 12 || katG.size * 5 < P.min_kat_deg) continue;
        // Oś poza gabarytem części: Kåsa/RANSAC na łacie heksagonu (7,1 przy
        // nakrętce w 0,0). Ani otwór, ani czop.
        if (cu2 < uLo || cu2 > uHi || cw2 < wLo || cw2 > wHi) continue;
        // Kåsa na heksagonie ucieka poza chmurę inlierów i wtedy wszystkie
        // normalne „wskazują do osi”.
        if (Math.hypot(cu2 - su / nG, cw2 - sw / nG) > rG * 1.05) continue;
        // Znak, nie próg i nie sam gabaryt. |cel| przy RANSAC łapie obie ściany;
        // tu: ≤ −0,985 = gniazdo, ≥ +0,985 = czop. 60% silnego znaku, nie dot < 0.
        // Gabaryt jest sitem na śmieciowy środek poza częścią — konieczny, nie wystarczający.
        const otwor = doSr > nG * 0.6;
        const czop = odSr > nG * 0.6;
        if (!otwor && !czop) continue;
        out.push({
          os, r: rG, srednica_mm: +(rG * 2).toFixed(3),
          srodek: [+cu2.toFixed(3), +cw2.toFixed(3)],
          pokrycie_kata_deg: katG.size * 5, trojkatow: nG, pole_mm2: +poleG.toFixed(0),
          odchylenie_promienia_mm: +(odchG / Math.max(1, nG)).toFixed(3),
          rodzaj: otwor ? 'otwor/gniazdo' : 'czop/walek',
          udzial_do_osi: +(doSr / Math.max(1, nG)).toFixed(3),
          z_od: Number.isFinite(z0c) ? z0c : z0g,
          z_do: Number.isFinite(z1c) ? z1c : z1g
        });
      }
    }
    poz = poz.filter(e => {
      const dx = e[0] - best.cu, dy = e[1] - best.cw, d = Math.hypot(dx, dy);
      const aim = d < 1e-9 ? 0 : Math.abs(celZnak(dx, dy, e[2], e[3]));
      if (aim < P.celowanie) return true;
      if (Math.abs(d - best.r) <= P.tol_r_mm) return false;
      for (const gr of (pokrycie >= P.min_kat_deg && nPelne >= 12 ? rozbijBimodalnie(uzyte, rFin, P) : [])) {
        const rG = mediana(gr.map(k => k.d));
        if (Math.abs(d - rG) <= P.tol_r_mm) return false;
      }
      return true;
    });
  }
  return out;
}






















function wSrodku(kon, x, y) {
  let c = false;
  for (const P of kon) {
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
    }
  }
  return c;
}

function rInBinarny(kon, cx, cy, kier, rMin, rMax) {
  let hit = null;
  for (let r = rMin; r <= rMax; r += 0.1) {
    if (wSrodku(kon, cx + kier[0] * r, cy + kier[1] * r)) { hit = r; break; }
  }
  if (hit == null) return null;
  let lo = Math.max(rMin, hit - 0.1), hi = hit;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (wSrodku(kon, cx + kier[0] * mid, cy + kier[1] * mid)) hi = mid;
    else lo = mid;
  }
  return lo;
}





















function przytnijRdzen(seg) {
  if (seg.length < 3) return seg;
  const med = mediana(seg.map(s => s.r));
  const flag = seg.map(s => Math.abs(s.r - med) <= 0.12);
  let bestA = 0, bestB = 0, a = 0;
  while (a < flag.length) {
    while (a < flag.length && !flag[a]) a++;
    let b = a;
    while (b < flag.length && flag[b]) b++;
    if (b - a > bestB - bestA) { bestA = a; bestB = b; }
    a = b + 1;
  }
  const rdzen = seg.slice(bestA, bestB);
  return rdzen.length >= 2 ? rdzen : seg;
}





















function rInWielokier(kon, cx, cy, rMin, rMax) {
  const rs = [];
  for (let a = 0; a < 360; a += 45) {
    const rad = a * Math.PI / 180;
    const r = rInBinarny(kon, cx, cy, [Math.cos(rad), Math.sin(rad)], rMin, rMax);
    if (r != null) rs.push(r);
  }
  if (!rs.length) return null;
  const mn = Math.min(...rs);
  const sciana = rs.filter(r => r <= mn + 1.2);
  return mediana(sciana);
}




















function polygonsOf(cs) {
  if (!cs) return [];
  if (typeof cs.toPolygons === 'function') return cs.toPolygons();
  if (typeof cs.toPolygons === 'function') return cs.toPolygons();
  return [];
}

function naZ(m, os) {
  if (os === 'z') return { s: m, wlasny: false };
  if (os === 'y') return { s: m.rotate(-90, 0, 0), wlasny: true };
  if (os === 'x') return { s: m.rotate(0, 90, 0), wlasny: true };
  return { s: m, wlasny: false };
}

/** RANSAC srodek is [U, W] in the original plane. After naZ, XY is (W, U). */
function xyPoObrocie(os, srodek) {
  if (os === 'z') return [srodek[0], srodek[1]];
  return [srodek[1], srodek[0]];
}

function zZ(s, os) {
  if (os === 'z') return s;
  if (os === 'y') return s.rotate(90, 0, 0);
  if (os === 'x') return s.rotate(0, -90, 0);
  return s;
}

function gardziel(kon, cx, cy, r) {
  const zaj = [];
  for (let a = 0; a < 360; a += 5) {
    const rad = a * Math.PI / 180;
    zaj.push(wSrodku(kon, cx + Math.cos(rad) * r, cy + Math.sin(rad) * r) ? 1 : 0);
  }
  let best = 0, bestOd = 0, run = 0, runOd = 0;
  const n = zaj.length;
  for (let i = 0; i < n * 2; i++) {
    if (!zaj[i % n]) {
      if (run === 0) runOd = (i % n) * 5;
      run++;
      if (run > best) { best = run; bestOd = runOd; }
    } else run = 0;
  }
  return { len: best * 5, od: bestOd };
}

function skanPromieniowy(m, os, srodek, P) {
  const { s: rot, wlasny } = naZ(m, os);
  const bb = rot.boundingBox();
  const [CX, CY] = xyPoObrocie(os, srodek);
  const z0 = bb.min[2], z1 = bb.max[2];
  const krok = P.krok_skanu_mm;
  const rMax = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) * 0.55;
  let kier = [0, 1];
  {
    const s0 = rot.slice((z0 + z1) / 2);
    const kon0 = polygonsOf(s0); s0.delete();
    let bestR = null;
    const dirs = [];
    for (let a = 0; a < 360; a += 45) {
      const rad = a * Math.PI / 180;
      dirs.push([Math.cos(rad), Math.sin(rad)]);
    }
    for (const k of dirs) {
      const rIn = rInBinarny(kon0, CX, CY, k, P.r_min_mm, rMax);
      if (rIn != null && (bestR == null || rIn < bestR)) { bestR = rIn; kier = k; }
    }
  }
  const probki = [];
  for (let z = z0 + krok; z <= z1 - krok; z += krok) {
    const s = rot.slice(z);
    const kon = polygonsOf(s);
    s.delete();
    if (!kon.length) continue;
    const rIn = rInWielokier(kon, CX, CY, Math.max(0.4, P.r_min_mm * 0.4), rMax);
    if (rIn == null) continue;
    const g = gardziel(kon, CX, CY, rIn + 1.5);
    probki.push({ t: z - z0, r: rIn, g });
  }
  const stopnie = [];
  let start = 0;
  for (let i = 1; i <= probki.length; i++) {
    const granica = i === probki.length
      || Math.abs(probki[i].r - probki[i - 1].r) > P.stopien_mm;
    if (granica) {
      const surowy = probki.slice(start, i);
      const krotki = surowy.length <= 4 || ((surowy[surowy.length - 1].t - surowy[0].t) < 8);
      const seg = krotki ? surowy : przytnijRdzen(surowy);
      if (seg.length >= 2) {
        const sr = mediana(seg.map(b => b.r));
        const odch = Math.sqrt(seg.reduce((a, b) => a + (b.r - sr) ** 2, 0) / seg.length);
        const gsr = seg.reduce((a, b) => a + b.g.len, 0) / seg.length;
        stopnie.push({
          os, srodek: [CX, CY], r: sr, srednica_mm: +(sr * 2).toFixed(3),
          od_mm: +seg[0].t.toFixed(2), do_mm: +seg[seg.length - 1].t.toFixed(2),
          z0, zgodnych_przekrojow: seg.length, odchylenie_promienia_mm: +odch.toFixed(3),
          gardziel_deg: +gsr.toFixed(0), gardziel_od_deg: +seg[Math.floor(seg.length / 2)].g.od.toFixed(0)
        });
      }
      start = i;
    }
  }
  if (wlasny) rot.delete();
  return { stopnie, z0, cx: CX, cy: CY };
}






















function kolko(poly) {
  if (poly.length < 6) return null;
  let sx = 0, sy = 0;
  for (const p of poly) { sx += p[0]; sy += p[1]; }
  const cx = sx / poly.length, cy = sy / poly.length;
  let rmin = Infinity, rmax = 0, sr = 0;
  for (const p of poly) {
    const r = Math.hypot(p[0] - cx, p[1] - cy);
    if (r < rmin) rmin = r;
    if (r > rmax) rmax = r;
    sr += r;
  }
  return { cx, cy, r: sr / poly.length, kol: rmax - rmin };
}

function wzoryOtworow(m, os, P) {
  const { s: rot, wlasny } = naZ(m, os);
  const bb = rot.boundingBox();
  const z0 = bb.min[2], z1 = bb.max[2], N = 9;
  const fracs = [];
  for (let i = 1; i <= N; i++) fracs.push((i - 0.5) / N);
  fracs.push(0.02, 0.98);
  const dziury = [];
  for (const f of fracs) {
    const z = z0 + f * (z1 - z0);
    const s = rot.slice(z);
    const kon = polygonsOf(s);
    s.delete();
    for (const poly of kon) {
      const k = kolko(poly);
      if (!k || k.kol >= 0.25) continue;
      if (k.r < 0.6 || k.r > 8) continue;
      dziury.push(k);
    }
  }
  const grupy = [];
  for (const d of dziury) {
    let g = grupy.find(x => Math.abs(x.r - d.r) < 0.2);
    if (!g) { g = { r: d.r, os, pts: [] }; grupy.push(g); }
    g.pts.push(d);
  }
  const wzory = [];
  for (const g of grupy) {
    const klastry = [];
    for (const p of g.pts) {
      let c = klastry.find(k => Math.hypot(k.cx - p.cx, k.cy - p.cy) < 1.2);
      if (!c) { c = { cx: p.cx, cy: p.cy, n: 0, r: 0, kol: 0 }; klastry.push(c); }
      const n = c.n + 1;
      c.cx = (c.cx * c.n + p.cx) / n;
      c.cy = (c.cy * c.n + p.cy) / n;
      c.r = (c.r * c.n + p.r) / n;
      c.kol = (c.kol * c.n + p.kol) / n;
      c.n = n;
    }
    const xsAll = [...new Set(klastry.map(p => +p.cx.toFixed(0)))];
    const ysAll = [...new Set(klastry.map(p => +p.cy.toFixed(0)))];
    const siatka = xsAll.length >= 2 && ysAll.length >= 2 && klastry.length >= 4;
    const sredKol = klastry.reduce((a, b) => a + b.kol, 0) / Math.max(1, klastry.length);
    const dobre = klastry.filter(c => siatka && sredKol <= 0.12 ? c.n >= 1 : c.n >= 2);
    if (dobre.length < 2) continue;
    const xs = [...new Set(dobre.map(p => +p.cx.toFixed(1)))].sort((a, b) => a - b);
    const ys = [...new Set(dobre.map(p => +p.cy.toFixed(1)))].sort((a, b) => a - b);
    wzory.push({
      os, srednica_mm: +(g.r * 2).toFixed(3), sztuk: dobre.length,
      rozstaw_mm: [
        xs.length >= 2 ? +(xs[xs.length - 1] - xs[0]).toFixed(2) : 0,
        ys.length >= 2 ? +(ys[ys.length - 1] - ys[0]).toFixed(2) : 0
      ],
      srodki: dobre.map(p => [+p.cx.toFixed(2), +p.cy.toFixed(2)]),
      kolistosc_mm: +(dobre.reduce((a, b) => a + b.kol, 0) / dobre.length).toFixed(3),
      zgodnych_przekrojow: Math.min(...dobre.map(p => p.n))
    });
  }
  if (wlasny) rot.delete();
  return wzory;
}

function pasmo(d) {
  const pok = d.pokrycie_kata_deg ?? 0, prz = d.zgodnych_przekrojow ?? 0, odch = d.odchylenie_promienia_mm ?? 99;
  if (pok >= 120 && prz >= 3 && odch <= 0.05) return 'wysoka';
  if (pok >= 60 && prz >= 2 && odch <= 0.15) return 'srednia';
  return 'niska';
}






















function tNaOsAbs(os, z0, t) {
  const zRot = z0 + t;
  return os === 'z' ? zRot : -zRot;
}





















function srednicaZWierzcholkow(V, os, srodekUW, zLo, zHi, r0) {
  const [A, U, W] = OSIE[os];
  const rs = [];
  for (let i = 0; i < V.length; i += 3) {
    const z = V[i + A];
    if (z < zLo || z > zHi) continue;
    const r = Math.hypot(V[i + U] - srodekUW[0], V[i + W] - srodekUW[1]);
    if (Math.abs(r - r0) <= 1.2) rs.push(r);
  }
  if (rs.length < 8) return { d: r0 * 2, n: rs.length };
  return { d: mediana(rs) * 2, n: rs.length };
}

function srednicaSprawdzianem(model, os, cx, cy, z0, od, doMm, d0) {
  if (!Manifold || !Number.isFinite(d0) || doMm - od < 1) return d0;
  const { s: aln, wlasny } = naZ(model, os);
  const h = Math.max(1.2, Math.min(4, (doMm - od) * 0.3));
  const z = z0 + od + (doMm - od) * 0.5 - h / 2;
  const obj = (d) => {
    const c = Manifold.cylinder(h, d / 2, d / 2, 192).translate(cx, cy, z);
    const k = c.intersect(aln);
    const v = k.volume();
    c.delete(); k.delete();
    return v;
  };
  let lo = Math.max(1, d0 - 1.2), hi = d0 + 1.2, out = d0;
  try {
    while (obj(hi) <= 1 && hi < d0 + 4) hi += 0.25;
    while (obj(lo) > 1 && lo > 1) lo -= 0.25;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (obj(mid) <= 1) lo = mid; else hi = mid;
    }
    out = lo;
  } catch {}
  if (wlasny) aln.delete();
  return out;
}





















function srednicaWPasmie(V, F, os, srodekUW, zLo, zHi, r0, P) {
  const [A, U, W] = OSIE[os];
  const rs = [];
  const pts = [];
  const cel = Math.max(P.celowanie, 0.99);
  const win = Math.max(0.4, P.tol_r_mm);
  for (let t = 0; t < F.length; t += 3) {
    const ia = F[t] * 3, ib = F[t + 1] * 3, ic = F[t + 2] * 3;
    const z = (V[ia + A] + V[ib + A] + V[ic + A]) / 3;
    if (z < zLo - 0.05 || z > zHi + 0.05) continue;
    const e1 = [V[ib] - V[ia], V[ib + 1] - V[ia + 1], V[ib + 2] - V[ia + 2]];
    const e2 = [V[ic] - V[ia], V[ic + 1] - V[ia + 1], V[ic + 2] - V[ia + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const ln = Math.hypot(n[0], n[1], n[2]); if (ln < 1e-10) continue;
    n[0] /= ln; n[1] /= ln; n[2] /= ln;
    if (Math.abs(n[A]) > P.tol_osi) continue;
    const cu = (V[ia + U] + V[ib + U] + V[ic + U]) / 3;
    const cw = (V[ia + W] + V[ib + W] + V[ic + W]) / 3;
    const dx = cu - srodekUW[0], dy = cw - srodekUW[1];
    const r = Math.hypot(dx, dy);
    if (Math.abs(r - r0) > win) continue;
    const nu = n[U], nw = n[W], l2 = Math.hypot(nu, nw); if (l2 < 0.9) continue;
    if (r < 1e-9) continue;
    const aim = Math.abs((dx * nu + dy * nw) / (r * l2));
    if (aim < cel) continue;
    rs.push(r);
    for (const i of [ia, ib, ic]) pts.push([V[i + U], V[i + W]]);
  }
  if (rs.length < 8) return { d: r0 * 2, n: rs.length };
  const fit = dopasujOkreg(pts);
  if (fit && Math.abs(fit.r - r0) < Math.max(0.8, win * 4)) {
    return { d: fit.r * 2, n: rs.length, cx: fit.cx, cy: fit.cy };
  }
  return { d: mediana(rs) * 2, n: rs.length };
}




















function dopiszKrotkieWspolosiowe(V, F, walce, P) {
  const extra = [];
  const otw = walce.filter(w => w.rodzaj === 'otwor/gniazdo' && w.srednica_mm > 8);
  for (const w of otw) {
    const el = elementyWalca(V, F, w.os, P);
    const kand = [];
    for (const e of el) {
      const d = Math.hypot(e[0] - w.srodek[0], e[1] - w.srodek[1]);
      const dr = d - w.r;
      if (dr < 2 * P.tol_r_mm || dr > 2.5) continue;
      if (d < 1e-9) continue;
      const aim = Math.abs(celZnak(e[0] - w.srodek[0], e[1] - w.srodek[1], e[2], e[3]));
      if (aim < P.celowanie) continue;
      kand.push({ e, d });
    }
    if (kand.length < 12) {
      kandydaciDbg.push({
        os: w.os, r: w.r + 1, srednica_mm: +((w.r + 1) * 2).toFixed(3),
        inlierow: kand.length, przyjety: false,
        powod_odrzucenia: 'krotki_stopien_za_malo_inlierow'
      });
      continue;
    }
    const rMed = mediana(kand.map(k => k.d));
    const uzyte = kand.filter(k => Math.abs(k.d - rMed) <= Math.max(0.25, P.tol_r_mm * 2));
    if (uzyte.length < 12) continue;
    let z0 = Infinity, z1 = -Infinity, katy = new Set();
    for (const k of uzyte) {
      if (k.e[5] < z0) z0 = k.e[5];
      if (k.e[6] > z1) z1 = k.e[6];
      katy.add(Math.round(Math.atan2(k.e[1] - w.srodek[1], k.e[0] - w.srodek[0]) * 180 / Math.PI / 5));
    }
    const pokrycie = katy.size * 5;
    const dup = walce.some(x => x.os === w.os && Math.abs(x.srednica_mm - rMed * 2) < 0.8)
      || extra.some(x => x.os === w.os && Math.abs(x.srednica_mm - rMed * 2) < 0.8);
    const dl = z1 - z0;
    const krotki = dl >= 1.5 && dl <= 8;
    const powod = [];
    if (uzyte.length < 1) powod.push('zero_trojkatow');
    if (krotki) {
      if (pokrycie < 20) powod.push('min_kat_deg');
    } else if (pokrycie < P.min_kat_deg) {
      powod.push('min_kat_deg');
    }
    if (dl < 1.5) powod.push('za_krotki');
    if (dup) powod.push('duplikat');
    kandydaciDbg.push({
      os: w.os, r: rMed, srednica_mm: +(rMed * 2).toFixed(3),
      inlierow: uzyte.length, pokrycie_kata_deg: pokrycie,
      z_od: z0, z_do: z1, przyjety: powod.length === 0,
      powod_odrzucenia: powod.join(',') || null
    });
    if (powod.length) continue;
    let doSrK = 0;
    for (const k of uzyte) {
      const dx = k.e[0] - w.srodek[0], dy = k.e[1] - w.srodek[1];
      if (celZnak(dx, dy, k.e[2], k.e[3]) <= -P.celowanie) doSrK++;
    }
    if (doSrK <= uzyte.length * 0.6) continue;
    extra.push({
      os: w.os, r: rMed, srednica_mm: +(rMed * 2).toFixed(3),
      srodek: w.srodek.slice(),
      pokrycie_kata_deg: pokrycie, trojkatow: uzyte.length, pole_mm2: uzyte.length,
      odchylenie_promienia_mm: 0,
      rodzaj: 'otwor/gniazdo',
      z_od: z0, z_do: z1
    });
  }
  return extra;
}













const PROG_NIE_WALEC_MM = 0.3;
const PROG_GWINT_PRZEKROJ_MM = 0.25;
const NKAT_PRZEKROJ_GWINT = 180;
const PROG_STOSUNEK_ZAKRES_RMIN = 2.0;
/* Sygnał: przekrój zmienia się wzdłuż osi (stożek, pogłębienie, zlepione cechy).
   Nie gwint — min po kącie przy stałym z zjada profil zwoju. */

function srednicaMinPrzepustem(V, F, os, cx, cy, od, doMm, krok) {
  const pl = plastrySrednicy(V, F, os, cx, cy, od, doMm, krok);
  if (!pl.length) return null;
  let naj = Infinity;
  for (const p of pl) if (p.d < naj) naj = p.d;
  return naj === Infinity ? null : naj;
}



function fasetaSrednicyMm(d, nKat) {
  const n = nKat > 4 ? nKat : 16;
  if (!(d > 0)) return 0;
  return d * (1 / Math.cos(Math.PI / n) - 1);
}


function plastrySrednicy(V, F, os, cx, cy, od, doMm, krok) {
  const iOs = { x: 0, y: 1, z: 2 }[os];
  if (iOs == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return [];
  const iA = [0, 1, 2].filter((i) => i !== iOs)[0];
  const iB = [0, 1, 2].filter((i) => i !== iOs)[1];
  const OD = Number(od);
  const DO = Number(doMm);
  if (!Number.isFinite(OD) || !Number.isFinite(DO) || !(DO - OD >= 0.8)) return [];
  const n = 16;
  const ks = Number.isFinite(krok) && krok > 0 ? krok : Math.max(0.05, (DO - OD) / n);
  const rMinOdcinka = (p, q) => {
    const ax = p[iA] - cx, ab = p[iB] - cy, bx = q[iA] - cx, bb = q[iB] - cy;
    const dx = bx - ax, db = bb - ab, dd = dx * dx + db * db;
    let t = dd > 1e-12 ? -(ax * dx + ab * db) / dd : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(ax + t * dx, ab + t * db);
  };
  const out = [];
  for (let s = OD; s <= DO + 1e-9; s += ks) {
    let best = Infinity;
    for (let f = 0; f + 3 <= F.length; f += 3) {
      const ia = F[f] * 3, ib = F[f + 1] * 3, ic = F[f + 2] * 3;
      const P = [
        [V[ia], V[ia + 1], V[ia + 2]],
        [V[ib], V[ib + 1], V[ib + 2]],
        [V[ic], V[ic + 1], V[ic + 2]]
      ];
      const d = P.map((v) => v[iOs] - s);
      if ((d[0] > 0 && d[1] > 0 && d[2] > 0) || (d[0] < 0 && d[1] < 0 && d[2] < 0)) continue;
      const pk = [];
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        if ((d[i] <= 0 && d[j] > 0) || (d[i] > 0 && d[j] <= 0)) {
          const u = d[i] / (d[i] - d[j]);
          pk.push(P[i].map((c, k) => c + u * (P[j][k] - P[i][k])));
        }
      }
      if (pk.length < 2) continue;
      const r = rMinOdcinka(pk[0], pk[1]);
      if (r > 0.5 && r < best) best = r;
    }
    if (best === Infinity) continue;
    out.push({ z: s, d: 2 * best });
  }
  return out;
}


function przytnijOknoPlaskie(plastry, nKat) {
  if (!plastry || plastry.length < 2) return plastry || [];
  let a = 0, b = plastry.length - 1;
  while (a < b) {
    const fa = fasetaSrednicyMm(Math.max(plastry[a].d, plastry[a + 1].d), nKat);
    if (Math.abs(plastry[a + 1].d - plastry[a].d) > fa) a++;
    else break;
  }
  while (b > a) {
    const fb = fasetaSrednicyMm(Math.max(plastry[b].d, plastry[b - 1].d), nKat);
    if (Math.abs(plastry[b].d - plastry[b - 1].d) > fb) b--;
    else break;
  }
  return plastry.slice(a, b + 1);
}


function oznaczNieWalec(cechy, V, F) {
  for (const c of cechy) {
    if (!c || c.rodzaj !== 'gniazdo_walcowe') continue;
    if (c.odmowa === 'BLAD_POMIARU' || c.odmowa === 'BŁĄD_POMIARU') continue;
    const raw = plastrySrednicy(V, F, c.os, c.cx, c.cy, c.od_mm, c.do_mm) || [];
    const pl = przytnijOknoPlaskie(raw, 16);
    if (pl.length >= 2) {
      c.od_mm = +pl[0].z.toFixed(2);
      c.do_mm = +pl[pl.length - 1].z.toFixed(2);
    }
    const ds = pl.map((p) => p.d);
    const dP = ds.length ? Math.min(...ds) : null;
    if (dP == null || !Number.isFinite(c.srednica_mm)) continue;
    c.srednica_przepust_mm = +dP.toFixed(3);
    const dlt = Math.abs(dP - c.srednica_mm);
    c.roznica_przymiarow_mm = +dlt.toFixed(3);
    const med = ds.slice().sort((a, b) => a - b)[Math.floor(ds.length / 2)];
    const zakres = Math.max(...ds) - Math.min(...ds);
    const fa = fasetaSrednicyMm(med, 16);
    if (zakres > fa) {
      if (c.odmowa) continue;
      c.odmowa = 'NIE_WALEC';
      c.pewnosc = 'niska';
      c.edytowalna = false;
      c.opis = 'przekrój zmienia się wzdłuż osi — przymiary Ø' + c.srednica_mm.toFixed(2)
        + ' vs Ø' + dP.toFixed(2) + ' (nie gwint)';
    }
  }
}













function paraSasiadowPonad(zakresy, prog) {
  if (!zakresy || zakresy.length < 2 || !(prog > 0)) return null;
  let peak = -Infinity;
  const indeksy = [];
  const wParze = new Set();
  for (let i = 0; i + 1 < zakresy.length; i++) {
    if (zakresy[i] > prog && zakresy[i + 1] > prog) {
      wParze.add(i);
      wParze.add(i + 1);
      peak = Math.max(peak, zakresy[i], zakresy[i + 1]);
    }
  }
  if (!wParze.size) return null;
  for (const i of wParze) indeksy.push(i);
  indeksy.sort((a, b) => a - b);
  return { zakres: peak, indeksy };
}










function przekrojPromieni(V, F, os, cx, cy, z, nKat) {
  const iOs = { x: 0, y: 1, z: 2 }[os];
  if (iOs == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const rest = [0, 1, 2].filter((i) => i !== iOs);
  const iA = rest[0], iB = rest[1];
  const segs = [];
  for (let f = 0; f + 3 <= F.length; f += 3) {
    const ia = F[f] * 3, ib = F[f + 1] * 3, ic = F[f + 2] * 3;
    const P = [
      [V[ia], V[ia + 1], V[ia + 2]],
      [V[ib], V[ib + 1], V[ib + 2]],
      [V[ic], V[ic + 1], V[ic + 2]]
    ];
    const d = [P[0][iOs] - z, P[1][iOs] - z, P[2][iOs] - z];
    if ((d[0] > 0 && d[1] > 0 && d[2] > 0) || (d[0] < 0 && d[1] < 0 && d[2] < 0)) continue;
    const pk = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if ((d[i] <= 0 && d[j] > 0) || (d[i] > 0 && d[j] <= 0)) {
        const den = d[i] - d[j];
        if (Math.abs(den) < 1e-18) continue;
        const u = d[i] / den;
        pk.push([P[i][iA] + u * (P[j][iA] - P[i][iA]), P[i][iB] + u * (P[j][iB] - P[i][iB])]);
      }
    }
    if (pk.length === 2) segs.push(pk);
  }
  const n = nKat || NKAT_PRZEKROJ_GWINT;
  const first = [];
  let nDrugie = 0;
  for (let k = 0; k < n; k++) {
    const th = 2 * Math.PI * k / n;
    const dx = Math.cos(th), dy = Math.sin(th);
    const ts = [];
    for (let s = 0; s < segs.length; s++) {
      const a = segs[s][0], b = segs[s][1];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const den = dx * (-ey) - dy * (-ex);
      if (Math.abs(den) < 1e-12) continue;
      const ax = a[0] - cx, ay = a[1] - cy;
      const t = (ax * (-ey) - ay * (-ex)) / den;
      const u = (dx * ay - dy * ax) / den;
      if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
    }
    ts.sort((p, q) => p - q);
    const uniq = [];
    for (let i = 0; i < ts.length; i++) {
      if (!uniq.length || ts[i] - uniq[uniq.length - 1] > 1e-4) uniq.push(ts[i]);
    }
    if (uniq.length) first.push({ t: uniq[0], th });
    if (uniq.length >= 2) nDrugie++;
  }
  if (first.length < n * 0.4) return null;
  let rMin = Infinity, rMax = -Infinity, thMax = 0, suma = 0;
  for (let i = 0; i < first.length; i++) {
    const t = first[i].t;
    suma += t;
    if (t < rMin) rMin = t;
    if (t > rMax) { rMax = t; thMax = first[i].th; }
  }
  return {
    rMin, rMax, zakres: rMax - rMin, rMed: suma / first.length,
    dwaTrafienia: nDrugie >= first.length * 0.5, katMax: thMax, nKat: n, z
  };
}











function oznaczGwintLubNiewalec(cechy, V, F, walce, bb) {
  const PROG = PROG_GWINT_PRZEKROJ_MM;
  const rDyszy = (typeof PROMIEN_DYSZY_MM === 'number' && PROMIEN_DYSZY_MM > 0)
    ? PROMIEN_DYSZY_MM
    : ((typeof window !== 'undefined' && window.P2S && window.P2S.PROMIEN_DYSZY_MM > 0)
      ? window.P2S.PROMIEN_DYSZY_MM
      : (typeof sciankaMin === 'function' ? sciankaMin() / 2 : 0));
  if (!(rDyszy > 0)) throw new Error('brak PROMIEN_DYSZY_MM');
  /** Fazka w mm, nie procent wysokości części. 18–82% części wchodzi w fazy
   *  albo omija krótką cechę przy krawędzi — ta sama lekcja co zasiegCiecia. */
  const pasmoCechyNieCzesci = (od, doMm, zMinCzesci, zMaxCzesci) => {
    const OD = Number(od), DO = Number(doMm);
    if (!Number.isFinite(OD) || !Number.isFinite(DO) || DO - OD < 0.8) return null;
    const h = DO - OD;
    const hCz = (Number.isFinite(zMaxCzesci) && Number.isFinite(zMinCzesci))
      ? (zMaxCzesci - zMinCzesci) : h;
    const calaCzesc = hCz > 0.8 && h > hCz * 0.85;
    const pad = calaCzesc ? Math.min(0.35, h * 0.08) : Math.min(0.30, h * 0.12);
    let lo = OD + pad, hi = DO - pad;
    if (hi - lo < 0.6) { lo = OD; hi = DO; }
    return { lo, hi };
  };
  const indeksy = (os) => {
    const iOs = { x: 0, y: 1, z: 2 }[os];
    const rest = [0, 1, 2].filter((i) => i !== iOs);
    return { iOs, iA: rest[0], iB: rest[1] };
  };
  /** Połowa mniejszego boku prostopadle do osi cechy — nie stała mm.
   *  r_max poza tym = zewnętrzna granica poza materiałem. */
  const polgabarytProstopadle = (os) => {
    if (!bb || !bb.min || !bb.max) return null;
    const { iA, iB } = indeksy(os);
    const ha = (bb.max[iA] - bb.min[iA]) / 2;
    const hb = (bb.max[iB] - bb.min[iB]) / 2;
    if (!Number.isFinite(ha) || !Number.isFinite(hb)) return null;
    return Math.min(ha, hb);
  };
  const skokZKatow = (probki) => {
    if (!probki || probki.length < 4) return null;
    const ang = [probki[0].th];
    for (let i = 1; i < probki.length; i++) {
      let t = probki[i].th;
      while (t - ang[i - 1] > Math.PI) t -= 2 * Math.PI;
      while (t - ang[i - 1] < -Math.PI) t += 2 * Math.PI;
      ang.push(t);
    }
    const n = probki.length;
    let mz = 0, ma = 0;
    for (let i = 0; i < n; i++) { mz += probki[i].z; ma += ang[i]; }
    mz /= n; ma /= n;
    let szz = 0, sza = 0;
    for (let i = 0; i < n; i++) {
      const dz = probki[i].z - mz;
      szz += dz * dz;
      sza += dz * (ang[i] - ma);
    }
    if (szz < 1e-12) return null;
    const a = sza / szz;
    if (Math.abs(a) < 0.05) return null;
    const pitch = Math.abs((2 * Math.PI) / a);
    if (!(pitch >= 0.25 && pitch <= 8)) return null;
    return pitch;
  };
  const zmierz = (os, cx, cy, od, doMm) => {
    const { iOs } = indeksy(os);
    const zMinC = bb && bb.min ? bb.min[iOs] : od;
    const zMaxC = bb && bb.max ? bb.max[iOs] : doMm;
    const pas = pasmoCechyNieCzesci(od, doMm, zMinC, zMaxC);
    if (!pas) return null;
    const span = pas.hi - pas.lo;
    const nZ = Math.min(24, Math.max(8, Math.round(span / 0.25) + 1));
    const ks = span / (nZ - 1);
    const wiersze = [];
    for (let i = 0; i < nZ; i++) {
      const z = pas.lo + i * ks;
      const p = przekrojPromieni(V, F, os, cx, cy, z, NKAT_PRZEKROJ_GWINT);
      const ok = p && p.dwaTrafienia;
      wiersze.push({
        z,
        zakres: ok ? p.zakres : 0,
        rMin: ok ? p.rMin : null,
        rMax: ok ? p.rMax : null,
        katMax: ok ? p.katMax : null
      });
    }
    const rMinAll = wiersze.map((w) => w.rMin).filter((r) => r != null);
    if (rMinAll.length < 4) return null;
    const rMed = mediana(rMinAll);
    const prog = Math.max(PROG, 0.08 * rMed);
    const para = paraSasiadowPonad(wiersze.map((w) => w.zakres), prog);
    if (!para) return null;
    const rMinPara = Math.min(
      ...para.indeksy.map((i) => wiersze[i].rMin).filter((r) => r != null)
    );
    const stosunek = (Number.isFinite(rMinPara) && rMinPara > 0)
      ? para.zakres / rMinPara
      : Infinity;
    const katy = para.indeksy
      .map((i) => wiersze[i])
      .filter((w) => w.katMax != null)
      .map((w) => ({ z: w.z, th: w.katMax }));
    const rMaxGw = Math.max(...para.indeksy.map((i) => wiersze[i].rMax).filter((r) => r != null));
    const rec = {
      zakres: para.zakres, rMin: rMinPara, rMax: rMaxGw,
      przepust: 2 * rMinPara, skok: skokZKatow(katy), stosunek
    };
    // rMin < dysza: BLAD_POMIARU (stosunek → ∞ przy rMin → 0).
    // rMin może przejść dyszę (tutucu1 ≈0,995), a zakres/rMin i tak jest śmieciem.
    if (!Number.isFinite(rMinPara) || rMinPara < rDyszy
        || stosunek >= PROG_STOSUNEK_ZAKRES_RMIN) rec.blad = true;
    return rec;
  };
  const osie = [];
  const dodaj = (os, cx, cy, od, doMm, cecha) => {
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
    const hit = osie.find((o) => o.os === os && Math.hypot(o.cx - cx, o.cy - cy) < 0.8);
    if (hit) {
      if (cecha && !hit.cecha) hit.cecha = cecha;
      return;
    }
    osie.push({ os, cx, cy, od, do: doMm, cecha: cecha || null });
  };
  for (const c of cechy) {
    if (c.rodzaj === 'gniazdo_walcowe') dodaj(c.os, c.cx, c.cy, c.od_mm, c.do_mm, c);
  }
  for (const w of walce || []) {
    const xy = xyPoObrocie(w.os, w.srodek);
    const { iOs } = indeksy(w.os);
    let od = w.z_od, doMm = w.z_do;
    if ((!Number.isFinite(od) || !Number.isFinite(doMm)) && bb && bb.min && bb.max) {
      od = bb.min[iOs];
      doMm = bb.max[iOs];
    }
    dodaj(w.os, xy[0], xy[1], od, doMm, null);
  }
  if (bb && bb.min && bb.max) {
    for (const os of ['x', 'y', 'z']) {
      const { iA, iB, iOs } = indeksy(os);
      dodaj(os, (bb.min[iA] + bb.max[iA]) / 2, (bb.min[iB] + bb.max[iB]) / 2,
        bb.min[iOs], bb.max[iOs], null);
    }
  }
  const kandydaci = [];
  for (const o of osie) {
    const g = zmierz(o.os, o.cx, o.cy, o.od, o.do);
    if (!g) continue;
    const pol = polgabarytProstopadle(o.os);
    if (Number.isFinite(g.rMax) && Number.isFinite(pol) && g.rMax > pol) {
      const stosLog = Number.isFinite(g.stosunek) ? +g.stosunek.toFixed(3) : null;
      console.log('ZASIEG odrzut', JSON.stringify({
        os: o.os,
        r_max: +g.rMax.toFixed(3),
        polgabaryt: +pol.toFixed(3),
        stosunek: stosLog
      }));
      g.blad = true;
      g.zasieg = { r_max: g.rMax, polgabaryt: pol, stosunek: g.stosunek };
    }
    kandydaci.push({ o, g });
  }
  const bledy = kandydaci.filter((k) => k.g.blad);
  let best = null;
  for (const k of kandydaci) {
    if (k.g.blad) continue;
    if (!best || k.g.zakres > best.g.zakres) best = k;
  }
  const nowyId = () => {
    let maxId = 0;
    for (const c of cechy) if ((c.id || 0) > maxId) maxId = c.id;
    return maxId + 1;
  };
  for (const { o, g } of bledy) {
    const stos = Number.isFinite(g.stosunek) ? g.stosunek.toFixed(2) : '∞';
    const rTxt = Number.isFinite(g.rMin) ? g.rMin.toFixed(3) : String(g.rMin);
    const podDysza = !Number.isFinite(g.rMin) || g.rMin < rDyszy;
    const zas = g.zasieg;
    const opisBlad = zas
      ? ('pomiar niemożliwy — r_max=' + Number(zas.r_max).toFixed(2)
        + ' mm > półgabaryt ⊥ ' + Number(zas.polgabaryt).toFixed(2)
        + ' mm (oś ' + o.os + ', zakres/rMin = ' + stos
        + '). Otwór nie może wychodzić poza materiał.')
      : (podDysza
        ? ('pomiar niemożliwy — promień ' + rTxt + ' mm poniżej promienia dyszy ('
          + rDyszy.toFixed(2) + ' mm = SCIANKA_DRUKOWALNA/2); zakres/rMin = ' + stos
          + '. To zepsuty pomiar, nie otwór.')
        : ('pomiar niemożliwy — zakres/rMin = ' + stos + ' ≥ ' + PROG_STOSUNEK_ZAKRES_RMIN
          + ' (rMin=' + rTxt + ' mm przechodzi próg dyszy ' + rDyszy.toFixed(2)
          + ' mm). To zepsuta oś, nie gwint.'));
    kandydaciDbg.push({
      os: o.os, r: g.rMin, srednica_mm: Number.isFinite(g.przepust) ? +g.przepust.toFixed(3) : null,
      srodek: [o.cx, o.cy], inlierow: 0, pokrycie_kata_deg: 0,
      przyjety: false, powod_odrzucenia: 'BLAD_POMIARU',
      zakres_promienia_mm: +g.zakres.toFixed(3),
      stosunek_zakres_rmin: Number.isFinite(g.stosunek) ? +g.stosunek.toFixed(3) : null
    });
    cechy.push({
      id: nowyId(),
      rodzaj: 'gniazdo_walcowe',
      os: o.os, cx: o.cx, cy: o.cy,
      od_mm: Number.isFinite(o.od) ? +Number(o.od).toFixed(2) : null,
      do_mm: Number.isFinite(o.do) ? +Number(o.do).toFixed(2) : null,
      dowody: {
        pokrycie_kata_deg: 0, trojkatow: 1, zgodnych_przekrojow: 0,
        odchylenie_promienia_mm: g.zakres, stosunek_zakres_rmin: Number.isFinite(g.stosunek) ? +g.stosunek.toFixed(3) : null
      },
      odmowa: 'BLAD_POMIARU',
      pewnosc: 'niska',
      edytowalna: false,
      zakres_promienia_mm: +g.zakres.toFixed(3),
      przepust_mm: Number.isFinite(g.przepust) ? +g.przepust.toFixed(3) : null,
      stosunek_zakres_rmin: Number.isFinite(g.stosunek) ? +g.stosunek.toFixed(3) : null,
      srednica_mm: Number.isFinite(g.przepust) ? +g.przepust.toFixed(3) : null,
      r: Number.isFinite(g.rMin) ? g.rMin : null,
      opis: opisBlad
    });
  }
  if (!best) return;
  const g = best.g, o = best.o;
  const skokTxt = Number.isFinite(g.skok) ? ('skok ' + g.skok.toFixed(2) + ' mm') : 'skok niejednoznaczny';
  const opis = 'gwint lub niewalec w przekroju — ' + skokTxt
    + '; gładki wałek przechodzi Ø' + g.przepust.toFixed(2) + ' (nie podaję jednej Ø)';
  const pola = {
    odmowa: 'GWINT_LUB_NIEWALEC',
    pewnosc: 'niska',
    edytowalna: false,
    skok_mm: Number.isFinite(g.skok) ? +g.skok.toFixed(3) : null,
    zakres_promienia_mm: +g.zakres.toFixed(3),
    przepust_mm: +g.przepust.toFixed(3),
    stosunek_zakres_rmin: Number.isFinite(g.stosunek) ? +g.stosunek.toFixed(3) : null,
    srednica_mm: +g.przepust.toFixed(3),
    r: g.przepust / 2,
    opis
  };
  if (o.cecha && o.cecha.rodzaj === 'gniazdo_walcowe') {
    Object.assign(o.cecha, pola);
    return;
  }
  cechy.push({
    id: nowyId(),
    rodzaj: 'gniazdo_walcowe',
    os: o.os, cx: o.cx, cy: o.cy,
    od_mm: Number.isFinite(o.od) ? +Number(o.od).toFixed(2) : null,
    do_mm: Number.isFinite(o.do) ? +Number(o.do).toFixed(2) : null,
    dowody: { pokrycie_kata_deg: 0, trojkatow: 1, zgodnych_przekrojow: 0, odchylenie_promienia_mm: g.zakres },
    ...pola
  });
}












function katalogZCech(m, V, F, P) {
  kandydaciDbg.length = 0;
  const bb = m.boundingBox();
  const gab = [
    +(bb.max[0] - bb.min[0]).toFixed(2),
    +(bb.max[1] - bb.min[1]).toFixed(2),
    +(bb.max[2] - bb.min[2]).toFixed(2)
  ];
  const walce = [];
  for (const os of ['x', 'y', 'z']) walce.push(...walceZNormalnych(V, F, os, P));
  walce.push(...dopiszKrotkieWspolosiowe(V, F, walce, P));
  walce.sort((a, b) => b.pole_mm2 - a.pole_mm2);
  const gniazdaW = walce.filter(w => w.rodzaj === 'otwor/gniazdo' && w.srednica_mm > 8);
  const osGl = gniazdaW[0]?.os || walce[0]?.os || 'y';
  const srGl = gniazdaW[0]?.srodek || walce[0]?.srodek || [0, 0];
  const skan = skanPromieniowy(m, osGl, srGl, P);
  const wzory = [];
  for (const os of ['x', 'y', 'z']) wzory.push(...wzoryOtworow(m, os, P));

  const cechy = [];
  let id = 1;
  const uzyteWalce = new Set();
  const stopnie = skan.stopnie.filter(s => s.srednica_mm > 8 && (s.do_mm - s.od_mm) >= Math.min(1.6, P.krok_skanu_mm * 0.6));
  let nrStopnia = 0;
  for (const st of stopnie) {
    const zA = tNaOsAbs(st.os, st.z0, st.od_mm);
    const zB = tNaOsAbs(st.os, st.z0, st.do_mm);
    const zLo = Math.min(zA, zB), zHi = Math.max(zA, zB);
    const overlap = (w) => Math.min(w.z_do, zHi) - Math.max(w.z_od, zLo);
    let w = gniazdaW.find(x => x.os === st.os && Math.abs(x.srednica_mm - st.srednica_mm) < 1.0 && overlap(x) > 1);
    if (w && uzyteWalce.has(w)) w = null;
    const srodekUW = w ? w.srodek : (st.os === 'z' ? st.srodek : [st.srodek[1], st.srodek[0]]);
    const r0 = w?.r ?? st.r;
    const zLo2 = zLo + Math.min(0.4, Math.max(0, (zHi - zLo) * 0.08));
    const zHi2 = zHi - Math.min(0.4, Math.max(0, (zHi - zLo) * 0.08));
    const pas = srednicaWPasmie(V, F, st.os, srodekUW, zLo2, zHi2, r0, P);
    const tri = (w && w.trojkatow) || pas.n || 0;
    if (tri < 8) continue;
    const d = +(pas.n >= 8 ? pas.d : (w && Math.abs(w.srednica_mm - st.srednica_mm) < 0.8 ? w.srednica_mm : st.srednica_mm)).toFixed(3);
    if (!w) {
      const dupC = cechy.some(c => c.rodzaj === 'gniazdo_walcowe' && c.os === st.os && Math.abs(c.srednica_mm - d) < 1.0);
      if (dupC || pas.n < 8) continue;
    }
    const polK = (P.krok_skanu_mm || 2) * 0.48;
    let odW = zLo - polK, doW = zHi + polK;
    if (w && Number.isFinite(w.z_od) && Number.isFinite(w.z_do)) {
      const wLo = Math.min(w.z_od, w.z_do), wHi = Math.max(w.z_od, w.z_do);
      odW = Math.max(wLo, odW);
      doW = Math.min(wHi, doW);
      if (doW - odW < 1.5) { odW = wLo; doW = wHi; }
    }
    const dowody = {
      pokrycie_kata_deg: w?.pokrycie_kata_deg ?? 0,
      trojkatow: tri,
      udzial_pola: walce[0] && w ? +(w.pole_mm2 / walce[0].pole_mm2).toFixed(3) : 0,
      zgodnych_przekrojow: st.zgodnych_przekrojow,
      odchylenie_promienia_mm: st.odchylenie_promienia_mm
    };
    const pewnosc = pasmo(dowody);
    const czopy = walce.filter(x => x.os === st.os && x.rodzaj === 'czop/walek');
    nrStopnia++;
    const rec = {
      id: id++, rodzaj: 'gniazdo_walcowe', opis: `gniazdo walcowe, stopień ${nrStopnia}`,
      os: st.os, srednica_mm: d, r: d / 2,
      od_mm: +Math.min(odW, doW).toFixed(2), do_mm: +Math.max(odW, doW).toFixed(2),
      z0: st.z0, cx: st.srodek[0], cy: st.srodek[1],
      gardziel_deg: st.gardziel_deg, gardziel_od_deg: st.gardziel_od_deg,
      r_zewnetrzny: Math.max(...czopy.map(x => x.r), d / 2 + 6),
      dowody, pewnosc, edytowalna: pewnosc !== 'niska'
    };
    if (w) uzyteWalce.add(w);
    console.log(`DET ${rec.id} · Ø${rec.srednica_mm} · zakres ${rec.od_mm}–${rec.do_mm}`);
    cechy.push(rec);
  }
  for (const w of gniazdaW) {
    if (uzyteWalce.has(w) || !w.trojkatow) continue;
    const d = +w.srednica_mm.toFixed(3);
    const [CX, CY] = xyPoObrocie(w.os, w.srodek);
    const dowody = {
      pokrycie_kata_deg: w.pokrycie_kata_deg, trojkatow: w.trojkatow,
      udzial_pola: walce[0] ? +(w.pole_mm2 / walce[0].pole_mm2).toFixed(3) : 0,
      zgodnych_przekrojow: w.pokrycie_kata_deg >= 80 ? 2 : 1,
      odchylenie_promienia_mm: w.odchylenie_promienia_mm
    };
    const pewnosc = pasmo(dowody);
    nrStopnia++;
    const rec = {
      id: id++, rodzaj: 'gniazdo_walcowe', opis: `gniazdo walcowe, stopień ${nrStopnia}`,
      os: w.os, srednica_mm: d, r: d / 2,
      od_mm: +Math.min(w.z_od, w.z_do).toFixed(2), do_mm: +Math.max(w.z_od, w.z_do).toFixed(2),
      z0: skan.z0, cx: CX, cy: CY,
      r_zewnetrzny: d / 2 + 6,
      dowody, pewnosc, edytowalna: pewnosc !== 'niska'
    };
    console.log(`DET ${rec.id} · Ø${rec.srednica_mm} · zakres ${rec.od_mm}–${rec.do_mm}`);
    cechy.push(rec);
  }
  for (const w of walce.filter(x => x.rodzaj === 'czop/walek' && x.srednica_mm > 10)) {
    if (!w.trojkatow) continue;
    const dowody = {
      pokrycie_kata_deg: w.pokrycie_kata_deg, trojkatow: w.trojkatow,
      udzial_pola: walce[0] ? +(w.pole_mm2 / walce[0].pole_mm2).toFixed(3) : 0,
      zgodnych_przekrojow: w.pokrycie_kata_deg >= 120 ? 3 : 1,
      odchylenie_promienia_mm: w.odchylenie_promienia_mm
    };
    const pewnosc = pasmo(dowody);
    cechy.push({
      id: id++, rodzaj: 'czop_walcowy', opis: `czop/wałek Ø${w.srednica_mm.toFixed(2)}`,
      os: w.os, srednica_mm: w.srednica_mm, r: w.r, srodek: w.srodek,
      zakres_nd: true, od_mm: null, do_mm: null,
      dowody, pewnosc, edytowalna: pewnosc !== 'niska'
    });
  }
  for (const wz of wzory) {
    const siatka = wz.sztuk >= 4 && wz.rozstaw_mm?.[0] > 5 && wz.rozstaw_mm?.[1] > 5;
    const pewnosc = (wz.kolistosc_mm <= 0.05 && (wz.zgodnych_przekrojow >= 3 || siatka)) ? 'wysoka'
      : (wz.kolistosc_mm <= 0.15 && (wz.zgodnych_przekrojow >= 2 || siatka)) ? 'srednia' : 'niska';
    cechy.push({
      id: id++, rodzaj: 'wzor_otworow', opis: `${wz.sztuk} otwory montażowe`,
      os: wz.os, srednica_mm: wz.srednica_mm, sztuk: wz.sztuk, rozstaw_mm: wz.rozstaw_mm,
      srodki: wz.srodki, zakres_nd: true, od_mm: null, do_mm: null,
      dowody: { kolistosc_mm: wz.kolistosc_mm, zgodnych_przekrojow: wz.zgodnych_przekrojow },
      pewnosc, edytowalna: pewnosc !== 'niska'
    });
  }
  const gniazdaC = cechy.filter(c => c.rodzaj === 'gniazdo_walcowe');
  const drop = new Set();
  for (const c of gniazdaC) {
    if (c.pewnosc !== 'niska') continue;
    const kolizja = gniazdaC.some(o => o !== c && o.pewnosc !== 'niska' && o.os === c.os
      && Math.abs(o.srednica_mm - c.srednica_mm) > 0.8
      && Number.isFinite(o.od_mm) && Number.isFinite(c.od_mm)
      && Math.min(o.do_mm, c.do_mm) - Math.max(o.od_mm, c.od_mm) > 2);
    if (kolizja) drop.add(c);
  }
  if (drop.size) {
    for (let i = cechy.length - 1; i >= 0; i--) if (drop.has(cechy[i])) cechy.splice(i, 1);
  }
  for (let i = cechy.length - 1; i >= 0; i--) {
    const c = cechy[i];
    if ((c.rodzaj === 'gniazdo_walcowe' || c.rodzaj === 'czop_walcowy') && !(c.dowody?.trojkatow > 0)) {
      if (c.odmowa) continue;
      cechy.splice(i, 1);
    }
  }
  oznaczNieWalec(cechy, V, F);
  oznaczGwintLubNiewalec(cechy, V, F, walce, bb);
  let nKomp = 1;
  try { const d = m.decompose(); nKomp = d.length; usun(d); } catch {}
  const RANK_PEWNOSC = { wysoka: 0, srednia: 1, niska: 2 };
  cechy.sort((a, b) => {
    const oa = a.odmowa ? 0 : 1;
    const ob = b.odmowa ? 0 : 1;
    if (oa !== ob) return oa - ob;
    const ra = RANK_PEWNOSC[a.pewnosc] ?? 1;
    const rb = RANK_PEWNOSC[b.pewnosc] ?? 1;
    if (ra !== rb) return ra - rb;
    return (b.srednica_mm || 0) - (a.srednica_mm || 0);
  });
  return {
    gabaryt_mm: gab, bbox: { min: bb.min.slice(), max: bb.max.slice() },
    objetosc_cm3: +(m.volume() / 1000).toFixed(2), objetosc_mm3: +m.volume().toFixed(2),
    szczelny: true, komponentow: nKomp, os_skanu: osGl, z0_skanu: skan.z0,
    P, walce, cechy, rodzaje_rezerwa: RODZAJE_REZERWA,
    kandydaci: kandydaciDbg.slice(), stopnie_skanu: skan.stopnie
  };
}






















function rozpoznaj(sciezkaLubMesh) {
  const t0 = Date.now();
  let V, F, m, nTri;
  if (typeof sciezkaLubMesh === 'string') {
    const siatka = wczytajPlik(sciezkaLubMesh, 1e-3);
    let tmp;
    try {
      tmp = Manifold.ofMesh({ numProp: 3, vertProperties: siatka.V, triVerts: siatka.F });
    } catch (e) {
      const err = new Error(KOM_USZKODZONY);
      err.kod = 'USZKODZONY';
      err.przyczyna = String(e && e.message || e);
      throw err;
    }
    const P0 = progiZGabarytu(tmp.boundingBox());
    tmp.delete();
    const z = zgrzej(siatka.V, siatka.F, P0.zgrzew_mm);
    V = z.V; F = z.F; nTri = F.length / 3;
    m = brylaZSiatki(V, F);
  } else {
    m = sciezkaLubMesh;
    const mesh = m.getMesh();
    V = mesh.vertProperties; F = mesh.triVerts; nTri = F.length / 3;
  }
  const P = progiZGabarytu(m.boundingBox());
  const kat = katalogZCech(m, V, F, P);
  kat.trojkatow = nTri;
  kat.czas_ms = Date.now() - t0;
  kat._solid = m;
  return kat;
}

function deltaRZobwodu(deltaC_mm) {
  const c = +deltaC_mm;
  if (!(c > 0) || !isFinite(c)) throw new Error('Delta obwodu musi być > 0 mm');
  return c / (2 * Math.PI);
}

function wybierzObrecz(kat) {
  const gn = (kat.cechy || []).filter(c =>
    c.rodzaj === 'gniazdo_walcowe' && c.pewnosc !== 'niska'
    && Number.isFinite(c.cx) && Number.isFinite(c.cy) && c.srednica_mm > 8);
  if (!gn.length) return null;
  gn.sort((a, b) => (b.srednica_mm || 0) - (a.srednica_mm || 0));
  return gn[0];
}

function rZewObreczy(kat, hoop) {
  const czopy = (kat.cechy || []).filter(c =>
    c.rodzaj === 'czop_walcowy' && c.os === hoop.os && (c.srednica_mm || 0) > hoop.srednica_mm);
  czopy.sort((a, b) => (b.srednica_mm || 0) - (a.srednica_mm || 0));
  if (czopy[0]) return czopy[0].srednica_mm / 2;
  if (Number.isFinite(hoop.r_zewnetrzny)) return hoop.r_zewnetrzny;
  return hoop.srednica_mm / 2 + 6;
}

function promienSwiat(os, cx, cy, x, y, z) {
  if (os === 'y') return Math.hypot(x - cx, z - cy);
  if (os === 'x') return Math.hypot(z - cx, y - cy);
  return Math.hypot(x - cx, y - cy);
}

function punktPromieniowo(os, cx, cy, x, y, z, s) {
  if (os === 'y') return [cx + (x - cx) * s, y, cy + (z - cy) * s];
  if (os === 'x') return [x, cy + (y - cy) * s, cx + (z - cx) * s];
  return [cx + (x - cx) * s, cy + (y - cy) * s, z];
}

function dodatekRamienia(r, rOuter, extraRamie, overhangMax) {
  if (!(extraRamie > 0) || r <= rOuter || !(overhangMax > 0)) return 0;
  return extraRamie * Math.min(1, (r - rOuter) / overhangMax);
}

function rMaxSiatki(mesh, os, cx, cy) {
  const V = mesh.vertProperties;
  const np = mesh.numProp || 3;
  const n = V.length / np;
  let rMax = 0, rMin = Infinity;
  for (let i = 0; i < n; i++) {
    const r = promienSwiat(os, cx, cy, V[i * np], V[i * np + 1], V[i * np + 2]);
    rMax = Math.max(rMax, r);
    rMin = Math.min(rMin, r);
  }
  return { rMin, rMax };
}

function srodekOtworuSwiat(os, p, mid) {
  if (os === 'x') return { x: mid[0], y: p[1], z: p[0] };
  if (os === 'y') return { x: p[1], y: mid[1], z: p[0] };
  return { x: p[0], y: p[1], z: mid[2] };
}

function przywrocOtworyPoObwodzie(solid, kat, hoop, deltaR, extraRamie, rOuter, overhangMax) {
  const holes = (kat.cechy || []).filter(c =>
    c.rodzaj === 'wzor_otworow' && (c.srodki || []).length && c.srednica_mm > 0.8);
  if (!holes.length) return { wynik: solid, otwory: 'brak' };
  const bb0 = solid.boundingBox();
  const mn = Array.isArray(bb0.min) ? bb0.min.slice() : [bb0.min.x, bb0.min.y, bb0.min.z];
  const mx = Array.isArray(bb0.max) ? bb0.max.slice() : [bb0.max.x, bb0.max.y, bb0.max.z];
  const mid = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  const arena = [];
  const K = o => (arena.push(o), o);
  let cur = solid;
  try {
    for (const h of holes) {
      const rNom = h.srednica_mm / 2;
      const rFill = rNom + 2.4;
      const axis = h.os || 'x';
      const span = axis === 'x' ? (mx[0] - mn[0]) : axis === 'y' ? (mx[1] - mn[1]) : (mx[2] - mn[2]);
      const H = span + 12;
      for (const p of h.srodki) {
        const w0 = srodekOtworuSwiat(axis, p, mid);
        const r = promienSwiat(hoop.os, hoop.cx, hoop.cy, w0.x, w0.y, w0.z);
        const add = deltaR + dodatekRamienia(r, rOuter, extraRamie, overhangMax);
        const s = r > 1e-9 ? (r + add) / r : 1;
        const xyz = punktPromieniowo(hoop.os, hoop.cx, hoop.cy, w0.x, w0.y, w0.z, s);
        let fill = Manifold.cylinder(H, rFill, rFill, 48);
        let cut = Manifold.cylinder(H, rNom, rNom, 64);
        if (axis === 'x') {
          fill = fill.rotate(0, 90, 0);
          cut = cut.rotate(0, 90, 0);
          fill = fill.translate(mn[0] - 6, xyz[1], xyz[2]);
          cut = cut.translate(mn[0] - 6, xyz[1], xyz[2]);
        } else if (axis === 'y') {
          fill = fill.rotate(-90, 0, 0);
          cut = cut.rotate(-90, 0, 0);
          fill = fill.translate(xyz[0], mn[1] - 6, xyz[2]);
          cut = cut.translate(xyz[0], mn[1] - 6, xyz[2]);
        } else {
          fill = fill.translate(xyz[0], xyz[1], mn[2] - 6);
          cut = cut.translate(xyz[0], xyz[1], mn[2] - 6);
        }
        K(fill); K(cut);
        const dodany = K(cur.add(fill));
        if (cur !== solid) { try { cur.delete(); } catch (eDel) {} }
        cur = K(dodany.subtract(cut));
      }
    }
    return { wynik: cur, otwory: 'przywrocono', arena };
  } catch (e) {
    if (cur !== solid) { try { cur.delete(); } catch (e2) {} }
    usun(arena);
    return { wynik: solid, otwory: 'pominieto: ' + (e && e.message || e) };
  }
}

function dodajDziurkeBrelok(solid, opts) {
  opts = opts || {};
  const d = +(opts.srednica_mm || 5.2);
  const wall = +(opts.scianka_mm || 2.2);
  if (!(d >= 3) || d > 12) throw new Error('Ø dziurki breloka 3–12 mm');
  const b0 = bboxWym(solid);
  const mn = b0[3], mx = b0[4], size = [b0[0], b0[1], b0[2]];
  let axis = size[1] >= size[0] && size[1] >= size[2] ? 1 : (size[2] >= size[0] && size[2] >= size[1] ? 2 : 0);
  let thru = size[0] <= size[1] && size[0] <= size[2] ? 0 : (size[1] <= size[0] && size[1] <= size[2] ? 1 : 2);
  if (thru === axis) thru = axis === 2 ? 0 : 2;
  const rem = [0, 1, 2].find(function (i) { return i !== axis && i !== thru; });
  const lugLen = Math.max(d + 2 * wall, 12);
  const lug = [0, 0, 0];
  lug[axis] = lugLen;
  lug[thru] = size[thru];
  lug[rem] = Math.min(size[rem], Math.max(d + 2 * wall, 14));
  const pos = mn.slice();
  pos[axis] = mx[axis];
  pos[rem] = mn[rem] + (size[rem] - lug[rem]) / 2;
  pos[thru] = mn[thru];
  const arena = [];
  const K = function (o) { arena.push(o); return o; };
  const tab = K(Manifold.cube(lug).translate(pos[0], pos[1], pos[2]));
  const withTab = K(solid.add(tab));
  const holeC = [pos[0] + lug[0] / 2, pos[1] + lug[1] / 2, pos[2] + lug[2] / 2];
  holeC[axis] = mx[axis] + lugLen - (d / 2 + wall);
  const L = size[thru] + 10;
  let cyl = Manifold.cylinder(L, d / 2, d / 2, 48);
  if (thru === 0) cyl = cyl.rotate(0, 90, 0).translate(holeC[0] - L / 2, holeC[1], holeC[2]);
  else if (thru === 1) cyl = cyl.rotate(-90, 0, 0).translate(holeC[0], holeC[1] - L / 2, holeC[2]);
  else cyl = cyl.translate(holeC[0], holeC[1], holeC[2] - L / 2);
  K(cyl);
  const out = K(withTab.subtract(cyl));
  if (typeof out.isEmpty === 'function' && out.isEmpty()) throw new Error('Dziurka zjadła całą bryłę');
  const b1 = bboxWym(out);
  if (b1[axis] + 0.2 < size[axis]) throw new Error('Dziurka skróciła model — zjadła ściankę');
  const vol0 = solid.volume(), vol1 = out.volume();
  if (vol1 < vol0 * 0.55) throw new Error('Dziurka zjadła za dużo objętości');
  return {
    wynik: out, srednica_mm: d, punkt_mm: holeC,
    os: thru === 0 ? 'x' : thru === 1 ? 'y' : 'z',
    lug_mm: lugLen, scianka_mm: wall, vol0: vol0, vol1: vol1, arena: arena
  };
}

function wydluzOsiowo(solid, extra_mm, osHint) {
  const extra = +extra_mm;
  if (!(extra > 0) || extra > 200) throw new Error('Wydłużenie 0–200 mm');
  const mesh = solid.getMesh();
  const np = mesh.numProp || 3;
  const V0 = mesh.vertProperties;
  const n = V0.length / np;
  const b0 = bboxWym(solid);
  const mn = b0[3], mx = b0[4], size = [b0[0], b0[1], b0[2]];
  let axis = 0;
  if (osHint === 'x' || osHint === 0) axis = 0;
  else if (osHint === 'y' || osHint === 1) axis = 1;
  else if (osHint === 'z' || osHint === 2) axis = 2;
  else axis = size[1] >= size[0] ? 1 : 0;
  const span = size[axis];
  const margin = Math.min(span * 0.32, Math.max(5, span * 0.22));
  const lo = mn[axis] + margin, hi = mx[axis] - margin;
  const V = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = [V0[i * np], V0[i * np + 1], V0[i * np + 2]];
    if (p[axis] <= lo) p[axis] -= extra;
    else if (p[axis] >= hi) p[axis] += extra;
    V[i * 3] = p[0]; V[i * 3 + 1] = p[1]; V[i * 3 + 2] = p[2];
  }
  const wynik = Manifold.ofMesh({ numProp: 3, vertProperties: V, triVerts: mesh.triVerts });
  return {
    wynik: wynik, extra_mm: extra,
    os: axis === 0 ? 'x' : axis === 1 ? 'y' : 'z',
    bbox_przed: size, bbox_po: bboxWym(wynik).slice(0, 3)
  };
}

function powiekszObwodIRamiona(solid, kat, opts) {
  opts = opts || {};
  const hoop = opts.hoop || wybierzObrecz(kat);
  if (!hoop) {
    const err = new Error('Nie znalazłem obręczy (gniazdo walcowe). Wskaż kafelek albo wczytaj inny plik.');
    err.kod = 'BRAK_OBRECZY';
    throw err;
  }
  const deltaC = +(opts.deltaC_mm || 0);
  const extraRamie = Math.max(0, +(opts.extraRamie_mm || 0));
  if (!(deltaC > 0) && !(extraRamie > 0)) {
    throw new Error('Podaj Δ obwodu w mm albo wydłużenie ramion w mm.');
  }
  const deltaR = deltaC > 0 ? deltaRZobwodu(deltaC) : 0;
  const rOuter = rZewObreczy(kat, hoop);
  const mesh0 = solid.getMesh();
  const span0 = rMaxSiatki(mesh0, hoop.os, hoop.cx, hoop.cy);
  const overhangMax = Math.max(0.5, span0.rMax - rOuter);
  const np = mesh0.numProp || 3;
  const V0 = mesh0.vertProperties;
  const nV = V0.length / np;
  const V = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    const x = V0[i * np], y = V0[i * np + 1], z = V0[i * np + 2];
    const r = promienSwiat(hoop.os, hoop.cx, hoop.cy, x, y, z);
    const add = deltaR + dodatekRamienia(r, rOuter, extraRamie, overhangMax);
    const s = r > 1e-9 ? (r + add) / r : 1;
    const xyz = punktPromieniowo(hoop.os, hoop.cx, hoop.cy, x, y, z, s);
    V[i * 3] = xyz[0]; V[i * 3 + 1] = xyz[1]; V[i * 3 + 2] = xyz[2];
  }
  const F = mesh0.triVerts instanceof Uint32Array ? mesh0.triVerts : Uint32Array.from(mesh0.triVerts);
  let nowa;
  try {
    nowa = Manifold.ofMesh({ numProp: 3, vertProperties: V, triVerts: F });
  } catch (e) {
    const err = new Error(KOM_USZKODZONY);
    err.kod = 'USZKODZONY';
    err.przyczyna = String(e && e.message || e);
    throw err;
  }
  const rec = opts.przywrocOtwory === false
    ? { wynik: nowa, otwory: 'wylaczone' }
    : przywrocOtworyPoObwodzie(nowa, kat, hoop, deltaR, extraRamie, rOuter, overhangMax);
  if (rec.wynik !== nowa) { try { nowa.delete(); } catch (eN) {} }
  nowa = rec.wynik;
  const bb = nowa.boundingBox();
  const zmin = Array.isArray(bb.min) ? bb.min[2] : bb.min.z;
  if (Math.abs(zmin) > 1e-9) {
    const t = nowa.translate(0, 0, -zmin);
    try { nowa.delete(); } catch (eT) {}
    nowa = t;
  }
  let katalogPo = null;
  try {
    katalogPo = rozpoznaj(nowa);
  } catch (eK) {
    katalogPo = { blad: String(eK && eK.message || eK) };
  }
  return {
    ok: true,
    wynik: nowa,
    katalogPo,
    hoop,
    deltaC_mm: deltaC,
    deltaR_mm: deltaR,
    extraRamie_mm: extraRamie,
    rOuter_mm: rOuter,
    rMax_przed: span0.rMax,
    overhang_przed: span0.rMax - rOuter,
    otwory: rec.otwory,
    uniform_scale: false
  };
}

function rozpoznajZBufora(buf, nazwa) {
  const n = String(nazwa || '').toLowerCase();
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (n.endsWith('.3mf')) {
    const wszystkie = czytaj3MFWszystkie(u8);
    const ciala = wszystkie.map(function (s) { return brylaZSiatki(s.V, s.F); });
    const iMax = wszystkie.reduce(function (best, s, i, arr) {
      return s.nTri > arr[best].nTri ? i : best;
    }, 0);
    const kat = rozpoznaj(ciala[iMax]);
    kat._ciala = ciala;
    kat._nazwyCial = wszystkie.map(function (s) { return s.nazwa; });
    kat._solid = ciala[iMax];
    let vol = 0;
    for (let i = 0; i < ciala.length; i++) {
      try { vol += ciala[i].volume(); } catch (eV) {}
    }
    const inv = inwentarz3mf(u8);
    inv.objetosc_mm3 = vol;
    kat._inwentarzWe = inv;
    if (ciala.length > 1) kat._pozycjeZPliku = true;
    return kat;
  }
  const siatka = czytajSTL(u8);
  let tmp;
  try {
    tmp = Manifold.ofMesh({ numProp: 3, vertProperties: siatka.V, triVerts: siatka.F });
  } catch (e) {
    const err = new Error(KOM_USZKODZONY);
    err.kod = 'USZKODZONY';
    err.przyczyna = String(e && e.message || e);
    throw err;
  }
  const P0 = progiZGabarytu(tmp.boundingBox());
  tmp.delete();
  const z = zgrzej(siatka.V, siatka.F, P0.zgrzew_mm);
  const m = brylaZSiatki(z.V, z.F);
  const kat = rozpoznaj(m);
  kat._ciala = [m];
  kat._nazwyCial = [nazwa || 'model'];
  kat._inwentarzWe = {
    obiekty: 1, itemy: 0,
    trojkaty_plyta: kat.trojkatow, trojkaty_zasoby: kat.trojkatow,
    instancje: 1, nazwy: kat._nazwyCial, metadata: [], requiredextensions: [],
    objetosc_mm3: m.volume()
  };
  return kat;
}

function wydluzWszystkieCiala(ciala, extra_mm, osHint) {
  const lista = Array.isArray(ciala) && ciala.length ? ciala : [];
  if (!lista.length) throw new Error('Brak ciał do wydłużenia');
  return lista.map(function (s) { return wydluzOsiowo(s, extra_mm, osHint); });
}

function luzGniazda(nominal, pasowanie = 'przesuwne', material = 'PETG') {
  return luzMm(nominal, pasowanie, material);
}

function jestBladPomiaru(c) {
  const k = c && c.odmowa;
  return k === 'BLAD_POMIARU' || k === 'BŁĄD_POMIARU';
}



function cechyDecyzyjne(cechy) {
  return (cechy || []).filter((c) => !jestBladPomiaru(c));
}



function interpretujZdanie(zdanie, katalog, opts = {}


) {
  const t = String(zdanie || '').toLowerCase().replace(',', '.');
  const m = t.match(/(\d+(?:\.\d+)?)\s*mm/);
  const wymiar = m ? +m[1] : null;
  const wszystkieGniazda = (katalog.cechy || []).filter(c => c.rodzaj === 'gniazdo_walcowe');
  const gniazda = wszystkieGniazda.filter(c => c.pewnosc !== 'niska');
  const rura = /rur[aayę]/.test(t) || /pasowa[cć]/.test(t);
  const gniazdoMa = /gniazd/.test(t) && /ma[cć] mieć|ma miec|na\s+\d/.test(t) && !rura;
  const material = opts.material || 'PETG';
  const pasowanie = opts.pasowanie || 'przesuwne';
  if (wymiar == null) return { ok: false, kod: 'BRAK_WYMIARU', pytanie: 'Jaki wymiar docelowy?', wykonaj: false };

  const celZ = (w) => {
    if (rura && !gniazdoMa) {
      const luz = luzGniazda(w, pasowanie, material);
      return {
        wymiar: +(w + luz).toFixed(3), rura: true,
        deklaracjaLuzu: { nominal: w, luz_mm: +luz.toFixed(3), wzor: `(0,20 + 0,003 × ${w}) × 1,2`, pasowanie, material, cel: +(w + luz).toFixed(3) }
      };
    }
    return { wymiar: +w.toFixed(3), rura: false, deklaracjaLuzu: { nominal: w, luz_mm: 0, cel: +w.toFixed(3) } };
  };

  if (opts.cecha_id != null) {
    const c = katalog.cechy.find(x => x.id === opts.cecha_id);
    if (!c) return { ok: false, kod: 'CECHA_POZA_KATALOGIEM', cecha_id: opts.cecha_id, wykonaj: false };
    if (c.pewnosc === 'niska' && !opts.klik) {
      return { ok: false, kod: 'NISKIE_PEWNOSC', cecha_id: c.id, pytanie: 'Cecha o niskiej pewności — wskaż ją kliknięciem.', wykonaj: false };
    }
    return { ok: true, cecha_id: c.id, wykonaj: true, ...celZ(wymiar) };
  }

  if (gniazda.length > 1 && !/stopie[nń]|pierwsz|drug|trzeci/.test(t)) {
    const lista = gniazda.map((c, i) => ({
      litera: String.fromCharCode(65 + i), id: c.id,
      opis: `Ø${c.srednica_mm.toFixed(2)} mm — od ${c.od_mm} do ${c.do_mm} mm długości`
    }));
    const hint = lista.slice().sort((a, b) => {
      const ca = gniazda.find(x => x.id === a.id), cb = gniazda.find(x => x.id === b.id);
      return Math.abs(ca.srednica_mm - wymiar) - Math.abs(cb.srednica_mm - wymiar);
    })[0];
    return { ok: false, kod: 'NIEJEDNOZNACZNE', pytanie: 'Które gniazdo mam zmienić?', lista, podpowiedz: hint.litera, wykonaj: false };
  }

  let wybrana = gniazda[0];
  if (/trzec/.test(t)) wybrana = gniazda[2] || gniazda[gniazda.length - 1];
  else if (/drug/.test(t)) wybrana = gniazda[1] || wybrana;
  if (!wybrana) {
    if (wszystkieGniazda.some(c => c.pewnosc === 'niska'))
      return { ok: false, kod: 'NISKIE_PEWNOSC', wykonaj: false };
    return { ok: false, kod: 'BRAK_GNIAZDA', wykonaj: false };
  }
  if (wybrana.pewnosc === 'niska' && !opts.klik) {
    return { ok: false, kod: 'NISKIE_PEWNOSC', cecha_id: wybrana.id, wykonaj: false };
  }
  return { ok: true, cecha_id: wybrana.id, wykonaj: true, ...celZ(wymiar) };
}

function walidujOdpowiedzModelu(odp, katalog) {
  if (!odp || typeof odp !== 'object') return { ok: false, kod: 'ZLY_SCHEMAT' };
  if (odp.cecha_id == null) return { ok: false, kod: 'BRAK_ID' };
  const c = cechyDecyzyjne(katalog.cechy).find(x => x.id === odp.cecha_id);
  if (!c) return { ok: false, kod: 'CECHA_POZA_KATALOGIEM', cecha_id: odp.cecha_id };
  return { ok: true, cecha: c };
}




function planZmiany(cecha, dNowa) {
  const r0 = cecha.r ?? cecha.srednica_mm / 2;
  const r1 = dNowa / 2;
  const h = (cecha.do_mm ?? 0) - (cecha.od_mm ?? 0);
  const frac = (cecha.gardziel_deg || 0) / 360;
  const dV = Math.PI * Math.abs(r0 * r0 - r1 * r1) * h * (1 - frac);
  return { kierunek: r1 < r0 ? 'zwezenie' : 'poszerzenie', objetosc_mm3: dV, od_mm: cecha.od_mm, do_mm: cecha.do_mm, os: cecha.os };
}

function zwezGniazdo(model, cecha, dNowa) {
  const arena = [];
  const K = o => (arena.push(o), o);
  const r0 = cecha.r ?? cecha.srednica_mm / 2;
  const { s: aligned, wlasny } = naZ(model, cecha.os);
  if (wlasny) arena.push(aligned);
  const { r: rN, N } = rCiecie(dNowa / 2);
  console.log(`N-12 segmenty użyte: N = ${N}  r_docelowe=${(dNowa / 2).toFixed(4)}  r_ciecia=${rN.toFixed(4)}`);
  const zFeat = zakresNaAligned(cecha);
  const zc = zasiegCiecia(aligned, cecha, dNowa, 'zwez');
  const h = Math.max(0.5, zc.zHi - zc.zLo);
  const CX = cecha.cx, CY = cecha.cy;
  const wypelnij = K(Manifold.cylinder(h, r0 + ZAKLADKA_BOOLEAN_MM, r0 + ZAKLADKA_BOOLEAN_MM, Math.max(192, N)).translate(CX, CY, zc.zLo));
  let bryla = K(aligned.add(wypelnij));
  let wynik = wytnijDoSrednicy(bryla, CX, CY, zc.zLo, zc.zHi, dNowa, arena, zFeat.zLo, zFeat.zHi);
  if (cecha.gardziel_deg && cecha.gardziel_deg > 5) {
    const wach = [[CX, CY]];
    const od = cecha.gardziel_od_deg || 0;
    for (let a = od; a <= od + cecha.gardziel_deg; a += 0.5) {
      const r = a * Math.PI / 180;
      wach.push([CX + Math.cos(r) * (r0 + 3), CY + Math.sin(r) * (r0 + 3)]);
    }
    const bb = aligned.boundingBox();
    const H = bb.max[2] - bb.min[2];
    const z0 = bb.min[2];
    wynik = K(wynik.subtract(K(Manifold.extrude([wach], H + 8).translate(0, 0, z0 - 4))));
  }
  wynik = zZ(wynik, cecha.os);
  if (cecha.os !== 'z') arena.push(wynik);
  return { wynik, arena };
}

















function segmentyDlaPromienia(r) {
  try {
    if (wasmMod && typeof wasmMod.getCircularSegments === 'function') {
      const n = wasmMod.getCircularSegments(r);
      if (n > 2) return n;
    }
  } catch {}
  return circularSegmentsUstawione;
}













/** N w r/cos musi być tym samym, którym silnik buduje walec w tym wątku — nie tylko przy init. */
function asercjaNWalca(nKomp, rPromien) {
  const n = Math.max(4, nKomp);
  let nSilnik = null;
  try {
    if (wasmMod && typeof wasmMod.getCircularSegments === 'function') {
      nSilnik = wasmMod.getCircularSegments(rPromien);
    }
  } catch {}
  if (nSilnik != null && nSilnik !== n) {
    throw new Error('N kompensacji ' + n + ' ≠ getCircularSegments(' + rPromien + ')=' + nSilnik);
  }
  return n;
}

/** Przywraca cel Przerobu po użyciu wspólnego WASM przez Projekt (N=96). */
function ustawNPrzerobki() {
  if (!wasmMod || typeof wasmMod.setCircularSegments !== 'function') {
    throw new Error('initPrzerobka() najpierw');
  }
  wasmMod.setCircularSegments(PRZEROBKA_CIRCULAR_SEGMENTS);
  circularSegmentsUstawione = PRZEROBKA_CIRCULAR_SEGMENTS;
  const n = asercjaNWalca(PRZEROBKA_CIRCULAR_SEGMENTS, 10);
  if (n !== PRZEROBKA_CIRCULAR_SEGMENTS) {
    throw new Error('N Przerobu ' + n + ' — oczekiwane 192; Projekt ma osobne N=96');
  }
  return n;
}

function ustawNPrzyWalcu(nKomp, rPromien) {
  const n = Math.max(4, nKomp);
  if (wasmMod && typeof wasmMod.setCircularSegments === 'function') {
    wasmMod.setCircularSegments(n);
    circularSegmentsUstawione = n;
  }
  return asercjaNWalca(n, rPromien);
}

/** Promień narzędzia, żeby apotema wielokąta wpisanego dała r_docelowe. N z silnika, nie 96 z pamięci.
 *  Bez naddatku +0,02: ten naddatek dawał przepust ~0,04 mm za szeroki (2 × 0,02).
 *  Jedyna kompensacja wielokąta to r/cos(π/N). */
function rCiecie(rDocelowe, nSeg) {
  const N0 = Math.max(4, nSeg != null ? nSeg : segmentyDlaPromienia(rDocelowe));
  const N = asercjaNWalca(N0, rDocelowe);
  return { r: rDocelowe / Math.cos(Math.PI / N), N };
}
















function nZOdczytu(dOczek, dZmierzone) {
  const c = dZmierzone / dOczek;
  if (!(c > 0.97 && c < 0.99995)) return null;
  return Math.max(16, Math.round(Math.PI / Math.acos(c)));
}
















function rMinKrawedziXY(V, F, cx, cy, z, rMin) {
  const rMinOdcinka = (ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, dd = dx * dx + dy * dy;
    let t = dd > 1e-12 ? -((ax - cx) * dx + (ay - cy) * dy) / dd : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(ax - cx + t * dx, ay - cy + t * dy);
  };
  let best = Infinity;
  for (let t = 0; t < F.length; t += 3) {
    const ia = F[t] * 3, ib = F[t + 1] * 3, ic = F[t + 2] * 3;
    const z0 = V[ia + 2] - z, z1 = V[ib + 2] - z, z2 = V[ic + 2] - z;
    if ((z0 > 0 && z1 > 0 && z2 > 0) || (z0 < 0 && z1 < 0 && z2 < 0)) continue;
    const P = [
      [V[ia], V[ia + 1], V[ia + 2]],
      [V[ib], V[ib + 1], V[ib + 2]],
      [V[ic], V[ic + 1], V[ic + 2]]
    ];
    const d = [z0, z1, z2];
    const pk = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if ((d[i] <= 0 && d[j] > 0) || (d[i] > 0 && d[j] <= 0)) {
        const u = d[i] / (d[i] - d[j]);
        pk.push([P[i][0] + u * (P[j][0] - P[i][0]), P[i][1] + u * (P[j][1] - P[i][1])]);
      }
    }
    if (pk.length < 2) continue;
    const r = rMinOdcinka(pk[0][0], pk[0][1], pk[1][0], pk[1][1]);
    if (r > rMin && r < best) best = r;
  }
  return best === Infinity ? null : best;
}
















function wytnijDoSrednicy(aligned, cx, cy, zLo, zHi, dNowa, arena, zMierzLo, zMierzHi) {
  const K = o => (arena.push(o), o);
  let N = Math.max(192, segmentyDlaPromienia(dNowa / 2));
  const h = Math.max(0.5, zHi - zLo);
  const mLo = Number.isFinite(zMierzLo) ? zMierzLo : zLo;
  const mHi = Number.isFinite(zMierzHi) ? zMierzHi : zHi;
  const rMin = Math.max(0.4, dNowa * 0.15);
  const fracs = [0, 0.25, 0.5, 0.75, 1];
  let wynik = aligned;
  for (let pass = 0; pass < 3; pass++) {
    const nKomp = Math.max(4, N);
    const nBudowa = ustawNPrzyWalcu(nKomp, dNowa / 2);
    if (nKomp !== nBudowa) {
      throw new Error(`N kompensacji ${nKomp} ≠ N budowy ${nBudowa}`);
    }
    const r = (dNowa / 2) / Math.cos(Math.PI / nBudowa);
    const cyl = K(Manifold.cylinder(h, r, r, nBudowa).translate(cx, cy, zLo));
    wynik = K(aligned.subtract(cyl));
    let dM = NaN;
    try {
      const mesh = wynik.getMesh();
      const nProp = mesh.numProp || 3;
      const VP = mesh.vertProperties;
      const TV = mesh.triVerts;
      const V = new Float32Array((VP.length / nProp) * 3);
      for (let i = 0, j = 0; i < VP.length; i += nProp, j += 3) {
        V[j] = VP[i]; V[j + 1] = VP[i + 1]; V[j + 2] = VP[i + 2];
      }
      const F = TV instanceof Uint32Array ? new Uint32Array(TV) : Uint32Array.from(TV);
      let mn = Infinity;
      for (const f of fracs) {
        const z = mLo + f * Math.max(0.2, mHi - mLo);
        const rM = rMinKrawedziXY(V, F, cx, cy, z, rMin);
        if (rM != null && 2 * rM < mn) mn = 2 * rM;
      }
      if (mn !== Infinity) dM = mn;
    } catch {}
    console.log(`N-12 pass ${pass} N=${nBudowa} r_ciecia=${r.toFixed(4)} odczyt=${Number.isFinite(dM) ? dM.toFixed(4) : 'n/d'}`);
    if (!Number.isFinite(dM)) break;
    if (Math.abs(dM - dNowa) <= 0.008) break;
    const n2 = dM < dNowa ? nZOdczytu(dNowa, dM)
      : Math.round(Math.PI / Math.acos(Math.min(0.9999, dNowa / dM)));
    if (!n2 || !Number.isFinite(n2) || n2 < 16) break;
    if (Math.abs(n2 - N) < 2) break;
    N = dM < dNowa ? n2 : Math.min(N * 2, n2);
  }
  if (wasmMod && typeof wasmMod.setCircularSegments === 'function') {
    wasmMod.setCircularSegments(PRZEROBKA_CIRCULAR_SEGMENTS);
    circularSegmentsUstawione = PRZEROBKA_CIRCULAR_SEGMENTS;
  }
  return wynik;
}
















function worldZToAligned(os, worldA) {
  if (os === 'z') return worldA;
  return -worldA;
}
















function zakresNaAligned(cecha) {
  const zA = worldZToAligned(cecha.os, cecha.od_mm);
  const zB = worldZToAligned(cecha.os, cecha.do_mm);
  return { zLo: Math.min(zA, zB), zHi: Math.max(zA, zB) };
}
















function padFazki(h0) {
  return Math.min(3, Math.max(MARGINES_CIECIA_MM, Math.max(0, h0) * 0.25));
}

















function rNaPlaszczyznie(aligned, cx, cy, z, rMin, rMax) {
  let s;
  try { s = aligned.slice(z); } catch { return null; }
  const kon = polygonsOf(s);
  try { s.delete(); } catch {}
  if (!kon.length) return null;
  if (wSrodku(kon, cx, cy)) return Infinity;
  return rInWielokier(kon, cx, cy, rMin, rMax);
}

















/** Rozszerza operację od wykrytego zakresu.
 *  poszerz: idź, dopóki przekrój < dNowa (jest co usuwać) + padFazki.
 *  zwez:    TYLKO wykryty zakres + zakładka boolean 0,05 mm. Nie wolno
 *           iść «dopóki przekrój > dNowa» ani «dopóki |d−d0| < 0,15» —
 *           początek fazy wlotowej jest jeszcze prawie Ø cechy, więc
 *           wypełnienie wjeżdża w fazę (N-12 / 4.2.24: 2 mm przy y=11;
 *           4.2.25 przy |d−d0|: 0,7 mm przy y=12,5). */
function zasiegCiecia(aligned, cecha, dNowa, tryb = 'poszerz') {
  const krok = 0.2;
  const rNeed = dNowa / 2;
  const r0 = cecha.r ?? cecha.srednica_mm / 2;
  const bb = aligned.boundingBox();
  let zLo, zHi;
  if (Number.isFinite(cecha.od_mm) && Number.isFinite(cecha.do_mm)) {
    const z = zakresNaAligned(cecha);
    zLo = z.zLo;
    zHi = z.zHi;
  } else {
    const z0 = cecha.z0 ?? bb.min[2];
    zLo = z0;
    zHi = z0;
  }
  const h0 = Math.abs(zHi - zLo);
  const rMin = Math.max(0.4, Math.min(r0, rNeed) * 0.3);
  const rMax = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], 4) * 0.55;
  const MAX_EXTRA = 8;
  const zMin = bb.min[2] - 0.5, zMax = bb.max[2] + 0.5;

  if (tryb === 'zwez') {
    zLo -= ZAKLADKA_BOOLEAN_MM;
    zHi += ZAKLADKA_BOOLEAN_MM;
    return { zLo, zHi };
  }

  const trzebaCiac = (z) => {
    const r = rNaPlaszczyznie(aligned, cecha.cx, cecha.cy, z, rMin, rMax);
    if (r == null || r === Infinity) return false;
    if (r >= rNeed - 0.01) return false;
    if (r < r0 - 0.8) return false;
    return true;
  };

  for (let z = zLo - krok, extra = 0; z >= zMin && extra < MAX_EXTRA; z -= krok, extra += krok) {
    if (!trzebaCiac(z)) break;
    zLo = z;
  }
  for (let z = zHi + krok, extra = 0; z <= zMax && extra < MAX_EXTRA; z += krok, extra += krok) {
    if (!trzebaCiac(z)) break;
    zHi = z;
  }
  zLo = Math.max(zMin, zLo - krok);
  zHi = Math.min(zMax, zHi + krok);
  if (zHi - zLo < h0 + 0.4) {
    const pad = padFazki(h0);
    zLo -= pad;
    zHi += pad;
  }
  return { zLo, zHi };
}

















function progSciankiMm() {
  if (typeof sciankaMin === 'function') return sciankaMin();
  if (typeof SCIANKA_MIN === 'number') return SCIANKA_MIN;
  throw new Error('brak progu ścianki (gate.js / SCIANKA_DRUKOWALNA_MM)');
}






function poszerzGniazdo(model, cecha, dNowa) {
  const arena = [];
  const K = o => (arena.push(o), o);
  const { r: rN, N } = rCiecie(dNowa / 2);
  const r0 = cecha.r ?? cecha.srednica_mm / 2;
  const rZew = cecha.r_zewnetrzny ?? (r0 + 6);
  const minS = progSciankiMm();
  if ((rZew - rN) < minS) {
    const err = new Error(`Ścianka ${((rZew - rN) * 2).toFixed(2)} mm spadłaby poniżej ${minS} mm.`);
    err.kod = 'SCIANKA';
    err.liczba = rZew - rN;
    throw err;
  }
  const { s: aligned, wlasny } = naZ(model, cecha.os);
  if (wlasny) arena.push(aligned);
  const zFeat = zakresNaAligned(cecha);
  const zc = zasiegCiecia(aligned, cecha, dNowa, 'poszerz');
  let wynik = wytnijDoSrednicy(aligned, cecha.cx, cecha.cy, zc.zLo, zc.zHi, dNowa, arena, zFeat.zLo, zFeat.zHi);
  wynik = zZ(wynik, cecha.os);
  if (cecha.os !== 'z') arena.push(wynik);
  return { wynik, arena };
}


















function zmienOtwory(model, cecha, dNowa) {
  const arena = [];
  const K = o => (arena.push(o), o);
  const { s: aligned, wlasny } = naZ(model, cecha.os);
  if (wlasny) arena.push(aligned);
  const bb = aligned.boundingBox();
  const H = bb.max[2] - bb.min[2] + 4;
  let wynik = aligned;
  for (const p of (cecha.srodki || [])) {
    const c = K(Manifold.cylinder(H, dNowa / 2, dNowa / 2, 64).translate(p[0], p[1], bb.min[2] - 2));
    wynik = K(wynik.subtract(c));
  }
  wynik = zZ(wynik, cecha.os);
  if (cecha.os !== 'z') arena.push(wynik);
  return { wynik, arena };
}

function bramkaPrzerobki(stara, nowa, katPrzed, katPo, cecha, plan, dCel) {
  const bledy = [];
  const blad = (kod, tekst, liczba) => bledy.push({ kod, tekst, liczba });
  const zwezanie = dCel < cecha.srednica_mm;
  if (zwezanie && nowa.volume() <= stara.volume())
    blad('OBJETOSC', 'Zwężenie otworu zmniejszyło objętość — operacja wycięła coś, czego nie powinna.', nowa.volume());
  if (!zwezanie && cecha.rodzaj === 'gniazdo_walcowe' && nowa.volume() >= stara.volume())
    blad('OBJETOSC', 'Poszerzenie otworu zwiększyło objętość — operacja dodała materiał.', nowa.volume());

  const bbS = stara.boundingBox(), bbN = nowa.boundingBox();
  const gabS = [bbS.max[0] - bbS.min[0], bbS.max[1] - bbS.min[1], bbS.max[2] - bbS.min[2]];
  const gabN = [bbN.max[0] - bbN.min[0], bbN.max[1] - bbN.min[1], bbN.max[2] - bbN.min[2]];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(gabS[i] - gabN[i]) > 0.01)
      blad('GABARYT', `Gabaryt osi ${i} zmienił się o ${(gabN[i] - gabS[i]).toFixed(3)} mm.`, gabN[i] - gabS[i]);
  }

  const przedDec = cechyDecyzyjne(katPrzed.cechy)
    .filter((x) => x.id !== cecha.id && x.rodzaj === 'gniazdo_walcowe');
  const poDec = cechyDecyzyjne(katPo.cechy);
  for (const c of przedDec) {
    const kand = poDec.find(x => x.rodzaj === c.rodzaj && x.os === c.os &&
      Math.abs(x.srednica_mm - c.srednica_mm) < 0.8 &&
      Math.abs((x.od_mm ?? 0) - (c.od_mm ?? 0)) < 6);
    if (!kand)
      blad('CECHY', `Cecha ${c.id} Ø${c.srednica_mm} zniknęła po operacji.`);
    else if (Math.abs(kand.srednica_mm - c.srednica_mm) > 0.5)
      blad('CECHY', `Cecha ${c.id} Ø${c.srednica_mm} zmieniła się na Ø${kand.srednica_mm}.`, kand.srednica_mm);
  }

  if (cecha.rodzaj === 'gniazdo_walcowe' && Number.isFinite(dCel)) {
    const { s: aln, wlasny } = naZ(nowa, cecha.os);
    let z, h;
    const tryb = dCel > cecha.srednica_mm ? 'poszerz' : 'zwez';
    {
      const { s: aln0, wlasny: w0 } = naZ(stara, cecha.os);
      const zc = zasiegCiecia(aln0, cecha, dCel, tryb);
      if (w0) aln0.delete();
      z = zc.zLo;
      h = Math.max(0.5, zc.zHi - zc.zLo);
    }
    const kolizja = (d) => {
      const c = Manifold.cylinder(h, d / 2, d / 2, 192).translate(cecha.cx, cecha.cy, z);
      const k = c.intersect(aln);
      const v = k.volume();
      c.delete(); k.delete();
      return v;
    };
    if (kolizja(dCel) > 1) blad('WYMIAR', `Ø${dCel} nie wchodzi.`);
    if (kolizja(dCel + 0.05) < 1) blad('WYMIAR', `Ø${dCel + 0.05} też wchodzi — otwór za duży.`);
    if (wlasny) aln.delete();
  }

  let nS = 1, nN = 1;
  try {
    const ds = stara.decompose(), dn = nowa.decompose();
    nS = ds.length; nN = dn.length;
    usun(ds); usun(dn);
  } catch {}
  if (nN !== nS) blad('KOMPONENTY', `Bryła miała ${nS} część(i), ma ${nN}.`, nN);

  let udzial = 0;
  try {
    const dodane = nowa.subtract(stara), ubrane = stara.subtract(nowa);
    const zmiana = dodane.volume() + ubrane.volume();
    udzial = stara.volume() > 0 ? zmiana / stara.volume() : 0;
    dodane.delete(); ubrane.delete();
  } catch {
    blad('ZASIEG', 'Nie udało się policzyć zasięgu zmiany.');
  }
  if (plan && plan.objetosc_mm3 > 0) {
    const przew = plan.objetosc_mm3 / stara.volume();
    if (udzial > przew * 1.2 + 0.01 && udzial > 0.05)
      blad('ZASIEG', `Udział zmiany ${(udzial * 100).toFixed(1)}% wobec planu ${(przew * 100).toFixed(1)}%.`, udzial);
  }
  if (udzial > 0.25 && plan && (plan.objetosc_mm3 / stara.volume()) < 0.05)
    blad('ZASIEG', `Zmiana ${(udzial * 100).toFixed(1)}% objętości — za rozległa na jedną cechę.`, udzial);

  if (typeof nowa.isEmpty === 'function' && nowa.isEmpty()) blad('PUSTA', 'Wynik jest pusty.');
  if (nowa.volume() <= 0) blad('PUSTA', 'Objętość wyniku ≤ 0.');

  return { ok: bledy.length === 0, bledy, udzial, nKomponentow: { przed: nS, po: nN }, gabaryt_przed: gabS, gabaryt_po: gabN };
}





















function wykonajPrzerobke(kat, cechaId, dNowa, opts = {}


) {
  ustawNPrzerobki();
  const oryg = kat._solid;
  if (!oryg) throw new Error('Brak bryły w katalogu — rozpoznaj() najpierw.');
  const cecha = kat.cechy.find(c => c.id === cechaId);
  if (!cecha) return { ok: false, kod: 'CECHA_POZA_KATALOGIEM', oryginal: oryg, katalog: kat, gotowy: false };
  if (!cecha.edytowalna && !opts.klik) {
    return { ok: false, kod: 'NISKIE_PEWNOSC', oryginal: oryg, katalog: kat, gotowy: false };
  }
  const plan = planZmiany(cecha, dNowa);
  plan.udzial = plan.objetosc_mm3 / (kat.objetosc_mm3 || oryg.volume());
  let op;
  try {
    if (opts.zlaOperacja === 'wyciecie') {
      const arena = [];
      const { s: aln, wlasny } = naZ(oryg, cecha.os);
      if (wlasny) arena.push(aln);
      const z0 = cecha.z0 ?? aln.boundingBox().min[2];
      const bb = aln.boundingBox();
      const c = Manifold.cylinder((bb.max[2] - bb.min[2]) + 8, (cecha.r || 10) + 2, (cecha.r || 10) + 2, 64)
        .translate(cecha.cx, cecha.cy, z0 - 4);
      arena.push(c);
      op = { wynik: zZ(aln.subtract(c), cecha.os), arena };
    } else if (opts.zlaOperacja === 'cala_dlugosc') {
      const idx = { x: 0, y: 1, z: 2 }[cecha.os];
      const rMax = Math.max(cecha.r, ...((kat.cechy || []).filter(c => c.rodzaj === 'gniazdo_walcowe').map(c => c.r)));
      const kopia = { ...cecha, od_mm: 0, do_mm: kat.gabaryt_mm[idx] || 80, r: rMax, srednica_mm: rMax * 2 };
      op = dNowa < kopia.srednica_mm ? zwezGniazdo(oryg, kopia, dNowa) : poszerzGniazdo(oryg, kopia, dNowa);
    } else if (opts.zlaOperacja === 'wystajacy_pierscien') {
      const arena = [];
      const K = o => (arena.push(o), o);
      const { s: aln, wlasny } = naZ(oryg, cecha.os);
      if (wlasny) arena.push(aln);
      const bb = aln.boundingBox();
      const r0 = cecha.r, rN = dNowa / 2;
      const zew = K(Manifold.cylinder(bb.max[2] - bb.min[2] + 8, r0 + 0.02, r0 + 0.02, 64).translate(cecha.cx, cecha.cy, bb.min[2] - 4));
      const rdzen = K(Manifold.cylinder(bb.max[2] - bb.min[2] + 12, rN, rN, 64).translate(cecha.cx, cecha.cy, bb.min[2] - 6));
      op = { wynik: zZ(K(aln.add(K(zew.subtract(rdzen)))), cecha.os), arena };
    } else if (opts.zlaOperacja === 'przetnij') {
      const bb = oryg.boundingBox();
      const slab = Manifold.cube([(bb.max[0] - bb.min[0]) + 4, 1.2, (bb.max[2] - bb.min[2]) + 4], true)
        .translate((bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2);
      op = { wynik: oryg.subtract(slab), arena: [slab] };
    } else if (cecha.rodzaj === 'gniazdo_walcowe') {
      op = dNowa < cecha.srednica_mm ? zwezGniazdo(oryg, cecha, dNowa) : poszerzGniazdo(oryg, cecha, dNowa);
    } else if (cecha.rodzaj === 'wzor_otworow') {
      op = zmienOtwory(oryg, cecha, dNowa);
    } else {
      return { ok: false, kod: 'RODZAJ', komunikat: 'Ten rodzaj cechy nie jest jeszcze w V1.', oryginal: oryg, gotowy: false };
    }
  } catch (e) {
    return { ok: false, kod: e.kod || 'OPERACJA', komunikat: e.message, liczba: e.liczba, oryginal: oryg, katalog: kat, gotowy: false };
  }
  const nowa = op.wynik;
  let katPo;
  try {
    const mesh = nowa.getMesh();
    katPo = katalogZCech(nowa, mesh.vertProperties, mesh.triVerts, kat.P);
  } catch {
    usun(op.arena);
    return { ok: false, kod: 'USZKODZONY', komunikat: KOM_USZKODZONY, oryginal: oryg, katalog: kat, gotowy: false };
  }
  const br = bramkaPrzerobki(oryg, nowa, kat, katPo, cecha, plan, dNowa);
  if (!br.ok) {
    try { nowa.delete(); } catch {}
    usun(op.arena);
    return { ok: false, kod: br.bledy[0]?.kod, bledy: br.bledy, oryginal: oryg, katalog: kat, gotowy: false, bramka: br };
  }
  katPo._solid = nowa;
  return { ok: true, wynik: nowa, katalogPo: katPo, oryginal: oryg, katalog: kat, gotowy: true, bramka: br, plan };
}

function snapshotOryginalu(kat) {
  const m = kat._solid;
  const bb = m.boundingBox();
  return {
    objetosc_mm3: m.volume(),
    gabaryt: [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]],
    cechy: JSON.parse(JSON.stringify(kat.cechy.map(({ id, rodzaj, srednica_mm, od_mm, do_mm, os }) => ({ id, rodzaj, srednica_mm, od_mm, do_mm, os }))))
  };
}

function oryginalNietkniety(przed, kat) {
  const teraz = snapshotOryginalu(kat);
  if (Math.abs(przed.objetosc_mm3 - teraz.objetosc_mm3) > 1e-4) return false;
  for (let i = 0; i < 3; i++) if (Math.abs(przed.gabaryt[i] - teraz.gabaryt[i]) > 1e-4) return false;
  return JSON.stringify(przed.cechy) === JSON.stringify(teraz.cechy);
}

function fmtDowody(c) {
  if (c && (c.odmowa === 'GWINT_LUB_NIEWALEC' || c.odmowa === 'BLAD_POMIARU')) return c.opis;
  const d = c.dowody || {};
  if (c.rodzaj === 'gniazdo_walcowe' && Number.isFinite(c.srednica_mm)) {
    return `gniazdo Ø${c.srednica_mm.toFixed(2)} mm — łuk ${d.pokrycie_kata_deg}°, zgodne na ${d.zgodnych_przekrojow} przekrojach, rozrzut promienia ${(d.odchylenie_promienia_mm ?? 0).toFixed(2)} mm`;
  }
  return c.opis;
}













function zapiszSTLBinarny(V, F) {
  const n = F.length / 3;
  const u8 = new Uint8Array(84 + n * 50);
  const dv = new DataView(u8.buffer);
  const hdr = new TextEncoder().encode('p2s-przerobka');
  u8.set(hdr, 0);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    o += 12;
    for (let k = 0; k < 3; k++) {
      const i = F[t * 3 + k] * 3;
      dv.setFloat32(o, V[i], true);
      dv.setFloat32(o + 4, V[i + 1], true);
      dv.setFloat32(o + 8, V[i + 2], true);
      o += 12;
    }
    o += 2;
  }
  return u8;
}

window.P2S = window.P2S || {};
window.P2S.przerobka = {
  initPrzerobka, rozpoznaj, rozpoznajZBufora, wykonajPrzerobke,
  luzGniazda, KOM_USZKODZONY, fmtDowody, czytajSTL, czytaj3MF, czytaj3MFWszystkie, czytaj3MFInstancje, brylaZSiatki,
  inwentarz3mf, porownajInwentarz, tekstInwentarza,
  PRZEROBKA_CIRCULAR_SEGMENTS, sciankaMin,
  deltaRZobwodu, wybierzObrecz, powiekszObwodIRamiona,
  dodajDziurkeBrelok, wydluzOsiowo, wydluzWszystkieCiala,
  interpretujZdanie
};
})();
