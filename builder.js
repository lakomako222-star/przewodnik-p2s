/**
 * Budowniczy SPEC v1 → siatka. Silnik: manifold-3d, Apache-2.0 (engine/LICENSE-manifold.txt).
 * Model NIE liczy luzów i NIE pisze kodu. Nieznany typ = wyjątek z nazwą, nigdy continue.
 *
 * Luz jest CAŁĄ szczeliną na wymiarze, nie naddatkiem na stronę.
 * Konwencja: kupon M28-C, gniazdo 8 + 0,15 zmierzone 8,15 mm — pełna szczelina, nie per-strona.
 * Kupon nie dowodzi wzoru. Wzór startowy PETG przesuwne: (0,20 + 0,003×Ø)×1,2;
 * Ø8 → 8,269 (T-03); Ø44 → 0,398 mm (baza bez mnożnika materiału to 0,332).
 */
import { sprawdzBramke, gabaryt, sprawdzDodatkiNapisu, zmierzMarginesyOtworow } from './gate.js';
import { SKRYPT, SKRYPT_META } from './font-skrypt.js';

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
// Projekt generuje nowe bryły przy N=96. Przerób używa osobno N=192
// i r/cos(pi/N), bo precyzyjnie obrabia już istniejące powierzchnie walcowe.
export const PROJEKT_CIRCULAR_SEGMENTS = 96;
export const KSZTALTY = ['prostopadloscian', 'walec', 'kula', 'rura', 'graniastoslup', 'wyciagniecie', 'obrot', 'napis', 'traktor', 'pad'];
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

/** Przywraca cel Projektu po użyciu wspólnego WASM przez Przerób (N=192). */
export function ustawNProjektu() {
  if (!wasm || typeof wasm.setCircularSegments !== 'function') {
    throw new Error('initEngine() najpierw');
  }
  wasm.setCircularSegments(PROJEKT_CIRCULAR_SEGMENTS);
  if (typeof wasm.getCircularSegments === 'function') {
    const nSilnik = wasm.getCircularSegments(10);
    if (nSilnik !== PROJEKT_CIRCULAR_SEGMENTS) {
      throw new Error(
        `N Projektu ${nSilnik} po setCircularSegments(${PROJEKT_CIRCULAR_SEGMENTS}) — ` +
        'oczekiwane N=96; Przerób ma osobne N=192'
      );
    }
  }
  return PROJEKT_CIRCULAR_SEGMENTS;
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
  if (wasm) {
    ustawNProjektu();
    return { Manifold, CrossSection, wasm };
  }
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
  Manifold = wasm.Manifold;
  CrossSection = wasm.CrossSection;
  ustawNProjektu();
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

export const PODPORY_TYPY_TAK = ['tylko_na_plycie', 'organiczne', 'drzewiaste', 'normalne'];

/**
 * Plan druku (orientacja + podpory + brim) jest obowiązkowy, gdy są bryły.
 * Przy samych pytaniach (pusta siatka) jeszcze nie — człowiek nie wybrał kształtu.
 */
export function walidujPlanDruku(spec) {
  const o = spec && spec.orientacja_druku;
  if (!o || typeof o !== 'object') {
    throw new Error('Brak orientacja_druku — podaj która ściana leży na płycie.');
  }
  if (!Array.isArray(o.obrot_xyz_deg) || o.obrot_xyz_deg.length !== 3
    || o.obrot_xyz_deg.some(v => !Number.isFinite(Number(v)))) {
    throw new Error('orientacja_druku.obrot_xyz_deg wymaga trzech liczb.');
  }
  if (typeof o.sciana_na_plycie !== 'string' || !o.sciana_na_plycie.trim()) {
    throw new Error('orientacja_druku.sciana_na_plycie — która ściana na płycie.');
  }
  if (typeof o.uzasadnienie !== 'string' || !o.uzasadnienie.trim()) {
    throw new Error('orientacja_druku wymaga uzasadnienia.');
  }
  const p = spec && spec.podpory;
  if (!p || typeof p !== 'object') {
    throw new Error('Brak podpory — zdecyduj tak/nie i wpisz uzasadnienie.');
  }
  if (typeof p.wymagane !== 'boolean') {
    throw new Error('podpory.wymagane musi być true albo false.');
  }
  if (typeof p.uzasadnienie !== 'string' || !p.uzasadnienie.trim()) {
    throw new Error('podpory.uzasadnienie jest wymagane.');
  }
  if (p.wymagane) {
    if (PODPORY_TYPY_TAK.indexOf(p.typ) < 0) {
      throw new Error('podpory.typ: tylko_na_plycie / organiczne / drzewiaste / normalne.');
    }
  } else if (p.typ != null && p.typ !== 'brak') {
    throw new Error('Gdy podpory.wymagane=false, typ ma być "brak" albo pominięty.');
  }
  const b = spec && spec.brim;
  if (!b || typeof b !== 'object') {
    throw new Error('Brak brim — zdecyduj tak/nie i wpisz uzasadnienie.');
  }
  if (typeof b.wymagany !== 'boolean') {
    throw new Error('brim.wymagany musi być true albo false.');
  }
  if (typeof b.uzasadnienie !== 'string' || !b.uzasadnienie.trim()) {
    throw new Error('brim.uzasadnienie jest wymagane.');
  }
  return spec;
}

function foldPl(s) {
  return String(s || '').toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
    .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
}

/** Kot / pionek / robot — nie jeden klocek. */
export function wygladaNaFigurke(spec) {
  const t = foldPl([
    spec && spec.nazwa,
    spec && spec.opis_slowny,
    spec && spec.uwagi_do_druku
  ].join(' '));
  return /figurk|zabawk|kot\b|kotek|kicia|pies\b|piesek|robot|pionek|szach|zwierz|smok|dino|postac/.test(t);
}

export function walidujFigurkeCsg(spec) {
  if (!wygladaNaFigurke(spec)) return spec;
  const bry = spec.bryly || [];
  if (!bry.length) return spec;
  const dodaj = bry.filter(b => b && b.operacja === 'dodaj');
  if (dodaj.length < 5) {
    throw new Error(
      'Figurka-pudełko odrzucona: złóż z ≥5 brył „dodaj” (głowa, tułów, uszy/hełm, łapy/stopy). Teraz: '
      + dodaj.length + '.'
    );
  }
  const typy = dodaj.map(b => b.ksztalt && b.ksztalt.typ).filter(Boolean);
  if (typy.length && typy.every(t => t === 'prostopadloscian')) {
    throw new Error('Figurka z samych prostopadłościanów to pudełko. Dodaj kule i walce (uszy = stożek).');
  }
  const maStope = dodaj.slice(0, 5).some(b => {
    const k = b.ksztalt || {};
    const z = (b.pozycja_mm && Number(b.pozycja_mm[2])) || 0;
    if (z > 2.5) return false;
    if (k.typ === 'walec' && k.wysokosc_mm >= 1.2 && k.wysokosc_mm <= 8) return true;
    if (k.typ === 'prostopadloscian' && k.z_mm >= 1.2 && k.z_mm <= 10) return true;
    return false;
  });
  if (!maStope) {
    throw new Error('Figurka: dodaj płaską stopę (walec h=2–4 mm, srodkowanie xy, Z=0) jako jedną z pierwszych brył.');
  }
  return spec;
}

export function odrzucFigurkePudelko(mesh, spec) {
  if (!wygladaNaFigurke(spec) || !mesh) return;
  const bb = mesh.bbox || {};
  const boxVol = (bb.x || 0) * (bb.y || 0) * (bb.z || 0);
  const fill = boxVol > 0 ? (mesh.volume || 0) / boxVol : 1;
  if ((mesh.numTri || 0) < 48 || fill > 0.82) {
    throw new Error(
      'Figurka wygląda jak pudełko (trójkąty ' + (mesh.numTri || 0)
      + ', wypełnienie bbox ' + Math.round(fill * 100)
      + '%). Złóż z kul i walców, nie z jednego klocka.'
    );
  }
  const np = mesh.numProp || 3;
  const vp = mesh.vertProperties;
  if (!vp || !vp.length) return;
  const n = vp.length / np;
  let zmin = Infinity;
  for (let i = 0; i < n; i++) {
    const z = vp[i * np + 2];
    if (z < zmin) zmin = z;
  }
  let nStopa = 0, xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (vp[i * np + 2] > zmin + 0.35) continue;
    nStopa++;
    const x = vp[i * np], y = vp[i * np + 1];
    if (x < xmin) xmin = x; if (x > xmax) xmax = x;
    if (y < ymin) ymin = y; if (y > ymax) ymax = y;
  }
  const footSpan = Math.min(xmax - xmin, ymax - ymin);
  const bodySpan = Math.min(bb.x || 0, bb.y || 0);
  if (nStopa < 8 || (bodySpan > 1 && footSpan < 0.22 * bodySpan)) {
    throw new Error('Figurka bez płaskiej stopy — dodaj walec lub prostopadłościan na Z=0 (Ø ≥ 0,35×szerokość).');
  }
}

