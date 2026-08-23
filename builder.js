/**
 * Budowniczy SPEC v1 → siatka. Silnik: manifold-3d, Apache-2.0 (engine/LICENSE-manifold.txt).
 * Model NIE liczy luzów i NIE pisze kodu. Nieznany typ = wyjątek z nazwą, nigdy continue.
 *
 * Luz jest CAŁĄ szczeliną na wymiarze, nie naddatkiem na stronę.
 * Konwencja: kupon M28-C, gniazdo 8 + 0,15 zmierzone 8,15 mm — pełna szczelina, nie per-strona.
 * Kupon nie dowodzi wzoru. Wzór startowy PETG przesuwne: (0,20 + 0,003×Ø)×1,2;
 * Ø8 → 8,269 (T-03); Ø44 → 0,398 mm (baza bez mnożnika materiału to 0,332).
 */
import { sprawdzBramke, gabaryt } from './gate.js';

let wasm = null;
let Manifold = null;
let CrossSection = null;

export const PASOWANIA = {
  ciasne: { baza: 0.10, k: 0 },
  przesuwne: { baza: 0.20, k: 0.003 },
  luzne: { baza: 0.35, k: 0.005 },
  zatrzask: { baza: 0.50, k: 0 }
};
export const MNOZNIK = { PLA: 1.0, PETG: 1.2, ABS: 1.3, TPU: 1.5 };
export const WKLADKI = {
  'M1.6': 2.2, M2: 3.2, 'M2.5': 4.0, M3: 4.0, M4: 5.6,
  M5: 6.4, M6: 8.0, M8: 9.7, M10: 12.0
};
export const KSZTALTY = ['prostopadloscian', 'walec', 'kula', 'rura', 'graniastoslup', 'wyciagniecie', 'obrot'];
export const CECHY = ['otwor', 'otwor_pod_wkladke', 'poglebienie', 'poglebienie_stozkowe',
  'kieszen', 'zebro', 'zaokraglenie_pionowe', 'faza_gorna', 'faza_dolna', 'zatrzask'];

export function luzMm(nominal, pasowanie, material) {
  const p = PASOWANIA[pasowanie], m = MNOZNIK[material];
  if (!p) throw new Error('Nieznane pasowanie: ' + pasowanie);
  if (!m) throw new Error('Nieznany materiał: ' + material);
  return (p.baza + p.k * nominal) * m;
}

export function odksztalcenieProc(ugiecie, grubosc, dlugosc) {
  return 1.5 * ugiecie * grubosc / (dlugosc * dlugosc) * 100;
}

export function withArena(fn) {
  const arena = [];
  const keep = o => (arena.push(o), o);
  try { return fn(keep); }
  finally { for (const o of arena) { try { o.delete(); } catch (_) {} } }
}

async function wasmPath() {
  const u = new URL('./engine/manifold.wasm', import.meta.url);
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const { fileURLToPath } = await import('node:url');
    return fileURLToPath(u);
  }
  return u.href;
}

export async function initEngine() {
  if (wasm) return { Manifold, CrossSection, wasm };
  let ModuleFn = (typeof globalThis !== 'undefined' && globalThis.ManifoldModule) || null;
  const conf = {};
  if (typeof globalThis !== 'undefined' && globalThis.__P2S_WASM) {
    conf.wasmBinary = globalThis.__P2S_WASM;
    // Emscripten still calls findWasmBinary(); empty import.meta.url throws.
    conf.locateFile = () => 'manifold.wasm';
  }
  if (!ModuleFn) {
    const { default: Module } = await import('./engine/manifold.js');
    ModuleFn = Module;
    if (!conf.wasmBinary) {
      const loc = await wasmPath();
      conf.locateFile = () => loc;
    }
  }
  wasm = await ModuleFn(conf);
  wasm.setup();
  wasm.setCircularSegments(96);
  Manifold = wasm.Manifold;
  CrossSection = wasm.CrossSection;
  return { Manifold, CrossSection, wasm };
}

export function normalizujJednostki(text) {
  let s = String(text);
  s = s.replace(/\bp[oó]ł\s*centymetra\b/gi, '5 mm');
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*cal(?:a|e|i)?\b/gi, (_, n) => {
    const v = parseFloat(String(n).replace(',', '.')) * 25.4;
    return (Math.round(v * 10) / 10).toString().replace('.', ',') + ' mm';
  });
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*cm\b/gi, (_, n) => {
    const v = parseFloat(String(n).replace(',', '.')) * 10;
    return (Math.round(v * 100) / 100).toString().replace('.', ',') + ' mm';
  });
  return s;
}

