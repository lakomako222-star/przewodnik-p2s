/**
 * Nitka Projekt → Przerób: handoff SPEC/siatki, zdjęcia, skala %.
 * Bez importów — działa w Node i w inlinie index.html.
 */
if (typeof globalThis.localStorage === 'undefined') {
  function _memStore() {
    const m = Object.create(null);
    return {
      getItem(k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem(k, v) { m[k] = String(v); },
      removeItem(k) { delete m[k]; }
    };
  }
  globalThis.localStorage = _memStore();
  globalThis.sessionStorage = _memStore();
}

const META_PREF = 'p2s.nitka.meta.';
const BLOB_PREF = 'p2s.nitka.blob.';
const ACTIVE_KEY = 'p2s.nitka.active';
const IDS_KEY = 'p2s.nitka.ids';
const MEM = (typeof globalThis !== 'undefined') ? (globalThis.__P2S_NITKA_MEM = globalThis.__P2S_NITKA_MEM || {}) : {};

export const MAX_KRAWEDZ_ZDJ = 1280;
export const JPEG_JAKOSC = 0.82;
export const VISION_FLASH = 'google/gemini-3.7-flash';
export const HINT_BEZ_WIZJI =
  'To zdjęcie opisze model z obrazem (Flash), potem Projekt/Przerób.';
export const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export function lsGet(k, d) {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : v;
  } catch (e) { return d; }
}
export function lsSet(k, v) {
  try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
}
export function ssGet(k, d) {
  try {
    const v = sessionStorage.getItem(k);
    return v == null ? d : v;
  } catch (e) { return d; }
}
export function ssSet(k, v) {
  try { sessionStorage.setItem(k, v); return true; } catch (e) { return false; }
}

export function nowyProjectId(spec) {
  const slug = String((spec && spec.nazwa) || 'projekt')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'projekt';
  return slug + '-' + Date.now().toString(36);
}

export function modelCzytaObraz(id, catalogEntry) {
  if (catalogEntry && typeof catalogEntry === 'object') {
    const im = (catalogEntry.architecture && catalogEntry.architecture.input_modalities) || [];
    if (im.indexOf('image') >= 0) return true;
    const md = String((catalogEntry.architecture && catalogEntry.architecture.modality) || '');
    if (md.indexOf('image') >= 0 || md.indexOf('vision') >= 0) return true;
  }
  const s = String(id || '').toLowerCase();
  if (!s) return false;
  if (/gemini|flash|grok|gpt-4o|gpt-4\.1|claude|pixtral|qwen.*vl|llama.*vision|terra|gpt-5\.4/.test(s))
    return true;
  if (/luna|gpt-5\.6-sol|glm-5|deepseek/.test(s)) return false;
  return false;
}

export function uzyjFlashDoOpisu(talkId, catalogEntry) {
  return !modelCzytaObraz(talkId, catalogEntry);
}

export function hintWizji(talkId, catalogEntry) {
  if (modelCzytaObraz(talkId, catalogEntry)) {
    return 'Zdjęcie idzie do wybranego modelu. To kształt, nie suwmiarka — mm wpisujesz Ty.';
  }
  return HINT_BEZ_WIZJI;
}

export function mockOpisZdjecia(dataUrl) {
  if (!dataUrl || !/^data:image\//i.test(String(dataUrl))) {
    return { ok: false, powod: 'brak obrazu' };
  }
  return {
    ok: true,
    opis: 'Mock: kształt (klamka/bryła), bez milimetrów. Szacunek, nie pomiar.',
    szacunek: true
  };
}

export function parseScalePercent(text, skalaPole) {
  const pole = skalaPole == null || skalaPole === '' ? NaN
    : parseFloat(String(skalaPole).replace(',', '.').replace(/\s/g, '').replace(/%/g, ''));
  if (isFinite(pole) && pole > 0) {
    return pole / 100;
  }
  const t = String(text || '').toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
    .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
  let m = t.match(/zmniejsz(?:\s+o)?\s+(\d+(?:[.,]\d+)?)\s*%/);
  if (m) return 1 - parseFloat(m[1].replace(',', '.')) / 100;
  m = t.match(/(?:powieksz|zwieksz|skaluj)(?:\s+o)?\s+(\d+(?:[.,]\d+)?)\s*%/);
  if (m) return 1 + parseFloat(m[1].replace(',', '.')) / 100;
  m = t.match(/skala\s+(\d+(?:[.,]\d+)?)\s*%/);
  if (m) return parseFloat(m[1].replace(',', '.')) / 100;
  m = t.match(/(?:x|×)\s*(\d+(?:[.,]\d+)?)/);
  if (m) {
    const v = parseFloat(m[1].replace(',', '.'));
    if (v > 0 && v <= 8) return v;
  }
  m = t.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (m && /powieksz|zwieksz|skal|o\s+\d/.test(t)) {
    return 1 + parseFloat(m[1].replace(',', '.')) / 100;
  }
  return null;
}

function _stripPl(s) {
  return String(s || '').toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
    .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
}