export function walidujSpec(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('SPEC nie jest obiektem');
  aliasCech(spec);
  if (spec.spec_version !== '1.0' && spec.spec_version !== '1.1') {
    throw new Error('Nieznana spec_version: ' + spec.spec_version);
  }
  if (!spec.nazwa) throw new Error('Brak nazwa');
  if (!MNOZNIK[spec.material]) throw new Error('Nieznany materiał: ' + spec.material);
  if (spec.orientacja_druku != null) {
    const o = spec.orientacja_druku;
    if (!o || !Array.isArray(o.obrot_xyz_deg) || o.obrot_xyz_deg.length !== 3
      || o.obrot_xyz_deg.some(v => !Number.isFinite(Number(v)))) {
      throw new Error('orientacja_druku.obrot_xyz_deg wymaga trzech liczb.');
    }
    if (typeof o.uzasadnienie !== 'string' || !o.uzasadnienie.trim()) {
      throw new Error('orientacja_druku wymaga uzasadnienia.');
    }
  }
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
  walidujFigurkeCsg(spec);
  if (spec.bryly.length) walidujPlanDruku(spec);
  return spec;
}

export function aliasCech(spec) {
  for (const c of spec.cechy || []) {
    if (!c || typeof c !== 'object') continue;
    if (!c.punkt_mm) {
      if (Array.isArray(c.pozycja_mm) && c.pozycja_mm.length === 3) c.punkt_mm = c.pozycja_mm;
      else if (Array.isArray(c.punkt) && c.punkt.length === 3) c.punkt_mm = c.punkt;
      else if (Array.isArray(c.xyz_mm) && c.xyz_mm.length === 3) c.punkt_mm = c.xyz_mm;
    }
    if (!c.os) {
      const a = c.axis || c.kierunek_osi || c.kierunek;
      if (a === 'x' || a === 'y' || a === 'z' || a === '-x' || a === '-y' || a === '-z') c.os = a;
    }
    if (c.srednica_mm == null && c.srednica != null) c.srednica_mm = c.srednica;
    if (c.przez == null && (c.through != null || c.przelot != null)) c.przez = !!(c.through || c.przelot);
    if (c.typ === 'poglebienie_stozkowe') {
      if (c.srednica_otworu_mm == null && c.srednica_mm != null) c.srednica_otworu_mm = c.srednica_mm;
      if (c.srednica_lba_mm == null && c.srednica_glowy_mm != null) c.srednica_lba_mm = c.srednica_glowy_mm;
      if (c.kat_lba_deg == null && c.kat_deg != null) c.kat_lba_deg = c.kat_deg;
      if (c.srednica_lba_mm == null || c.kat_lba_deg == null || c.srednica_otworu_mm == null) {
        c.typ = 'otwor';
        if (c.srednica_mm == null) c.srednica_mm = c.srednica_otworu_mm;
        if (c.przez == null) c.przez = true;
      }
    }
    if (c.typ === 'poglebienie') {
      if (c.srednica_otworu_mm == null && c.srednica_mm != null) c.srednica_otworu_mm = c.srednica_mm;
    }
  }
  return spec;
}