export function specDiff(a, b, prefix) {
  const changes = [];
  const path = prefix || '';
  if (a === b) return changes;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Array.isArray(a) !== Array.isArray(b)) {
    changes.push({ path: path || '(root)', from: a, to: b });
    return changes;
  }
  if (Array.isArray(a)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) changes.push.apply(changes, specDiff(a[i], b[i], path + '[' + i + ']'));
    return changes;
  }
  const keys = new Set(Object.keys(a).concat(Object.keys(b)));
  for (const k of keys) {
    if (k === 'deklaracja') continue;
    changes.push.apply(changes, specDiff(a[k], b[k], path ? path + '.' + k : k));
  }
  return changes;
}

function req(c, pola, typ) {
  for (const p of pola) {
    if (c[p] == null) throw new Error('Cecha ' + typ + ' wymaga pola ' + p);
  }
}

export function walidujSpec(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('SPEC nie jest obiektem');
  if (spec.spec_version !== '1.0' && spec.spec_version !== '1.1') {
    throw new Error('Nieznana spec_version: ' + spec.spec_version);
  }
  if (!spec.nazwa) throw new Error('Brak nazwa');
  if (!MNOZNIK[spec.material]) throw new Error('Nieznany materiał: ' + spec.material);
  if (!Array.isArray(spec.bryly)) throw new Error('Brak bryly');
  if (!Array.isArray(spec.cechy)) throw new Error('Brak cechy');
  if (spec.pytania && spec.pytania.length && spec.bryly.length === 0) return spec;
  if (spec.bryly.length && spec.bryly[0].operacja !== 'dodaj') {
    throw new Error('Pierwsza bryła musi mieć operacja: dodaj');
  }
  for (const b of spec.bryly) {
    if (!b.ksztalt || !b.ksztalt.typ) throw new Error('Bryła bez kształtu');
    if (KSZTALTY.indexOf(b.ksztalt.typ) < 0) throw new Error('Nieznany kształt: ' + b.ksztalt.typ);
    const op = b.operacja;
    if (op !== 'dodaj' && op !== 'odejmij' && op !== 'przetnij') {
      throw new Error('Nieznana operacja: ' + op);
    }
  }
  for (const c of spec.cechy) {
    if (!c || !c.typ) throw new Error('Cecha bez typu');
    if (CECHY.indexOf(c.typ) < 0) throw new Error('Nieznana cecha: ' + c.typ);
    if (c.typ === 'otwor') {
      if (c.rola === 'pasowanie' || (c.element_nominalny_mm != null && c.pasowanie)) {
        req(c, ['punkt_mm', 'os', 'element_nominalny_mm', 'pasowanie'], c.typ);
      } else req(c, ['punkt_mm', 'os', 'srednica_mm'], c.typ);
    }
    if (c.typ === 'otwor_pod_wkladke') req(c, ['punkt_mm', 'os', 'gwint'], c.typ);
    if (c.typ === 'poglebienie') req(c, ['punkt_mm', 'os', 'srednica_otworu_mm', 'srednica_gniazda_mm', 'glebokosc_gniazda_mm'], c.typ);
    if (c.typ === 'poglebienie_stozkowe') req(c, ['punkt_mm', 'os', 'srednica_otworu_mm', 'srednica_lba_mm', 'kat_lba_deg'], c.typ);
    if (c.typ === 'kieszen') req(c, ['punkt_mm', 'os', 'x_mm', 'y_mm', 'glebokosc_mm'], c.typ);
    if (c.typ === 'zebro') req(c, ['od_mm', 'do_mm', 'grubosc_mm', 'wysokosc_mm'], c.typ);
    if (c.typ === 'zaokraglenie_pionowe') req(c, ['promien_mm'], c.typ);
    if (c.typ === 'faza_gorna' || c.typ === 'faza_dolna') req(c, ['szerokosc_mm'], c.typ);
    if (c.typ === 'zatrzask') req(c, ['punkt_mm', 'kierunek', 'dlugosc_ramienia_mm', 'grubosc_ramienia_mm', 'szerokosc_ramienia_mm', 'wysokosc_zaczepu_mm', 'ugiecie_montazowe_mm'], c.typ);
  }
  return spec;
}