/**
 * „większy obwód tej obręczy o 5 cm” → ΔC=50 mm (NIE 5 mm, NIE skala całego modelu).
 * „dłuższe ramiona” bez liczby → +10 mm na końcach nawisu.
 */
export function parseObwodRamiona(text) {
  const t = _stripPl(text);
  if (!t.trim()) return null;
  const wantsHoop = /obwod|obrecz/.test(t);
  const wantsArms = /ramion/.test(t) || (/dluzsz/.test(t) && /ramion/.test(t));
  if (!wantsHoop && !wantsArms) return null;

  let deltaC = null;
  let m = t.match(/obwod\w*\s+(?:na\s+|o\s+)?(\d+(?:[.,]\d+)?)\s*(cm|mm)/);
  if (!m) m = t.match(/(?:tej\s+)?obrecz\w*\s+(?:na\s+|o\s+)?(\d+(?:[.,]\d+)?)\s*(cm|mm)/);
  if (!m) m = t.match(/(\d+(?:[.,]\d+)?)\s*(cm|mm)\s+(?:tej\s+)?obrecz/);
  if (!m && wantsHoop) m = t.match(/(\d+(?:[.,]\d+)?)\s*(cm|mm)/);
  if (m && wantsHoop) {
    const v = parseFloat(m[1].replace(',', '.'));
    deltaC = m[2] === 'cm' ? v * 10 : v;
  }

  let extraRamie = null;
  // Liczba musi stać przy „ramion*”, nie przy późniejszym obwodzie (5 cm).
  const ma = t.match(/ramion\w*\s+(?:o\s+|na\s+|plus\s+|\+\s*)?(\d+(?:[.,]\d+)?)\s*(cm|mm)/);
  if (ma) {
    extraRamie = ma[2] === 'cm' ? parseFloat(ma[1].replace(',', '.')) * 10
      : parseFloat(ma[1].replace(',', '.'));
  } else if (wantsArms) {
    extraRamie = 10;
  }

  if (deltaC == null && extraRamie == null) return null;
  if (deltaC != null && (!(deltaC > 0) || deltaC > 2000)) return null;
  if (extraRamie != null && extraRamie < 0) extraRamie = 0;
  return {
    deltaC_mm: deltaC,
    extraRamie_mm: extraRamie || 0,
    hoop: deltaC != null,
    arms: !!(extraRamie > 0)
  };
}

/** „dziurka na klucz / brelok” → Ø mm (domyślnie 5,2). */
export function parseOtworBrelok(text) {
  const t = _stripPl(text);
  if (!t.trim()) return null;
  if (!(/dziurk|brelok|na klucz|keyring|keyhole/.test(t))) return null;
  let d = 5.2;
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*mm/);
  if (m) d = parseFloat(m[1].replace(',', '.'));
  if (!(d >= 3) || d > 12) d = 5.2;
  return { srednica_mm: d };
}

/** „dłuższe uchwyty / ramiona o 15 mm” bez obręczy → wydłużenie osiowe na końcach. */
export function parseWydluz(text) {
  const t = _stripPl(text);
  if (!t.trim()) return null;
  const wants = (/dluzsz|wydluz/.test(t)) && /uchwyt|ramion|ramie/.test(t);
  if (!wants) return null;
  let extra = 12;
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(cm|mm)/);
  if (m) {
    extra = m[2] === 'cm' ? parseFloat(m[1].replace(',', '.')) * 10 : parseFloat(m[1].replace(',', '.'));
  }
  if (!(extra > 0) || extra > 200) extra = 12;
  return { extra_mm: extra };
}

