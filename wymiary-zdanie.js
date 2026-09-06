/**
 * Jawne wymiary ze zdania (słowo+liczba albo liczba+słowo). Zero imputacji: „170 na 19” bez słowa = nic.
 * Prefiks wz_ — po inline do IIFE nie kolidować z archetypy/nauka-rag.
 */
'use strict';

import { normalizujJednostki } from './builder.js';

const WZ_POLA = ['fi', 'kat', 'dl', 'h', 'w', 'grub', 'fiZ', 'fiDol', 'fi1', 'fi2', 'x', 'y', 'z', 'n',
  'fiGniazda', 'fiOtw', 'fiTrzpienia', 'podstawa', 'szpikulec',
  'gl', 'gniazdo', 'otwor', 'szczelina', 'nx', 'ny', 'hU',
  'otwory', 'ml', 'rozstaw', 'fiOsi', 'd', 'hFront'];
const WZ_TOL = 0.05;

const WZ_WZORCE = [
  { pole: 'fi1', re: /\bfi1\s*(\d+(?:[.,]\d+)?)/g },
  { pole: 'fi2', re: /\bfi2\s*(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiZ', re: /(?:\bfi|\bsrednic\w*)\s+zewnetrz\w*\s*(\d+(?:[.,]\d+)?)/g },
  { pole: 'fi', re: /(?:\bfi|\bsrednic\w*)\s+wewnetrz\w*\s*(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiDol', re: /(?:\bfi|\bsrednic\w*)\s+doln\w*\s*(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiDol', re: /\bfidol\s*(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiDol', re: /\brurka\s+(?:fi\s+)?(\d+(?:[.,]\d+)?)/g },
  { pole: 'fi', re: /(?:\bfi|\bsrednic\w*)\s+gorn\w*\s*(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiDol', re: /\bdoln\w*(?:\s+srednic\w*)?\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiDol', re: /\bdol\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'fi', re: /\bgorn\w*(?:\s+srednic\w*)?\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiZ', re: /\bzewnetrz\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'fi', re: /\bwewnetrz\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'fi', re: /\bfi\s*(\d+(?:[.,]\d+)?)/g },
  { pole: 'fi', re: /\bsrednic\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'fi', re: /(\d+(?:[.,]\d+)?)\s*(?:mm\s+)?srednic\w*/g, po: 1 },
  { pole: 'kat', re: /\bkat\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'kat', re: /(\d+(?:[.,]\d+)?)\s*(?:stopni|deg|°)/g, po: 1 },
  { pole: 'dl', re: /\bdlugosc\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'dl', re: /\bdlug\w*\s+(?:na\s+)?(\d+(?:[.,]\d+)?)/g },
  { pole: 'dl', re: /(\d+(?:[.,]\d+)?)\s*(?:mm\s+)?dlug\w*/g, po: 1 },
  { pole: 'dl', re: /\bdl\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'h', re: /\bwysok\w*\s+(?:na\s+)?(\d+(?:[.,]\d+)?)/g },
  { pole: 'h', re: /(\d+(?:[.,]\d+)?)\s*(?:mm\s+)?wysok\w*/g, po: 1 },
  { pole: 'h', re: /\bwys\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'h', re: /\bh\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'w', re: /\bszerok\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'w', re: /(\d+(?:[.,]\d+)?)\s*(?:mm\s+)?szerok\w*/g, po: 1 },
  { pole: 'w', re: /\bw\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'grub', re: /\bgrub\w*\s+(?:na\s+)?(\d+(?:[.,]\d+)?)/g },
  { pole: 'grub', re: /(\d+(?:[.,]\d+)?)\s*(?:mm\s+)?grub\w*/g, po: 1 },
  { pole: 'x', re: /\bx\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'y', re: /\by\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'n', re: /(\d+)\s*(?:przegrod\w*|hakow|haki|otwor\w*)/g },
  { pole: 'n', re: /\bz\s+(\d+)\s*(?:przegrod|hak|otwor)/g },
  { pole: 'n', re: /\bn\s+(\d+)/g },
  { pole: 'fiGniazda', re: /\bgniazd\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiOtw', re: /\bfiotw\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiOtw', re: /\botwor(?:u|em)?\s+(?:fi\s+)?(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiTrzpienia', re: /\btrzpie\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'podstawa', re: /\bpodstaw\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'szpikulec', re: /\bszpikul\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'gl', re: /\bgl\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'gl', re: /\bglebok\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'gl', re: /(\d+(?:[.,]\d+)?)\s*(?:mm\s+)?glebok\w*/g, po: 1 },
  { pole: 'gniazdo', re: /\bgniazd\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'otwor', re: /\botwor(?:u|em)?\s+(?:fi\s+)?(\d+(?:[.,]\d+)?)/g },
  { pole: 'szczelina', re: /\bszczelin\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'nx', re: /\bnx\s+(\d+)/g },
  { pole: 'ny', re: /\bny\s+(\d+)/g },
  { pole: 'hU', re: /\bhu\s+(\d+)/g },
  { pole: 'otwory', re: /(\d+)\s*otwor\w*/g },
  { pole: 'ml', re: /(\d+(?:[.,]\d+)?)\s*ml\b/g },
  { pole: 'rozstaw', re: /\brozstaw\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiOsi', re: /\bfi\s*osi\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiOsi', re: /\bosi\s+(?:fi\s+)?(\d+(?:[.,]\d+)?)/g },
  { pole: 'n', re: /(\d+)\s*(?:bit\w*|dysz\w*|wkretak\w*|kredk\w*|butel\w*|kartek|\bkart\b)/g },
  { pole: 'hFront', re: /\bfront(?:u|em)?\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'hFront', re: /\bwarg\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'z', re: /\bz\s+(\d+(?:[.,]\d+)?)/g }
];

const WZ_SLOWNIE = {
  dwa: 2, dwie: 2, dwoma: 2, dwiema: 2,
  trzy: 3, trzema: 3,
  cztery: 4, czterema: 4, czterech: 4,
  piec: 5, piecioma: 5, pieciu: 5,
  szesc: 6, szescioma: 6, szesciu: 6
};

function wz_puste() {
  const o = {};
  for (let i = 0; i < WZ_POLA.length; i++) o[WZ_POLA[i]] = [];
  return o;
}

function wz_bezOgonkow(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l').replace(/ń/g, 'n')
    .replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
}

/** Ø, wys., szer., ścianka, dziura — te same określenia co pola silnika. */
function wz_kanonOkreslenia(t) {
  return String(t || '')
    .replace(/[ø⌀∅]/g, 'fi ')
    .replace(/\bphi\b/g, 'fi')
    .replace(/\bfi\s*\.\s*/g, 'fi ')
    .replace(/\bwys\.\s*/g, 'wysokosc ')
    .replace(/\bszer\.\s*/g, 'szerokosc ')
    .replace(/\bdl\.\s*/g, 'dlugosc ')
    .replace(/\bgrub\.\s*/g, 'grubosc ')
    .replace(/\bsredn\.\s*/g, 'srednica ')
    .replace(/\b(wysok\w*|srednic\w*|szerok\w*|dlug\w*|grub\w*|glebok\w*|sciank\w*|fi|wys|szer|dl|h|w|gl|kat)\s*[:=]\s*(?=\d)/g, '$1 ')
    .replace(/\bzewn\.?\s+/g, 'zewnetrzne ')
    .replace(/\bwew\.?\s+/g, 'wewnetrzne ')
    .replace(/\bsciank\w*/g, 'grubosc')
    .replace(/\bdziur\w*/g, 'otwor')
    .replace(/\bos\s+(?=\d)/g, 'osi ');
}

const WZ_ETYKIETY = {
  fi: 'średnica', fiZ: 'średnica zewnętrzna', fiDol: 'średnica dolna',
  fi1: 'średnica 1', fi2: 'średnica 2',
  kat: 'kąt', dl: 'długość', h: 'wysokość', w: 'szerokość', grub: 'grubość',
  x: 'x', y: 'y', z: 'z', n: 'liczba',
  fiGniazda: 'średnica gniazda', fiOtw: 'średnica otworu', fiTrzpienia: 'średnica trzpienia',
  podstawa: 'podstawa', szpikulec: 'szpikulec',
  gl: 'głębokość', gniazdo: 'gniazdo', otwor: 'otwór', szczelina: 'szczelina',
  nx: 'nx', ny: 'ny', hU: 'wysokość U', otwory: 'otwory', ml: 'pojemność',
  rozstaw: 'rozstaw', fiOsi: 'średnica osi', d: 'głębokość blatu', hFront: 'wysokość frontu (wargi)'
};

export function etykietaPola(pole) {
  const k = String(pole || '');
  return WZ_ETYKIETY[k] || k;
}

function wz_liczba(s) {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function wz_unikalne(arr) {
  const out = [];
  const src = Array.isArray(arr) ? arr : [];
  for (let i = 0; i < src.length; i++) {
    const v = wz_liczba(src[i]);
    if (v == null) continue;
    let jest = false;
    for (let j = 0; j < out.length; j++) {
      if (Math.abs(out[j] - v) <= WZ_TOL) { jest = true; break; }
    }
    if (!jest) out.push(v);
  }
  return out;
}

function wz_wolny(used, a, b) {
  for (let i = 0; i < used.length; i++) {
    if (a < used[i].b && b > used[i].a) return false;
  }
  return true;
}

/** fi i fiZ to ten sam wymiar, gdy zdanie nie specyfikuje pary wewn./zewn. (korekta: „fi zewn. 50 … średnica 70”). */
function wz_scalFiRodzina(wym, tekstNorm) {
  const maWew = /wewnetrz/.test(tekstNorm);
  const maZew = /zewnetrz/.test(tekstNorm);
  if (maWew && maZew) return;
  const fi = wym.fi;
  const fiZ = wym.fiZ;
  if (!fi.length || !fiZ.length) return;
  for (let i = 0; i < fiZ.length; i++) {
    const v = fiZ[i];
    let jest = false;
    for (let j = 0; j < fi.length; j++) {
      if (Math.abs(fi[j] - v) <= WZ_TOL) { jest = true; break; }
    }
    if (!jest) fi.push(v);
  }
  wym.fiZ = [];
}

export function wymiaryZeZdania(zdanie) {
  const wym = wz_puste();
  const raw = String(zdanie || '');
  if (!raw) return wym;
  const poJed = (typeof normalizujJednostki === 'function') ? normalizujJednostki(raw) : raw;
  const t = wz_kanonOkreslenia(wz_bezOgonkow(poJed));
  const used = [];
  const slRe = /\b(dwa|dwie|dwoma|dwiema|trzy|trzema|cztery|czterema|czterech|piec|piecioma|pieciu|szesc|szescioma|szesciu)\s+(przegrod|hak|otwor)/g;
  let sm;
  while ((sm = slRe.exec(t))) {
    const val = WZ_SLOWNIE[sm[1]];
    if (val == null) continue;
    used.push({ a: sm.index, b: sm.index + sm[0].length });
    wym.n.push(val);
  }
  function wz_aplikuj(tylkoPo) {
    for (let i = 0; i < WZ_WZORCE.length; i++) {
      const w = WZ_WZORCE[i];
      if (!!w.po !== !!tylkoPo) continue;
      const re = w.re;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(t))) {
        const numStr = m[1];
        const numIdx = m.index + m[0].lastIndexOf(numStr);
        if (!wz_wolny(used, numIdx, numIdx + numStr.length)) continue;
        const val = wz_liczba(numStr);
        if (val == null) continue;
        used.push({ a: numIdx, b: numIdx + numStr.length });
        wym[w.pole].push(val);
      }
    }
  }
  wz_aplikuj(false);
  wz_aplikuj(true);
  wz_scalFiRodzina(wym, t);
  return wym;
}

/** @returns {{ pole: string, wartosci: number[] }[]} */
export function sprzecznePola(wym) {
  const o = wym && typeof wym === 'object' ? wym : {};
  const out = [];
  const keys = Object.keys(o);
  for (let i = 0; i < keys.length; i++) {
    const pole = keys[i];
    const uniq = wz_unikalne(o[pole]);
    if (uniq.length >= 2) out.push({ pole: pole, wartosci: uniq });
  }
  return out;
}

/** Pole ze zdania ma jedną jawną wartość, LLM inną. Brak pola u LLM to nie rozbieżność. */
export function rozbieznePola(wym, parametryLLM) {
  const o = wym && typeof wym === 'object' ? wym : {};
  const p = parametryLLM && typeof parametryLLM === 'object' ? parametryLLM : {};
  const out = [];
  const keys = Object.keys(o);
  for (let i = 0; i < keys.length; i++) {
    const pole = keys[i];
    const uniq = wz_unikalne(o[pole]);
    if (uniq.length !== 1) continue;
    const vLlm = wz_liczba(p[pole]);
    if (vLlm == null) continue;
    if (Math.abs(vLlm - uniq[0]) > WZ_TOL) {
      out.push({ pole: pole, zdanie: uniq[0], model: vLlm });
    }
  }
  return out;
}

const WZ_FI_GABARYT_XY = {
  kubek: 1, pokrywka: 1, lejek: 1, podstawka: 1, galka: 1, stopka: 1,
  doniczka: 1, zaslepka: 1, wazon: 1, swiecznik: 1, walek: 1, kolo: 1,
  doniczkaFalista: 1, doniczkaAzurowa: 1, deszczownica: 1
};

function wz_liczbaPola(p, pole) {
  const o = p && typeof p === 'object' ? p : {};
  const n = typeof o[pole] === 'number' ? o[pole] : Number(o[pole]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Porównanie gabarytu siatki z jawnymi parametrami zdania (fi→XY, h→Z przy walcu).
 * fi wewnętrzne (klips, tuleja, kolanko) nie jest gabarytem — nie blokuje.
 * @returns {{ ok: boolean, pytania: string[], rozjazdy: {pole:string, oczekiwane:number, zmierzone:number, os:string}[] }}
 */
export function ocenGabarytVsZdanie(bbox, parametry, zdanie, szablonId) {
  const bb = bbox && typeof bbox === 'object' ? bbox : {};
  const x = Number(bb.x), y = Number(bb.y), z = Number(bb.z);
  const out = { ok: true, pytania: [], rozjazdy: [] };
  if (![x, y, z].every(Number.isFinite)) return out;
  const p = parametry && typeof parametry === 'object' ? Object.assign({}, parametry) : {};
  if (zdanie && typeof wymiaryZeZdania === 'function') {
    const wym = wymiaryZeZdania(zdanie);
    const pola = Object.keys(wym);
    for (let i = 0; i < pola.length; i++) {
      const pole = pola[i];
      if (wz_liczbaPola(p, pole) != null) continue;
      const uniq = wz_unikalne(wym[pole]);
      if (uniq.length === 1) p[pole] = uniq[0];
    }
  }
  const sid = String(szablonId || '');
  const fi = wz_liczbaPola(p, 'fi');
  const h = wz_liczbaPola(p, 'h');
  const maPudelko = wz_liczbaPola(p, 'x') != null && wz_liczbaPola(p, 'y') != null && wz_liczbaPola(p, 'z') != null;
  function rozjazd(pole, oczekiwane, zmierzone, os) {
    if (!Number.isFinite(oczekiwane) || !Number.isFinite(zmierzone)) return;
    if (Math.abs(zmierzone - oczekiwane) <= 0.5) return;
    out.ok = false;
    out.rozjazdy.push({ pole: pole, oczekiwane: oczekiwane, zmierzone: zmierzone, os: os });
    out.pytania.push(
      'Gabaryt ' + os.toUpperCase() + ' = ' + zmierzone.toFixed(2) + ' mm, zdanie ' + pole + ' = '
      + oczekiwane + ' mm (różnica > 0,5 mm). Które zostawić?'
    );
  }
  if (WZ_FI_GABARYT_XY[sid] && fi != null) {
    rozjazd('fi', fi, Math.max(x, y), x >= y ? 'x' : 'y');
  }
  if (WZ_FI_GABARYT_XY[sid] && h != null && !maPudelko) {
    rozjazd('h', h, z, 'z');
  }
  return out;
}

/**
 * Blok tekstu dla agenta / czatu Projekt przed zapisem 3MF.
 * @returns {{ tekst: string, ok: boolean, pytania: string[], rozjazdy: object[] }}
 */
export function pomiarZwrotny(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const bb = o.bbox && typeof o.bbox === 'object' ? o.bbox : {};
  const x = Number(bb.x), y = Number(bb.y), z = Number(bb.z);
  const gab = [x, y, z].every(Number.isFinite)
    ? (x.toFixed(2) + ' × ' + y.toFixed(2) + ' × ' + z.toFixed(2) + ' mm')
    : 'brak';
  const czesci = (typeof o.czesci_n === 'number' && Number.isFinite(o.czesci_n)) ? o.czesci_n : null;
  const kody = Array.isArray(o.kody) ? o.kody.filter(Boolean) : [];
  const ocena = ocenGabarytVsZdanie(bb, o.parametry, o.zdanie, o.szablonId);
  const linie = [
    '[pomiar-zwrotny]',
    'gabaryt: ' + gab,
    'BRYLY: ' + (czesci == null ? '?' : String(czesci)),
    'kody: ' + (kody.length ? kody.join(', ') : 'brak')
  ];
  if (!ocena.ok) {
    linie.push('rozjazd > 0,5 mm — nie zapisuję 3MF.');
    for (let i = 0; i < ocena.pytania.length; i++) linie.push(ocena.pytania[i]);
  }
  return {
    tekst: linie.join('\n'),
    ok: ocena.ok,
    pytania: ocena.pytania,
    rozjazdy: ocena.rozjazdy
  };
}

/**
 * Surowe pary A×B / A x B / A×B×C. Nie wpisuje pól wymiaryZeZdania
 * („20x5” zostaje {} — kolejność per klasa jest w zastosujMatch).
 * @returns {number[][]}
 */
export function paryAxB(zdanie) {
  const t = wz_bezOgonkow(zdanie);
  const re = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?/g;
  const out = [];
  let m;
  while ((m = re.exec(t))) {
    const a = wz_liczba(m[1]);
    const b = wz_liczba(m[2]);
    const c = m[3] != null ? wz_liczba(m[3]) : null;
    if (a == null || b == null) continue;
    const para = c == null ? [a, b] : [a, b, c];
    out.push(para);
  }
  return out;
}

function wz_eksportP2S() {
  if (typeof window === 'undefined') return;
  window.P2S = window.P2S || {};
  window.P2S.wymiaryZeZdania = wymiaryZeZdania;
  window.P2S.etykietaPola = etykietaPola;
  window.P2S.sprzecznePola = sprzecznePola;
  window.P2S.rozbieznePola = rozbieznePola;
  window.P2S.ocenGabarytVsZdanie = ocenGabarytVsZdanie;
  window.P2S.pomiarZwrotny = pomiarZwrotny;
  window.P2S.paryAxB = paryAxB;
}
wz_eksportP2S();