export function normalizujSpec(specWe) {
  const spec = JSON.parse(JSON.stringify(specWe));
  aliasCech(spec);
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

/** 5×7 bitmap — TYLKO fallback, gdy znak nie ma konturu skryptu. */
const FONT57 = {
  A: [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  B: [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
  C: [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E],
  D: [0x1E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1E],
  E: [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F],
  F: [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
  G: [0x0E, 0x11, 0x10, 0x13, 0x11, 0x11, 0x0E],
  H: [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  I: [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
  M: [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  P: [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
  R: [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
  S: [0x0E, 0x11, 0x10, 0x0E, 0x01, 0x11, 0x0E],
  T: [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11],
  Y: [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
  a: [0x00, 0x00, 0x0E, 0x01, 0x0F, 0x11, 0x0F],
  c: [0x00, 0x00, 0x0E, 0x11, 0x10, 0x11, 0x0E],
  d: [0x01, 0x01, 0x0F, 0x11, 0x11, 0x11, 0x0F],
  e: [0x00, 0x00, 0x0E, 0x11, 0x1F, 0x10, 0x0E],
  g: [0x00, 0x00, 0x0F, 0x11, 0x0F, 0x01, 0x0E],
  h: [0x10, 0x10, 0x1E, 0x11, 0x11, 0x11, 0x11],
  i: [0x04, 0x00, 0x0C, 0x04, 0x04, 0x04, 0x0E],
  n: [0x00, 0x00, 0x1E, 0x11, 0x11, 0x11, 0x11],
  o: [0x00, 0x00, 0x0E, 0x11, 0x11, 0x11, 0x0E],
  r: [0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10],
  s: [0x00, 0x00, 0x0F, 0x10, 0x0E, 0x01, 0x1E],
  t: [0x08, 0x08, 0x1E, 0x08, 0x08, 0x09, 0x06],
  u: [0x00, 0x00, 0x11, 0x11, 0x11, 0x13, 0x0D],
  w: [0x00, 0x00, 0x11, 0x11, 0x15, 0x15, 0x0A],
  y: [0x00, 0x00, 0x11, 0x11, 0x0F, 0x01, 0x0E],
  z: [0x00, 0x00, 0x1F, 0x02, 0x04, 0x08, 0x1F],
  ' ': [0, 0, 0, 0, 0, 0, 0]
};
FONT57.b = [0x10, 0x10, 0x1E, 0x11, 0x11, 0x11, 0x1E];
FONT57.k = [0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12];
FONT57.l = [0x0C, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E];
FONT57.m = [0x00, 0x00, 0x1B, 0x15, 0x15, 0x15, 0x11];
FONT57.p = [0x00, 0x00, 0x1E, 0x11, 0x1E, 0x10, 0x10];
FONT57['ą'] = [0x00, 0x00, 0x0E, 0x01, 0x0F, 0x11, 0x0F];
FONT57['ć'] = [0x02, 0x04, 0x0E, 0x11, 0x10, 0x11, 0x0E];
FONT57['ę'] = [0x00, 0x00, 0x0E, 0x11, 0x1F, 0x10, 0x0E];
FONT57['ł'] = [0x0C, 0x04, 0x0E, 0x04, 0x04, 0x04, 0x0E];
FONT57['ń'] = [0x02, 0x04, 0x1E, 0x11, 0x11, 0x11, 0x11];
FONT57['ó'] = [0x04, 0x00, 0x0E, 0x11, 0x11, 0x11, 0x0E];
FONT57['ś'] = [0x02, 0x04, 0x0F, 0x10, 0x0E, 0x01, 0x1E];
FONT57['ź'] = [0x02, 0x04, 0x1F, 0x02, 0x04, 0x08, 0x1F];
FONT57['ż'] = [0x04, 0x00, 0x1F, 0x02, 0x04, 0x08, 0x1F];
FONT57['Ś'] = [0x04, 0x0E, 0x11, 0x10, 0x0E, 0x11, 0x0E];
FONT57['Ę'] = [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F];
FONT57['Ó'] = [0x04, 0x0E, 0x11, 0x1F, 0x11, 0x11, 0x0E];
FONT57['-'] = [0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00];

function glypha(ch) {
  if (FONT57[ch]) return FONT57[ch];
  const up = ch.toUpperCase();
  if (FONT57[up]) return FONT57[up];
  return FONT57.A;
}

const SZER_GLIFU = new Map();
/**
 * Proporcjonalna szerokość znaku: tylko kolumny faktycznie zapalone.
 * Wzorzec używa prawdziwego fontu (advance ~0,5×wysokość), sztywne 5 komórek
 * na każdy znak robiło napisy ~50% za szerokie i wpychało je w trzecią linię.
 */
function zakresGlifu(ch) {
  if (SZER_GLIFU.has(ch)) return SZER_GLIFU.get(ch);
  const g = glypha(ch);
  let lo = 5, hi = -1;
  for (let row = 0; row < 7; row++) {
    const bits = g[row] || 0;
    for (let col = 0; col < 5; col++) {
      if ((bits >> (4 - col)) & 1) { if (col < lo) lo = col; if (col > hi) hi = col; }
    }
  }
  const z = hi < lo ? { lo: 0, hi: 2 } : { lo, hi };
  SZER_GLIFU.set(ch, z);
  return z;
}

function unia(acc, m, keep) {
  if (!acc) return keep(m);
  const ab = acc.boundingBox();
  const mb = m.boundingBox();
  const wantX = Math.max(ab.max[0], mb.max[0]) - Math.min(ab.min[0], mb.min[0]);
  const wantY = Math.max(ab.max[1], mb.max[1]) - Math.min(ab.min[1], mb.min[1]);
  let u = null;
  try { u = keep(acc.add(m)); } catch (e) { u = null; }
  if (u && (typeof u.isEmpty !== 'function' || !u.isEmpty())) {
    const ub = u.boundingBox();
    const ux = ub.max[0] - ub.min[0];
    const uy = ub.max[1] - ub.min[1];
    if (ux >= wantX * 0.8 && uy >= wantY * 0.8) return u;
  }
  if (typeof Manifold.compose === 'function') {
    return keep(Manifold.compose([acc, m]));
  }
  throw new Error('NAPIS_UNIA: boolean zjadł fragment (chciano '
    + wantX.toFixed(1) + '×' + wantY.toFixed(1) + ' mm).');
}

/**
 * Liczby wzorcowe toppera ażurowego.
 * Źródło nadrzędne (4.2.22+): Chrzest_Swiety_Ani_azur_dancing-script.3mf
 *   164,94 × 199,39 × 3,00 mm · 18,40 cm³ · fill 0,187 · 12 676 tri · 2 poziomy Z
 *   kreska p50=2,4 mm (p10=1,6) · 25 dziur-liczników · BEZ ramki prostokątnej
 *   obrys = stadion/koło (pierścień ~4,2 mm) · 2 nogi 6 mm w szpicu, ~32 mm
 *   mostek-cięciwa pod linią bazową, litery = prawdziwe glify skryptu (OFL)
 * Poprzedni aniołek (płyta+relief 1,6+1,2) zostaje w liczbach nóg/ramki.
 *
 * PROMPT (nie ruszać projekt-ui.js — konflikt z innym agentem):
 * Napis = JEDNA bryła typ „napis”. Silnik sam robi glify skryptu, mostek POD
 * literami, pierścień-ramkę i nogi. ZAKAZ własnych belek/listew/nóżek obok.
 */
export const NAPIS_WZORZEC = {
  podklad_mm: 1.6,
  relief_mm: 1.2,
  grubosc_mm: 3.0,
  ramka_mm: 4.2,
  margines_tekstu_mm: 5.0,
  pogrubienie_mm: 0.35,
  kreska_mm: 2.4,
  noga_nasada_mm: 9.5,
  noga_szpic_mm: 5.0,
  noga_dlugosc_mm: 34.0,
  noga_rozstaw_wzgl: 38 / 71,
  mostek_mm: 3.0
};

function csProstokat(x0, y0, x1, y1) {
  return CrossSection.square([x1 - x0, y1 - y0], false).translate([x0, y0]);
}

function csZaokraglony(cs, r) {
  if (!(r > 0)) return cs;
  return cs.offset(r, 'Round', 2, 24).offset(-r, 'Round', 2, 24);
}

function glifSkrypt(ch) {
  if (SKRYPT[ch]) return SKRYPT[ch];
  const up = ch.toUpperCase();
  if (SKRYPT[up]) return SKRYPT[up];
  const low = ch.toLowerCase();
  if (SKRYPT[low]) return SKRYPT[low];
  return SKRYPT.o || SKRYPT.O || { a: SKRYPT_META.cap * 0.5, g: [] };
}

function csGlifSkrypt(ch, scale) {
  const g = glifSkrypt(ch);
  const adv = g.a * scale;
  if (!g.g || !g.g.length) return { cs: null, adv };
  const parts = [];
  for (const piece of g.g) {
    const rings = [piece.e.map(p => [p[0] * scale, p[1] * scale])];
    for (const hole of piece.h || []) {
      if (hole && hole.length >= 3) rings.push(hole.map(p => [p[0] * scale, p[1] * scale]));
    }
    parts.push(CrossSection.ofPolygons(rings, 'EvenOdd'));
  }
  const cs = parts.length === 1 ? parts[0] : CrossSection.union(parts);
  if (parts.length > 1) {
    for (const p of parts) { if (p !== cs) p.delete(); }
  }
  return { cs, adv };
}

/** Szerokość linii — ta sama arytmetyka co rysowanie (advance skryptu). */
function szerokoscLinii(linia, scale, gap) {
  const chars = [...linia];
  let x = 0;
  for (let i = 0; i < chars.length; i++) {
    x += glifSkrypt(chars[i]).a * scale;
    if (i + 1 < chars.length) x += gap;
  }
  return x;
}

/** Litery jednej linii jako przekrój 2D. Baza w y=0 (baseline fontu). */
function csLiteryLinii(linia, scale, gap) {
  const czesci = [];
  let x = 0;
  for (const ch of [...linia]) {
    const g = csGlifSkrypt(ch, scale);
    if (g.cs) {
      czesci.push(g.cs.translate([x, 0]));
      g.cs.delete();
    }
    x += g.adv + gap;
  }
  if (!czesci.length) return { cs: null, szerokosc: Math.max(0, x - gap), x0: 0 };
  const cs = CrossSection.union(czesci);
  for (const c of czesci) c.delete();
  const b = cs.bounds();
  return { cs, szerokosc: b.max[0] - b.min[0], x0: b.min[0] };
}

/** Pierścień stadion/koło: zaokrąglony prostokąt minus wnętrze (ażur, nie płyta). */
function csPierscienRamki(x0, y0, x1, y1, ramka, r) {
  const prostZ = csProstokat(x0, y0, x1, y1);
  const zewn = csZaokraglony(prostZ, r);
  if (zewn !== prostZ) prostZ.delete();
  const prostW = csProstokat(x0 + ramka, y0 + ramka, x1 - ramka, y1 - ramka);
  const wew = csZaokraglony(prostW, Math.max(0.5, r - ramka));
  if (wew !== prostW) prostW.delete();
  const ring = zewn.subtract(wew);
  zewn.delete();
  wew.delete();
  return ring;
}

/** Płaska sylwetka traktorka do wplecenia w topper (nie bryła 3D — topper leży płasko). */
function csTraktor(L, H) {
  const kola = [
    CrossSection.circle(H * 0.30, 48).translate([L * 0.26, H * 0.30]),
    CrossSection.circle(H * 0.19, 40).translate([L * 0.78, H * 0.19])
  ];
  const bryly = kola.concat([
    csProstokat(L * 0.14, H * 0.26, L * 0.72, H * 0.52),
    csProstokat(L * 0.60, H * 0.24, L * 0.94, H * 0.46),
    csProstokat(L * 0.30, H * 0.48, L * 0.60, H * 0.86),
    csProstokat(L * 0.64, H * 0.44, L * 0.71, H * 0.64)
  ]);
  const cs = CrossSection.union(bryly);
  for (const b of bryly) b.delete();
  return cs;
}

/** Nóżka do wbicia w tort: trapez ze ściętym szpicem, proporcje z wzorca. */
function csNoga(cx, yGora, dlugosc, nasada, szpic) {
  const yTip = yGora - dlugosc;
  // Kolejność przeciwnie do wskazówek zegara — inaczej reguła Positive wycina kontur.
  const poly = [[
    [cx + nasada / 2, yGora], [cx - nasada / 2, yGora],
    [cx - szpic / 2, yTip + 4], [cx - szpic / 2 + 1.3, yTip],
    [cx + szpic / 2 - 1.3, yTip], [cx + szpic / 2, yTip + 4]
  ]];
  const sur = CrossSection.ofPolygons(poly, 'Positive');
  const gladka = csZaokraglony(sur, 1.0);
  sur.delete();
  return gladka;
}

/**
 * Topper ażurowy: glify skryptu + mostek POD linią bazową + pierścień stadion/koło + nogi.
 * Nic nie przecina liter. Zwraca przekroje (litery / obrys) dla gate.js.
 */
function napisMesh(k, keep, ctx) {
  const tekst = String(k.tekst || '').trim();
  if (!tekst) throw new Error('napis bez tekstu');
  const h = k.wysokosc_mm || 32;
  const t = Math.max(2.4, k.grubosc_mm || NAPIS_WZORZEC.grubosc_mm);
  const scale = h / SKRYPT_META.cap;
  const gap = 0;
  const maxW = k.max_szer_mm || 240;
  const mostek = Math.max(2.5, k.mostek_mm || NAPIS_WZORZEC.mostek_mm);
  const ramka = k.ramka === false ? 0 : Math.max(2.5, k.ramka_mm || NAPIS_WZORZEC.ramka_mm);
  const pogrub = k.pogrubienie_mm == null ? NAPIS_WZORZEC.pogrubienie_mm : k.pogrubienie_mm;
  const odstep = Math.max(2.0, h * 0.08);
  const zaklad = 0.6;
  const ascMm = SKRYPT_META.asc * scale;
  const linie = Array.isArray(k.linie) && k.linie.length
    ? k.linie.map(String)
    : zawinNapis(tekst, scale, gap, maxW);

  const gotowe = [];
  let W = 0;
  for (const linia of linie) {
    const l = csLiteryLinii(linia, scale, gap);
    if (!l.cs) continue;
    gotowe.push(l);
    if (l.szerokosc > W) W = l.szerokosc;
  }
  if (!gotowe.length) throw new Error('napis pusty po złożeniu');

  const traktorH = k.wplec_traktor ? h * 0.80 : 0;
  const lh = ascMm + mostek + odstep;
  const yStart = traktorH ? (traktorH + odstep) : 0;
  const margines = k.ramka === false ? 0 : (k.margines_mm || NAPIS_WZORZEC.margines_tekstu_mm);

  const litery = [];
  const n = gotowe.length;
  gotowe.forEach((l, i) => {
    const yBase = yStart + mostek + (n - 1 - i) * lh;
    const dx = -l.szerokosc / 2 - (l.x0 || 0);
    litery.push(l.cs.translate([dx, yBase]));
    l.cs.delete();
  });
  const gora = yStart + mostek + (n - 1) * lh + ascMm;

  let literyCS = CrossSection.union(litery);
  for (const c of litery) c.delete();
  if (pogrub > 0) {
    const gruby = literyCS.offset(pogrub, 'Round', 2, 16);
    literyCS.delete();
    literyCS = gruby;
  }

  const innerHalf = W / 2 + margines;
  const mostki = [];
  gotowe.forEach((l, i) => {
    const yBase = yStart + mostek + (n - 1 - i) * lh;
    const hw = l.szerokosc / 2;
    mostki.push(csProstokat(-hw, yBase - mostek, hw, yBase + zaklad));
    if (innerHalf > hw + 1) {
      const tBar = Math.min(mostek, 2.5);
      mostki.push(csProstokat(-innerHalf, yBase - mostek, -hw, yBase - mostek + tBar));
      mostki.push(csProstokat(hw, yBase - mostek, innerHalf, yBase - mostek + tBar));
    }
  });

  const szkielet = mostki.slice();
  if (traktorH) {
    const tr = csTraktor(traktorH * 1.55, traktorH);
    szkielet.push(tr.translate([-traktorH * 1.55 / 2, 0]));
    tr.delete();
  }
  let x0 = -W / 2 - margines - ramka, x1 = W / 2 + margines + ramka;
  let y0 = -ramka, y1 = gora + ramka;
  const nogi = k.nogi_mm || 0;
  if (ramka > 0) {
    const maxRingH = Math.min(248 - nogi, Math.max(y1 - y0, (x1 - x0) * 0.82));
    const extra = maxRingH - (y1 - y0);
    if (extra > 2) {
      y0 -= extra * 0.5;
      y1 += extra * 0.5;
    }
    const rNaroza = 0.48 * Math.min(x1 - x0, y1 - y0);
    szkielet.push(csPierscienRamki(x0, y0, x1, y1, ramka, rNaroza));
  }
  const yDol = y0;
  if (nogi > 0) {
    const polSzer = (x1 - x0) / 2;
    const nasada = Math.max(NAPIS_WZORZEC.noga_nasada_mm, k.szerokosc_nogi_mm || 0);
    const szpic = Math.max(NAPIS_WZORZEC.noga_szpic_mm, nasada * 0.5);
    const xs = [-polSzer * NAPIS_WZORZEC.noga_rozstaw_wzgl, polSzer * NAPIS_WZORZEC.noga_rozstaw_wzgl];
    const ile = k.liczba_nog || (2 * polSzer >= 170 ? 3 : 2);
    if (ile >= 3) xs.push(0);
    for (const cx of xs) szkielet.push(csNoga(cx, yDol + Math.min(ramka, 1.5), nogi, nasada, szpic));
  }

  const szkieletCS = CrossSection.union(szkielet);
  for (const s of szkielet) s.delete();
  const calosc = szkieletCS.add(literyCS);
  const bryla = Manifold.extrude(calosc, t);
  keep(bryla);

  if (ctx) {
    const bb = calosc.bounds();
    ctx.napis = {
      litery: literyCS.toPolygons(),
      obrys: [[[bb.min[0], bb.min[1]], [bb.max[0], bb.min[1]], [bb.max[0], bb.max[1]], [bb.min[0], bb.max[1]]]],
      obrysDokladny: calosc.toPolygons(),
      grubosc_mm: t,
      wysokosc_liter_mm: h,
      nogi_mm: nogi,
      ramka_mm: ramka,
      mostek_mm: mostek,
      linii: n
    };
  }
  szkieletCS.delete();
  calosc.delete();
  literyCS.delete();

  const bb = bryla.boundingBox();
  const gy = bb.max[1] - bb.min[1];
  const oczekiwane = gora + 2 * ramka + nogi;
  if (gy < oczekiwane * 0.9) {
    throw new Error('NAPIS_BBOX: po złożeniu Y ' + gy.toFixed(1)
      + ' mm zamiast ~' + oczekiwane.toFixed(1) + ' mm — unia zjadła fragment.');
  }
  const gz = bb.max[2] - bb.min[2];
  if (Math.abs(gz - t) > 0.05) {
    throw new Error('NAPIS_PLASKOSC: topper ma być płaski (' + t.toFixed(2)
      + ' mm), a wyszło ' + gz.toFixed(2) + ' mm.');
  }
  return bryla;
}

function zawinNapis(tekst, scale, gap, maxW) {
  const words = tekst.split(/\s+/).filter(Boolean);
  const linie = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? (cur + ' ' + w) : w;
    if (szerokoscLinii(cand, scale, gap) > maxW && cur) {
      linie.push(cur);
      cur = w;
    } else cur = cand;
  }
  if (cur) linie.push(cur);
  return linie.length ? linie : [tekst];
}

/**
 * Skorupa pada FDM, dwie połówki, raczki na stole (bez latających walców).
 * Źródła obudowy Vader 5 Pro: 155×105×65 mm (Scythe JP), 154×102×65 (Ubuy).
 * PCB gerber publicznie NIE istnieje — kieszeń to szacunek (obudowa−ścianki), nie drop-in.
 * Printables: tylko back cover / paddle, nie pełna skorupa.
 */
function padMesh(k, keep) {
  const CX = k.rdzen_x_mm || 108;
  const CY = k.rdzen_y_mm || 102;
  const extra = k.raczka_extra_mm || 32;
  const gW = k.raczka_srednica_mm || 18;
  const wall = k.scianka_mm || 2.4;
  const cz = k.czesc === 'gora' ? 'gora' : 'dol';
  const H = cz === 'gora' ? (k.wysokosc_gora_mm || 11) : (k.wysokosc_dol_mm || 18);
  const gy0 = 18;
  const gLen = CY - 28;
  const holeR = 1.1;
  const screws = [
    [8, 10], [CX - 8, 10], [8, CY - 12], [CX - 8, CY - 12]
  ];

  function sub(acc, m) {
    return keep(acc.subtract(m));
  }
  function plus(acc, m) {
    return acc ? keep(acc.add(m)) : keep(m);
  }

  let acc = keep(Manifold.cube([CX, CY, H]));
  const gl = keep(Manifold.cube([extra, gW, H]).translate(-extra, gy0 + (gLen - gW) / 2, 0));
  const gr = keep(Manifold.cube([extra, gW, H]).translate(CX, gy0 + (gLen - gW) / 2, 0));
  const capL = keep(Manifold.cylinder(H, gW / 2, gW / 2, 0).translate(-extra, gy0 + gLen / 2, 0));
  const capR = keep(Manifold.cylinder(H, gW / 2, gW / 2, 0).translate(CX + extra, gy0 + gLen / 2, 0));
  acc = plus(acc, gl);
  acc = plus(acc, gr);
  acc = plus(acc, capL);
  acc = plus(acc, capR);

  if (cz === 'dol') {
    const cavX = CX - 2 * wall;
    const cavY = CY - 2 * wall - 6;
    const cavH = H - wall + 1;
    acc = sub(acc, keep(Manifold.cube([cavX, cavY, cavH]).translate(wall, wall, wall)));
    const pcbX = 96, pcbY = 72, pcbH = 8;
    acc = sub(acc, keep(Manifold.cube([pcbX, pcbY, pcbH + 1]).translate(
      (CX - pcbX) / 2, 14, wall
    )));
    acc = sub(acc, keep(Manifold.cube([50, 22, 9]).translate((CX - 50) / 2, 8, wall)));
    acc = sub(acc, keep(Manifold.cube([10, 8, 6]).translate((CX - 10) / 2, CY - 3, 5)));
    acc = sub(acc, keep(Manifold.cube([22, 10, 8]).translate(10, CY - 8, H - 8)));
    acc = sub(acc, keep(Manifold.cube([22, 10, 8]).translate(CX - 32, CY - 8, H - 8)));
    for (const [sx, sy] of screws) {
      const boss = keep(Manifold.cylinder(H - wall - 0.4, 3.6, 3.6, 0).translate(sx, sy, wall));
      acc = plus(acc, boss);
      acc = sub(acc, keep(Manifold.cylinder(H + 4, holeR, holeR, 0).translate(sx, sy, -2)));
    }
  } else {
    acc = sub(acc, keep(Manifold.cube([CX - 2 * wall, CY - 2 * wall, 3]).translate(wall, wall, H - 2.4)));
    const stickR = 13;
    acc = sub(acc, keep(Manifold.cylinder(H + 4, stickR, stickR, 0).translate(32, 42, -2)));
    acc = sub(acc, keep(Manifold.cylinder(H + 4, stickR, stickR, 0).translate(78, 64, -2)));
    acc = sub(acc, keep(Manifold.cube([16, 16, H + 4]).translate(24, 62, -2)));
    const abxy = [[78, 28], [70, 36], [86, 36], [78, 44]];
    for (const [ax, ay] of abxy) {
      acc = sub(acc, keep(Manifold.cylinder(H + 4, 4.6, 4.6, 0).translate(ax, ay, -2)));
    }
    for (const [sx, sy] of screws) {
      acc = sub(acc, keep(Manifold.cylinder(H + 4, holeR, holeR, 0).translate(sx, sy, -2)));
    }
  }
  return acc;
}

function traktorMesh(k, keep) {
  const L = k.dlugosc_mm || 36;
  const H = k.wysokosc_mm || 22;
  const W = Math.max(3.2, k.szerokosc_mm || 8);
  const bodyH = H * 0.38;
  const bodyL = L * 0.55;
  const hoodL = L * 0.38;
  const hoodH = H * 0.28;
  const cabL = L * 0.28;
  const cabH = H * 0.42;
  const rR = H * 0.28;
  const rF = H * 0.18;
  const tW = Math.max(2.8, W * 0.55);
  let acc = keep(Manifold.cube([bodyL, W, bodyH]).translate(L * 0.12, 0, rR * 0.7));
  acc = unia(acc, keep(Manifold.cube([hoodL, W * 0.9, hoodH]).translate(L * 0.02, W * 0.05, rR * 0.7 + bodyH * 0.55)), keep);
  acc = unia(acc, keep(Manifold.cube([cabL, W, cabH]).translate(L * 0.42, 0, rR * 0.7 + bodyH * 0.85)), keep);
  acc = unia(acc, keep(Manifold.cylinder(W * 0.7, 1.6, 1.6, 0).rotate(90, 0, 0)
    .translate(L * 0.12, W * 0.15, rR * 0.7 + bodyH + hoodH)), keep);
  const tyl = keep(Manifold.cylinder(tW, rR, rR, 0).rotate(90, 0, 0).translate(L * 0.22, (W - tW) / 2, rR));
  const przod = keep(Manifold.cylinder(tW * 0.9, rF, rF, 0).rotate(90, 0, 0).translate(L * 0.82, (W - tW * 0.9) / 2, rF));
  acc = unia(acc, tyl, keep);
  acc = unia(acc, przod, keep);
  return acc;
}

function bryla(k, keep, ctx) {
  switch (k.typ) {
    case 'napis':
      return napisMesh(k, keep, ctx);
    case 'traktor':
      return traktorMesh(k, keep);
    case 'pad':
      return padMesh(k, keep);
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
  if (typeof rzut.area === 'function' && typeof zaokr.area === 'function') {
    const a0 = Math.abs(rzut.area());
    const a1 = Math.abs(zaokr.area());
    if (a0 > 10 && a1 < a0 * 0.45) {
      throw new Error(
        'zaokraglenie_pionowe R' + r + ' zjada kształt (zostało '
        + (100 * a1 / a0).toFixed(0) + '% rzutu) — na napisie FDM usuń tę cechę.'
      );
    }
  }
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

function specMaNapis(spec) {
  return ((spec && spec.bryly) || []).some(b => b && b.ksztalt && b.ksztalt.typ === 'napis');
}

function cecha(part, c, keep, spec) {
  if (c.typ === 'zaokraglenie_pionowe' && specMaNapis(spec)) {
    (spec._ostrzezeniaNorm || (spec._ostrzezeniaNorm = []))
      .push('zaokraglenie_pionowe pominięte na napisie FDM (zjada kreski bitmapy).');
    return part;
  }
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
    if (spec.czesci.length > 8) throw new Error('Maksymalnie 8 części w jednym projekcie.');
    return { root: spec, czesci: spec.czesci, z10: false };
  }
  return {
    root: spec,
    czesci: [{
      nazwa: spec.nazwa,
      material: spec.material,
      opis_slowny: spec.opis_slowny,
      orientacja_druku: spec.orientacja_druku,
      podpory: spec.podpory,
      brim: spec.brim,
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
    podpory: cz.podpory || root.podpory,
    brim: cz.brim || root.brim,
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
  const ctx = {};
  const obce = [];
  for (const b of spec.bryly) {
    const s = osadz(bryla(b.ksztalt, keep, ctx), b, keep);
    if (ctx.napis && b.ksztalt.typ !== 'napis' && b.operacja === 'dodaj') {
      obce.push({ id: b.id || b.ksztalt.typ, bryla: s });
    }
    if (!part) part = s;
    else if (b.operacja === 'dodaj') part = keep(part.add(s));
    else if (b.operacja === 'odejmij') part = keep(part.subtract(s));
    else if (b.operacja === 'przetnij') part = keep(part.intersect(s));
    else throw new Error('Nieznana operacja: ' + b.operacja);
  }
  if (!part) throw new Error('Brak brył do złożenia');
  if (ctx.napis && obce.length) {
    const wpisy = sprawdzDodatkiNapisu(ctx.napis, obce, { CrossSection });
    const bledy = wpisy.filter(w => w.poziom === 'blad');
    if (bledy.length) throw new Error(bledy.map(w => w.kod + ': ' + w.tekst).join(' | '));
    for (const w of wpisy) (spec._ostrzezeniaNorm || (spec._ostrzezeniaNorm = [])).push(w.tekst);
  }
  if (ctx.napis) spec._napis = ctx.napis;
  return part;
}

function zastosujOrientacjeDruku(part, spec, keep) {
  const o = spec && spec.orientacja_druku;
  if (!o || !Array.isArray(o.obrot_xyz_deg)) return part;
  const r = o.obrot_xyz_deg.map(v => Number(v || 0));
  let wynik = part;
  if (r.some(v => Math.abs(v) > 1e-9)) wynik = keep(wynik.rotate(r[0], r[1], r[2]));
  const bb = wynik.boundingBox();
  const dz = -bb.min[2];
  if (Math.abs(dz) > 1e-9) wynik = keep(wynik.translate(0, 0, dz));
  spec.deklaracja.orientacja_druku = {
    obrot_xyz_deg: r,
    przesuniecie_z_mm: +dz.toFixed(6),
    min_z_mm: 0
  };
  return wynik;
}

function buildOnePart(specWe, opts) {
  const spec = normalizujSpec(specWe);
  if (spec.pytania && spec.pytania.length && (!spec.bryly || !spec.bryly.length)) {
    return { pytania: spec.pytania, spec, mesh: null, werdykt: { wpisy: [], eksportOk: false }, deklaracja: spec.deklaracja };
  }
  return withArena(keep => {
    let part = zlozBryly(spec, keep);
    for (const c of spec.cechy) part = cecha(part, c, keep, spec);
    // Materiał wokół otworów mierzymy tu, bo punkt_mm cechy żyje w układzie SPEC-u,
    // a zastosujOrientacjeDruku przenosi siatkę do układu płyty.
    spec._marginesyOtworow = zmierzMarginesyOtworow(part, spec);
    part = zastosujOrientacjeDruku(part, spec, keep);
    const nap = (spec.bryly || []).map(b => b && b.ksztalt).find(k => k && k.typ === 'napis');
    if (nap) {
      const g = gabaryt(part);
      const h = nap.wysokosc_mm || 0;
      const nogi = nap.nogi_mm || 0;
      if (h > 0 && Math.max(g.x, g.y) < 0.8 * h) {
        throw new Error('NAPIS_BBOX: litery ~' + h + ' mm, a siatka '
          + g.x.toFixed(1) + '×' + g.y.toFixed(1) + ' — cecha zjadła napis.');
      }
      if (nogi > 0 && Math.max(g.x, g.y, g.z) < nogi * 0.85) {
        throw new Error('NAPIS_BBOX: nóżki ' + nogi + ' mm nie weszły w gabaryt '
          + g.x.toFixed(1) + '×' + g.y.toFixed(1) + '×' + g.z.toFixed(1) + '.');
      }
    }
    const g = gabaryt(part);
    spec.deklaracja.bbox = { x: +g.x.toFixed(4), y: +g.y.toFixed(4), z: +g.z.toFixed(4) };
    spec.deklaracja.tolerance_mm = spec.deklaracja.tolerance_mm || 0.2;
    spec.deklaracja.objetosc_mm3 = +part.volume().toFixed(2);
    const werdykt = sprawdzBramke(part, spec.deklaracja, spec, opts || {});
    for (const t of spec._ostrzezeniaNorm || []) {
      werdykt.wpisy.push({ poziom: 'ostrzezenie', kod: 'NORM', tekst: t });
    }
    const mesh = snapshotMesh(part);
    odrzucFigurkePudelko(mesh, spec);
    return { spec, mesh, werdykt, deklaracja: spec.deklaracja };
  });
}

export function buildAndGate(specWe, opts) {
  if (!Manifold) throw new Error('initEngine() najpierw');
  ustawNProjektu();
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
    orientacja_druku: r.spec.orientacja_druku,
    podpory: r.spec.podpory,
    brim: r.spec.brim,
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

function roundN(n, d) {
  const p = Math.pow(10, d == null ? 4 : d);
  return Math.round(n * p) / p;
}

const SKIP_SCALE_KEY = /^(spec_version|material|typ|operacja|srodkowanie|id|nazwa|opis_slowny|uwagi_do_druku|pasowanie|gwint|rola|sciana_na_plycie|uzasadnienie|pytania)$/;
const ANGLE_SCALE_KEY = /deg|kata|kat_|obrot/;

/** Jednolita skala pól mm w SPEC. Kąty i orientacja bez zmian. */
export function scaleSpecNumeric(spec, factor) {
  if (!(factor > 0) || !isFinite(factor)) throw new Error('Skala musi być liczbą > 0');
  if (!spec || typeof spec !== 'object') return spec;
  const walk = (o, key) => {
    if (o == null) return o;
    if (Array.isArray(o)) {
      if (key === 'obrot_xyz_deg' || key === 'obrot_deg') return o.slice();
      if (key === 'pozycja_mm') return o.map(n => typeof n === 'number' ? roundN(n * factor) : n);
      return o.map(x => walk(x, key));
    }
    if (typeof o === 'object') {
      const n = {};
      for (const k of Object.keys(o)) n[k] = walk(o[k], k);
      return n;
    }
    if (typeof o === 'number' && isFinite(o)) {
      if (ANGLE_SCALE_KEY.test(key || '') || SKIP_SCALE_KEY.test(key || '')) return o;
      if (/objetosc/.test(key || '')) return roundN(o * factor * factor * factor, 2);
      if (/_mm$/.test(key || '') || key === 'od_mm' || key === 'do_mm'
          || /bbox|wartosc/.test(key || '')) {
        return roundN(o * factor);
      }
      return o;
    }
    return o;
  };
  return walk(JSON.parse(JSON.stringify(spec)), '');
}

/** Po skali: orientacja zostaje; brim może się zmienić (wysoki/wąski). */
export function ocenBrimPoSkali(spec, bbox) {
  const s = spec ? JSON.parse(JSON.stringify(spec)) : {};
  const x = bbox && (bbox.x != null ? bbox.x : (bbox.max && bbox.min ? bbox.max[0] - bbox.min[0] : 0));
  const y = bbox && (bbox.y != null ? bbox.y : (bbox.max && bbox.min ? bbox.max[1] - bbox.min[1] : 0));
  const z = bbox && (bbox.z != null ? bbox.z : (bbox.max && bbox.min ? bbox.max[2] - bbox.min[2] : 0));
  const foot = Math.min(Number(x) || 0, Number(y) || 0);
  const tall = (Number(z) || 0) > 2.2 * Math.max(foot, 1e-6);
  const prev = !!(s.brim && s.brim.wymagany);
  if (!s.brim) s.brim = { wymagany: false, uzasadnienie: '' };
  if (tall && !prev) {
    s.brim = {
      wymagany: true,
      uzasadnienie: 'Po skali część jest wysoka względem stopy — brim może być potrzebny. Sprawdź w Studio.'
    };
  } else if (!tall && prev) {
    s.brim.uzasadnienie = (s.brim.uzasadnienie || '')
      + ' Po skali stopa jest szersza względem wysokości — brim zwykle zbędny na PEI/Frostbite; i tak sprawdź podgląd cięcia.';
  } else if (!/po skali/i.test(s.brim.uzasadnienie || '')) {
    s.brim.uzasadnienie = (s.brim.uzasadnienie || '')
      + ' Checklistę orientacja/podpory/brim odświeżono po skali — brim bywa inny.';
  }
  return s;
}

export function meshFromSnapshot(mesh) {
  if (!Manifold) throw new Error('initEngine() najpierw');
  if (!mesh || mesh.vertProperties == null || mesh.triVerts == null) {
    throw new Error('Brak siatki w pamięci');
  }
  const np = mesh.numProp || 3;
  const vp = mesh.vertProperties;
  const tv = mesh.triVerts;
  let V;
  if (np === 3) {
    V = vp instanceof Float32Array ? vp : Float32Array.from(vp);
  } else {
    const n = vp.length / np;
    V = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      V[i * 3] = vp[i * np];
      V[i * 3 + 1] = vp[i * np + 1];
      V[i * 3 + 2] = vp[i * np + 2];
    }
  }
  const F = tv instanceof Uint32Array ? tv : Uint32Array.from(tv);
  return Manifold.ofMesh({ numProp: 3, vertProperties: V, triVerts: F });
}

/**
 * Skala żywego manifoldu. `factor` = liczba (jednolita) albo [sx, sy, sz].
 * Orientacja (obrót) zostaje; min Z wraca na płytę. Nie wymyśla modelu od nowa.
 */
export function scaleLiveMesh(mesh, factor) {
  const vec = Array.isArray(factor);
  const sx = vec ? Number(factor[0]) : Number(factor);
  const sy = vec ? Number(factor[1]) : sx;
  const sz = vec ? Number(factor[2]) : sx;
  if (!(sx > 0) || !(sy > 0) || !(sz > 0) || !isFinite(sx) || !isFinite(sy) || !isFinite(sz)) {
    throw new Error('Skala musi być liczbą > 0 albo [sx, sy, sz]');
  }
  if (!Manifold) throw new Error('initEngine() najpierw');
  const uniform = Math.abs(sx - sy) < 1e-12 && Math.abs(sy - sz) < 1e-12;
  if (uniform && Math.abs(sx - 1) < 1e-12) return mesh;
  return withArena(keep => {
    const part = keep(meshFromSnapshot(mesh));
    let scaled = keep(part.scale(vec || !uniform ? [sx, sy, sz] : sx));
    const bb = scaled.boundingBox();
    const zmin = Array.isArray(bb.min) ? bb.min[2] : bb.min.z;
    const dz = -zmin;
    if (Math.abs(dz) > 1e-9) scaled = keep(scaled.translate(0, 0, dz));
    return snapshotMesh(scaled);
  });
}
