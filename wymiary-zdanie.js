/**
 * Jawne wymiary ze zdania (słowo + liczba). Zero imputacji: „170 na 19” bez słowa = nic.
 * Prefiks wz_ — po inline do IIFE nie kolidować z archetypy/nauka-rag.
 */
'use strict';

import { normalizujJednostki } from './builder.js';

const WZ_POLA = ['fi', 'kat', 'dl', 'h', 'w', 'grub', 'fiZ', 'fiDol', 'fi1', 'fi2', 'x', 'y', 'z'];
const WZ_TOL = 0.05;

const WZ_WZORCE = [
  { pole: 'fi1', re: /\bfi1\s*(\d+(?:[.,]\d+)?)/g },
  { pole: 'fi2', re: /\bfi2\s*(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiZ', re: /(?:\bfi|\bsrednic\w*)\s+zewnetrz\w*\s*(\d+(?:[.,]\d+)?)/g },
  { pole: 'fi', re: /(?:\bfi|\bsrednic\w*)\s+wewnetrz\w*\s*(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiDol', re: /(?:\bfi|\bsrednic\w*)\s+doln\w*\s*(\d+(?:[.,]\d+)?)/g },
  { pole: 'fi', re: /(?:\bfi|\bsrednic\w*)\s+gorn\w*\s*(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiDol', re: /\bdoln\w*(?:\s+srednic\w*)?\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'fi', re: /\bgorn\w*(?:\s+srednic\w*)?\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'fiZ', re: /\bzewnetrz\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'fi', re: /\bwewnetrz\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'fi', re: /\bfi\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'fi', re: /\bsrednic\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'kat', re: /\bkat\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'dl', re: /\bdlugosc\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'dl', re: /\bdlug\w*\s+(?:na\s+)?(\d+(?:[.,]\d+)?)/g },
  { pole: 'dl', re: /\bdl\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'h', re: /\bwysokosc\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'h', re: /\bwysokie\s+(?:na\s+)?(\d+(?:[.,]\d+)?)/g },
  { pole: 'h', re: /\bh\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'w', re: /\bszerokosc\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'w', re: /\bw\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'grub', re: /\bgrubosc\w*\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'grub', re: /\bgrub\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'x', re: /\bx\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'y', re: /\by\s+(\d+(?:[.,]\d+)?)/g },
  { pole: 'z', re: /\bz\s+(\d+(?:[.,]\d+)?)/g }
];

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
  const t = wz_bezOgonkow(poJed);
  const used = [];
  for (let i = 0; i < WZ_WZORCE.length; i++) {
    const w = WZ_WZORCE[i];
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

function wz_eksportP2S() {
  if (typeof window === 'undefined') return;
  window.P2S = window.P2S || {};
  window.P2S.wymiaryZeZdania = wymiaryZeZdania;
  window.P2S.sprzecznePola = sprzecznePola;
  window.P2S.rozbieznePola = rozbieznePola;
}
wz_eksportP2S();