/** „Ø 15 cm i 10 cm wysoka” albo [[SKALA_XYZ]] 1.9 1.9 1.67 */
export function parseSkalaXyz(text) {
  const t = _stripPl(String(text || ''));
  if (!t.trim()) return null;
  let m = t.match(/\[\[\s*skala_xyz\s*\]\]\s*([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)/i);
  if (m) {
    return [
      parseFloat(m[1].replace(',', '.')),
      parseFloat(m[2].replace(',', '.')),
      parseFloat(m[3].replace(',', '.'))
    ];
  }
  return null;
}

export function u8ToB64(u8) {
  const bytes = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

export function b64ToU8(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function zapiszListeId(id) {
  let ids = [];
  try { ids = JSON.parse(lsGet(IDS_KEY, '[]')); } catch (e) { ids = []; }
  if (!Array.isArray(ids)) ids = [];
  ids = ids.filter(x => x !== id);
  ids.push(id);
  while (ids.length > 12) {
    const drop = ids.shift();
    try { localStorage.removeItem(META_PREF + drop); } catch (e2) {}
    try { sessionStorage.removeItem(BLOB_PREF + drop); } catch (e3) {}
    delete MEM[drop];
  }
  lsSet(IDS_KEY, JSON.stringify(ids));
}

export function zapiszNitke(pack) {
  if (!pack || !pack.id) throw new Error('nitka wymaga id');
  const meta = {
    v: 1,
    id: pack.id,
    when: pack.when || Date.now(),
    spec: pack.spec || null,
    podsumowanie: String(pack.podsumowanie || '').slice(-4000),
    checklista: String(pack.checklista || '').slice(0, 8000),
    nazwa: (pack.spec && pack.spec.nazwa) || pack.nazwa || pack.id,
    skala: pack.skala || 1
  };
  const okMeta = lsSet(META_PREF + pack.id, JSON.stringify(meta));
  ssSet(ACTIVE_KEY, pack.id);
  zapiszListeId(pack.id);
  MEM[pack.id] = {
    mesh: pack.mesh || null,
    blob: pack.blob || null,
    spec: pack.spec || null
  };
  let okBlob = true;
  if (pack.blob) {
    const u8 = pack.blob instanceof Uint8Array ? pack.blob : new Uint8Array(pack.blob);
    okBlob = ssSet(BLOB_PREF + pack.id, u8ToB64(u8));
  }
  return { ok: okMeta, blob: okBlob, id: pack.id };
}

export function wczytajNitke(idWe) {
  const id = idWe || ssGet(ACTIVE_KEY, '') || '';
  if (!id) return null;
  let meta = null;
  try { meta = JSON.parse(lsGet(META_PREF + id, 'null')); } catch (e) { meta = null; }
  if (!meta) return null;
  const mem = MEM[id] || {};
  let blob = mem.blob || null;
  if (!blob) {
    const b64 = ssGet(BLOB_PREF + id, '');
    if (b64) {
      try { blob = b64ToU8(b64); } catch (e2) { blob = null; }
    }
  }
  return {
    id,
    spec: mem.spec || meta.spec || null,
    podsumowanie: meta.podsumowanie || '',
    checklista: meta.checklista || '',
    nazwa: meta.nazwa,
    when: meta.when,
    skala: meta.skala || 1,
    mesh: mem.mesh || null,
    blob
  };
}

export function aktywnaNitkaId() {
  return ssGet(ACTIVE_KEY, '') || '';
}

export function skrotRozmowy(blob, maxLen) {
  const n = maxLen || 2500;
  const s = String(blob || '').replace(/\s+$/g, '');
  return s.length <= n ? s : s.slice(-n);
}

function przeczytajJakoDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (typeof file === 'string' && /^data:image\//i.test(file)) {
      resolve(file);
      return;
    }
    if (typeof FileReader === 'undefined') {
      reject(new Error('brak FileReader'));
      return;
    }
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('nie przeczytałem zdjęcia'));
    r.readAsDataURL(file);
  });
}

export async function kompresujZdjecie(file, opts) {
  const max = (opts && opts.maxKrawedz) || MAX_KRAWEDZ_ZDJ;
  const q = (opts && opts.jakosc) || JPEG_JAKOSC;
  if (typeof file === 'string' && /^data:image\//i.test(file)) {
    if (/tiny|mock/i.test(file) || file.length < 800) return file;
  }
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    if (typeof file === 'string') return file;
    return TINY_PNG_DATA_URL;
  }
  const src = typeof file === 'string' ? file : await przeczytajJakoDataUrl(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function () {
      const w0 = img.naturalWidth || img.width || 1;
      const h0 = img.naturalHeight || img.height || 1;
      const s = Math.min(1, max / Math.max(w0, h0));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w0 * s));
      c.height = Math.max(1, Math.round(h0 * s));
      try {
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', q));
      } catch (e) {
        resolve(src);
      }
    };
    img.onerror = function () { resolve(src); };
    img.src = src;
  });
}

export function trescZZdjeciami(text, dataUrls) {
  const urls = (dataUrls || []).filter(Boolean);
  if (!urls.length) return text;
  const parts = [{ type: 'text', text: text || 'Obejrzyj zdjęcie. Pytaj, które mm zmierzyć. Nie podawaj Ø z fotki bez słowa „szacunek”.' }];
  urls.forEach(u => parts.push({ type: 'image_url', image_url: { url: u } }));
  return parts;
}

export function promptOpisuZdjecia() {
  return 'Opisz kształt i topologię ze zdjęcia po polsku, krótko. NIE podawaj milimetrów. '
    + 'Jeśli coś wygląda na wymiar — napisz wprost „szacunek, nie pomiar”. '
    + 'Na końcu: które wymiary człowiek ma zmierzyć suwmiarką.';
}

if (typeof window !== 'undefined') {
  window.P2S = window.P2S || {};
  Object.assign(window.P2S, {
    nowyProjectId, modelCzytaObraz, uzyjFlashDoOpisu, hintWizji, mockOpisZdjecia,
    parseScalePercent, parseObwodRamiona, parseOtworBrelok, parseWydluz, parseSkalaXyz,
    zapiszNitke, wczytajNitke,
    aktywnaNitkaId, skrotRozmowy, kompresujZdjecie, trescZZdjeciami, promptOpisuZdjecia,
    VISION_FLASH, HINT_BEZ_WIZJI, TINY_PNG_DATA_URL, MAX_KRAWEDZ_ZDJ
  });
}