export function normalizujSpec(specWe) {
  const spec = JSON.parse(JSON.stringify(specWe));
  walidujSpec(spec);
  // Deklarację wypełnia KOD, nie model — reset przy każdej normalizacji (inaczej historia dubluje wymiary).
  spec.deklaracja = { bbox: { x: 0, y: 0, z: 0 }, tolerance_mm: 0.2, wymiary_krytyczne: [] };
  const wk = spec.deklaracja.wymiary_krytyczne;
  const mat = spec.material;
  const ostrzezenia = [];

  for (const c of spec.cechy) {
    const pasowanieZRoli = c.typ === 'otwor' && (c.rola === 'pasowanie' || (c.element_nominalny_mm != null && c.pasowanie));
    if (pasowanieZRoli) {
      const l = luzMm(c.element_nominalny_mm, c.pasowanie, mat);
      c.srednica_mm = c.element_nominalny_mm + l;
      wk.push({
        nazwa: 'otwór pasowanie ' + c.pasowanie,
        wartosc_mm: +c.srednica_mm.toFixed(3),
        miejsce_pomiaru: 'średnica gniazda, oś ' + (c.os || '?')
      });
    }
    if (c.typ === 'otwor_pod_wkladke') {
      const d = WKLADKI[c.gwint];
      if (d == null) throw new Error('Nieznany gwint wkładki: ' + c.gwint);
      c.srednica_mm = d;
      c.glebokosc_mm = (c.dlugosc_wkladki_mm || 5) + 1;
      wk.push({
        nazwa: 'otwór pod wkładkę ' + c.gwint,
        wartosc_mm: d,
        miejsce_pomiaru: 'średnica otworu cylindrycznego (nie stożek)'
      });
    }
    if (c.typ === 'kieszen') {
      if (c.promien_naroza_mm == null) c.promien_naroza_mm = 2.2;
      if (c.promien_naroza_mm < 0.2) c.promien_naroza_mm = 0.2;
    }
    if (c.typ === 'zebro' && (c.kat_podparcia_deg || 45) > 45) {
      ostrzezenia.push('Żebro o kącie ' + c.kat_podparcia_deg + '° > 45° — potrzeba podpór.');
    }
    if (c.typ === 'zatrzask') {
      const eps = odksztalcenieProc(c.ugiecie_montazowe_mm, c.grubosc_ramienia_mm, c.dlugosc_ramienia_mm);
      spec.deklaracja.odksztalcenie_zatrzasku_proc = +eps.toFixed(2);
      if (eps > 4) {
        const t = c.grubosc_ramienia_mm;
        const L = c.dlugosc_ramienia_mm;
        const y = c.ugiecie_montazowe_mm;
        const tOk = 3;
        const Lok = Math.ceil(Math.sqrt(1.5 * y * t / 0.04));
        throw new Error(
          'ODKSZTALCENIE: odkształcenie ' + eps.toFixed(2) + '% przy dopuszczalnych 2–4% — ramię pęknie przy montażu; ' +
          'zmniejsz grubość ramienia do ' + tOk + ' mm albo wydłuż je o 8 mm (do ' + Lok + ' mm)'
        );
      }
    }
  }
  spec._ostrzezeniaNorm = ostrzezenia;
  return spec;
}

function naOs(m, os, keep) {
  if (!os || os === 'z') return m;
  if (os === '-z') return keep(m.rotate(180, 0, 0));
  if (os === 'x') return keep(m.rotate(0, 90, 0));
  if (os === '-x') return keep(m.rotate(0, -90, 0));
  if (os === 'y') return keep(m.rotate(-90, 0, 0));
  if (os === '-y') return keep(m.rotate(90, 0, 0));
  throw new Error('Nieznana oś: ' + os);
}

function bryla(k, keep) {
  switch (k.typ) {
    case 'prostopadloscian':
      return keep(Manifold.cube([k.x_mm, k.y_mm, k.z_mm]));
    case 'walec':
      return keep(Manifold.cylinder(k.wysokosc_mm, k.srednica_dolna_mm / 2, k.srednica_gorna_mm / 2, 0));
    case 'kula':
      return keep(Manifold.sphere(k.srednica_mm / 2, 0));
    case 'rura': {
      const z = keep(Manifold.cylinder(k.wysokosc_mm, k.srednica_zewn_mm / 2, k.srednica_zewn_mm / 2, 0));
      const w = keep(Manifold.cylinder(k.wysokosc_mm + 2, k.srednica_wewn_mm / 2, k.srednica_wewn_mm / 2, 0).translate(0, 0, -1));
      return keep(z.subtract(w));
    }
    case 'graniastoslup': {
      const r = k.srednica_opisana_mm / 2, n = k.liczba_bokow, pts = [];
      for (let i = 0; i < n; i++) {
        const a = 2 * Math.PI * i / n;
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      return keep(Manifold.extrude([pts], k.wysokosc_mm));
    }
    case 'wyciagniecie': {
      const poly = [k.kontur, ...(k.otwory || []).map(h => h.slice().reverse())];
      return keep(Manifold.extrude(poly, k.wysokosc_mm, 0, k.skret_deg || 0, k.zwezenie_gora || [1, 1]));
    }
    case 'obrot':
      return keep(Manifold.revolve([k.profil], 0, k.kat_deg ?? 360));
    default:
      throw new Error('Nieznany kształt: ' + k.typ);
  }
}

function osadz(m, b, keep) {
  let r = m;
  const bb = r.boundingBox();
  if (b.srodkowanie === 'xy' || b.srodkowanie === 'xyz') {
    const dx = -(bb.min[0] + bb.max[0]) / 2, dy = -(bb.min[1] + bb.max[1]) / 2;
    const dz = b.srodkowanie === 'xyz' ? -(bb.min[2] + bb.max[2]) / 2 : 0;
    r = keep(r.translate(dx, dy, dz));
  }
  const [rx, ry, rz] = b.obrot_deg || [0, 0, 0];
  if (rx || ry || rz) r = keep(r.rotate(rx, ry, rz));
  const [px, py, pz] = b.pozycja_mm || [0, 0, 0];
  if (px || py || pz) r = keep(r.translate(px, py, pz));
  return r;
}

function maxGab(part) {
  const g = gabaryt(part);
  return Math.max(g.x, g.y, g.z);
}

function otwor(part, c, keep) {
  const L = c.przez ? (2 * maxGab(part) + 4) : ((c.glebokosc_mm || maxGab(part)) + 2);
  let cyl = keep(Manifold.cylinder(L, c.srednica_mm / 2, c.srednica_mm / 2, 0));
  if (c.przez) cyl = keep(cyl.translate(0, 0, -L / 2));
  else cyl = keep(cyl.translate(0, 0, -1));
  cyl = keep(naOs(cyl, c.os, keep));
  return keep(part.subtract(keep(cyl.translate(c.punkt_mm[0], c.punkt_mm[1], c.punkt_mm[2]))));
}

function poglebienie(part, c, keep) {
  let p = otwor(part, {
    punkt_mm: c.punkt_mm, os: c.os, przez: true, srednica_mm: c.srednica_otworu_mm
  }, keep);
  const h = c.glebokosc_gniazda_mm + 0.2;
  let gniazdo = keep(Manifold.cylinder(h, c.srednica_gniazda_mm / 2, c.srednica_gniazda_mm / 2, 0).translate(0, 0, -0.1));
  gniazdo = keep(naOs(gniazdo, c.os, keep));
  return keep(p.subtract(keep(gniazdo.translate(c.punkt_mm[0], c.punkt_mm[1], c.punkt_mm[2]))));
}

function poglebienieStozkowe(part, c, keep) {
  let p = otwor(part, {
    punkt_mm: c.punkt_mm, os: c.os, przez: true, srednica_mm: c.srednica_otworu_mm
  }, keep);
  const kat = (c.kat_lba_deg || 90) * Math.PI / 180;
  const h = (c.srednica_lba_mm - c.srednica_otworu_mm) / 2 / Math.tan(kat / 2);
  let stozek = keep(Manifold.cylinder(h + 0.2, c.srednica_lba_mm / 2, c.srednica_otworu_mm / 2, 0).translate(0, 0, -0.1));
  stozek = keep(naOs(stozek, c.os, keep));
  return keep(p.subtract(keep(stozek.translate(c.punkt_mm[0], c.punkt_mm[1], c.punkt_mm[2]))));
}

function kieszen(part, c, keep) {
  const r = Math.max(c.promien_naroza_mm || 0.2, 0.2);
  const cs = keep(CrossSection.square([c.x_mm, c.y_mm], false)
    .offset(-r, 'Round', 2, 0)
    .offset(r, 'Round', 2, 0));
  let box = keep(Manifold.extrude(cs, c.glebokosc_mm + 1));
  box = keep(naOs(box, c.os, keep));
  return keep(part.subtract(keep(box.translate(c.punkt_mm[0], c.punkt_mm[1], c.punkt_mm[2]))));
}

function zaokraglijPionowo(part, r, keep) {
  const bb = part.boundingBox();
  const rzut = keep(part.project());
  const zaokr = keep(rzut.offset(-r, 'Round', 2, 0).offset(r, 'Round', 2, 0));
  const h = bb.max[2] - bb.min[2] + 2;
  const forma = keep(Manifold.extrude(zaokr, h).translate(0, 0, bb.min[2] - 1));
  return keep(part.intersect(forma));
}

function faza(part, s, gora, keep) {
  const bb = part.boundingBox();
  const X = bb.max[0] - bb.min[0], Y = bb.max[1] - bb.min[1], Z = bb.max[2] - bb.min[2];
  if (gora) {
    const rest = keep(Manifold.cube([X + 2, Y + 2, Math.max(Z - s, 0.01) + 0.001])
      .translate(bb.min[0] - 1, bb.min[1] - 1, bb.min[2]));
    const dol = keep(Manifold.cube([X, Y, 0.001]).translate(bb.min[0], bb.min[1], bb.max[2] - s));
    const g = keep(Manifold.cube([Math.max(X - 2 * s, 0.01), Math.max(Y - 2 * s, 0.01), 0.001])
      .translate(bb.min[0] + s, bb.min[1] + s, bb.max[2]));
    const klin = keep(Manifold.hull([dol, g]));
    return keep(part.intersect(keep(rest.add(klin))));
  }
  const rest = keep(Manifold.cube([X + 2, Y + 2, Math.max(Z - s, 0.01) + 0.001])
    .translate(bb.min[0] - 1, bb.min[1] - 1, bb.min[2] + s));
  const dol = keep(Manifold.cube([X, Y, 0.001]).translate(bb.min[0], bb.min[1], bb.min[2]));
  const gor = keep(Manifold.cube([Math.max(X - 2 * s, 0.01), Math.max(Y - 2 * s, 0.01), 0.001])
    .translate(bb.min[0] + s, bb.min[1] + s, bb.min[2] + s));
  const klin = keep(Manifold.hull([dol, gor]));
  return keep(part.intersect(keep(rest.add(klin))));
}

function zebro(part, c, keep) {
  const kat = (c.kat_podparcia_deg || 45) * Math.PI / 180;
  const reach = c.wysokosc_mm / Math.tan(kat);
  const tri = [[0, 0], [reach, 0], [0, c.wysokosc_mm]];
  let z = keep(Manifold.extrude([tri], c.grubosc_mm));
  z = keep(z.translate(0, 0, -c.grubosc_mm / 2));
  const dx = c.do_mm[0] - c.od_mm[0], dy = c.do_mm[1] - c.od_mm[1];
  const az = Math.atan2(dy, dx) * 180 / Math.PI;
  z = keep(z.rotate(90, 0, az));
  z = keep(z.translate(c.od_mm[0], c.od_mm[1], c.od_mm[2]));
  return keep(part.add(z));
}

function zatrzask(part, c, keep) {
  const L = c.dlugosc_ramienia_mm, t = c.grubosc_ramienia_mm, w = c.szerokosc_ramienia_mm;
  const h = c.wysokosc_zaczepu_mm;
  let ramie = keep(Manifold.cube([L, w, t]));
  const dol = keep(Manifold.cube([0.001, w, t]).translate(L, 0, 0));
  const gor = keep(Manifold.cube([0.001, w, t + h]).translate(L + h, 0, 0));
  const zaczep = keep(Manifold.hull([dol, gor]));
  let clip = keep(ramie.add(zaczep));
  const szczelina = keep(Manifold.cube([L - 1, w + 2, 1.2]).translate(0.5, -1, t));
  clip = keep(clip.subtract(szczelina));
  const k = c.kierunek || 'y';
  if (k === 'y') clip = keep(clip.rotate(0, 0, 90));
  if (k === '-y') clip = keep(clip.rotate(0, 0, -90));
  if (k === '-x') clip = keep(clip.rotate(0, 0, 180));
  clip = keep(clip.translate(c.punkt_mm[0], c.punkt_mm[1], c.punkt_mm[2]));
  return keep(part.add(clip));
}

function cecha(part, c, keep) {
  switch (c.typ) {
    case 'otwor':
    case 'otwor_pod_wkladke':
      return otwor(part, Object.assign({ przez: c.typ === 'otwor' ? !!c.przez : false }, c), keep);
    case 'poglebienie':
      return poglebienie(part, c, keep);
    case 'poglebienie_stozkowe':
      return poglebienieStozkowe(part, c, keep);
    case 'kieszen':
      return kieszen(part, c, keep);
    case 'zebro':
      return zebro(part, c, keep);
    case 'zaokraglenie_pionowe':
      return zaokraglijPionowo(part, c.promien_mm, keep);
    case 'faza_gorna':
      return faza(part, c.szerokosc_mm, true, keep);
    case 'faza_dolna':
      return faza(part, c.szerokosc_mm, false, keep);
    case 'zatrzask':
      return zatrzask(part, c, keep);
    default:
      throw new Error('Nieznana cecha: ' + c.typ);
  }
}

function specCzesci(specWe) {
  const spec = JSON.parse(JSON.stringify(specWe));
  if (Array.isArray(spec.czesci) && spec.czesci.length) {
    if (spec.czesci.length > 4) throw new Error('Maksymalnie 4 części w jednym projekcie.');
    return { root: spec, czesci: spec.czesci, z10: false };
  }
  return {
    root: spec,
    czesci: [{
      nazwa: spec.nazwa,
      material: spec.material,
      opis_slowny: spec.opis_slowny,
      orientacja_druku: spec.orientacja_druku,
      bryly: spec.bryly,
      cechy: spec.cechy,
      pytania: spec.pytania,
      uwagi_do_druku: spec.uwagi_do_druku
    }],
    z10: true
  };
}

function jakoCzesc10(cz, root) {
  return {
    spec_version: '1.0',
    nazwa: cz.nazwa || root.nazwa,
    material: cz.material || root.material,
    opis_slowny: cz.opis_slowny || root.opis_slowny || '',
    orientacja_druku: cz.orientacja_druku || root.orientacja_druku,
    bryly: cz.bryly || [],
    cechy: cz.cechy || [],
    pytania: cz.pytania || root.pytania || [],
    uwagi_do_druku: cz.uwagi_do_druku || root.uwagi_do_druku || ''
  };
}

export function snapshotMesh(part) {
  const m = part.getMesh();
  const g = gabaryt(part);
  return {
    numProp: m.numProp,
    vertProperties: Float32Array.from(m.vertProperties),
    triVerts: Uint32Array.from(m.triVerts),
    numTri: part.numTri(),
    volume: part.volume(),
    bbox: { x: g.x, y: g.y, z: g.z, min: g.min.slice(), max: g.max.slice() },
    isEmpty: part.isEmpty()
  };
}

function zlozBryly(spec, keep) {
  let part = null;
  for (const b of spec.bryly) {
    const s = osadz(bryla(b.ksztalt, keep), b, keep);
    if (!part) part = s;
    else if (b.operacja === 'dodaj') part = keep(part.add(s));
    else if (b.operacja === 'odejmij') part = keep(part.subtract(s));
    else if (b.operacja === 'przetnij') part = keep(part.intersect(s));
    else throw new Error('Nieznana operacja: ' + b.operacja);
  }
  if (!part) throw new Error('Brak brył do złożenia');
  return part;
}

function buildOnePart(specWe, opts) {
  const spec = normalizujSpec(specWe);
  if (spec.pytania && spec.pytania.length && (!spec.bryly || !spec.bryly.length)) {
    return { pytania: spec.pytania, spec, mesh: null, werdykt: { wpisy: [], eksportOk: false }, deklaracja: spec.deklaracja };
  }
  return withArena(keep => {
    let part = zlozBryly(spec, keep);
    for (const c of spec.cechy) part = cecha(part, c, keep);
    const g = gabaryt(part);
    spec.deklaracja.bbox = { x: +g.x.toFixed(4), y: +g.y.toFixed(4), z: +g.z.toFixed(4) };
    spec.deklaracja.tolerance_mm = spec.deklaracja.tolerance_mm || 0.2;
    spec.deklaracja.objetosc_mm3 = +part.volume().toFixed(2);
    const werdykt = sprawdzBramke(part, spec.deklaracja, spec, opts || {});
    for (const t of spec._ostrzezeniaNorm || []) {
      werdykt.wpisy.push({ poziom: 'ostrzezenie', kod: 'NORM', tekst: t });
    }
    const mesh = snapshotMesh(part);
    return { spec, mesh, werdykt, deklaracja: spec.deklaracja };
  });
}

export function buildAndGate(specWe, opts) {
  if (!Manifold) throw new Error('initEngine() najpierw');
  const pack = specCzesci(specWe);
  const rootPyt = pack.root.pytania || [];
  const puste = pack.czesci.every(c => !c.bryly || !c.bryly.length);
  if (rootPyt.length && puste) {
    return { pytania: rootPyt, spec: specWe, mesh: null, werdykt: { wpisy: [], eksportOk: false } };
  }
  const wyniki = pack.czesci.map(cz => buildOnePart(jakoCzesc10(cz, pack.root), opts));
  const pytOnly = wyniki.filter(r => r.pytania && r.pytania.length && !r.mesh);
  if (pytOnly.length && wyniki.every(r => !r.mesh)) {
    return {
      pytania: pytOnly.flatMap(r => r.pytania),
      spec: specWe,
      mesh: null,
      werdykt: { wpisy: [], eksportOk: false }
    };
  }
  const wpisy = [];
  wyniki.forEach((r) => {
    const prefix = (!pack.z10 && wyniki.length > 1) ? ('[' + (r.spec.nazwa || 'część') + '] ') : '';
    for (const w of (r.werdykt && r.werdykt.wpisy) || []) {
      wpisy.push(Object.assign({}, w, { tekst: prefix + w.tekst }));
    }
  });
  const werdykt = {
    wpisy,
    eksportOk: wyniki.every(r => r.werdykt && r.werdykt.eksportOk)
  };
  if (pack.z10) {
    const r = wyniki[0];
    return { spec: r.spec, mesh: r.mesh, werdykt, deklaracja: r.deklaracja, czesci: wyniki };
  }
  const spec11 = JSON.parse(JSON.stringify(pack.root));
  spec11.spec_version = spec11.spec_version || '1.1';
  spec11.czesci = wyniki.map(r => ({
    nazwa: r.spec.nazwa,
    material: r.spec.material,
    bryly: r.spec.bryly,
    cechy: r.spec.cechy,
    uwagi_do_druku: r.spec.uwagi_do_druku,
    deklaracja: r.deklaracja
  }));
  return {
    spec: spec11,
    mesh: wyniki[0] && wyniki[0].mesh,
    werdykt,
    deklaracja: wyniki[0] && wyniki[0].deklaracja,
    czesci: wyniki
  };
}

/**
 * Interfejs zestawu 14.6: `export async function build(spec)`.
 * Zwraca obiekt z boundingBox()/delete(). Cecha, której nie umiemy, albo
 * błąd bramki (PLYTA, SCIANKA, …) = wyjątek — nigdy bryła bez cechy.
 */
export async function build(specWe) {
  await initEngine();
  const r = buildAndGate(specWe);
  if (r.pytania && r.pytania.length && !r.mesh) {
    throw new Error('SPEC ma pytania i brak brył: ' + r.pytania.join('; '));
  }
  const bledy = ((r.werdykt && r.werdykt.wpisy) || []).filter(w => w.poziom === 'blad');
  if (bledy.length) {
    throw new Error(bledy.map(w => w.kod + ': ' + w.tekst).join('; '));
  }
  const bb = r.mesh.bbox;
  return {
    boundingBox() {
      return { min: bb.min.slice(), max: bb.max.slice() };
    },
    delete() {}
  };
}

export function meshToVF(mesh) {
  const np = mesh.numProp, vp = mesh.vertProperties, tv = mesh.triVerts;
  const n = vp.length / np;
  const V = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    V[i * 3] = vp[i * np]; V[i * 3 + 1] = vp[i * np + 1]; V[i * 3 + 2] = vp[i * np + 2];
  }
  const F = new Uint32Array(tv.length);
  F.set(tv);
  return { V, F };
}
