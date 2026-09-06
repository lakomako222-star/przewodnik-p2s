/**
 * Słowa jakościowe → rozmiar S/M/L i materiał. Zero mm z LLM.
 * Prefiks rs_ — po inline do IIFE nie kolidować z archetypy/wymiary-zdanie.
 */
'use strict';

function rs_bezOgonkow(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l').replace(/ń/g, 'n')
    .replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
}

function rs_ramka(s) {
  return ' ' + rs_bezOgonkow(s) + ' ';
}

/**
 * @returns {{ rozmiar: 'S'|'M'|'L'|null, mocny: boolean, szybki: boolean, srodowisko: string[], pytanieMaterial: boolean }}
 */
export function cechyJakosciowe(zdanie) {
  const t = rs_ramka(zdanie);
  let rozmiar = null;
  const reS = /\b(maly|mala|male|malym|malymi|kompaktow\w*|niewielk\w*|mini)\b/g;
  const reM = /\bsredni\w*\b/g;
  const reL = /\b(duzy|duza|duze|duzym|duzymi|spory|spora|spore|sporym)\b/g;
  let last = -1;
  let m;
  reS.lastIndex = 0;
  while ((m = reS.exec(t))) {
    if (m.index >= last) { last = m.index; rozmiar = 'S'; }
  }
  reM.lastIndex = 0;
  while ((m = reM.exec(t))) {
    if (m.index >= last) { last = m.index; rozmiar = 'M'; }
  }
  reL.lastIndex = 0;
  while ((m = reL.exec(t))) {
    if (m.index >= last) { last = m.index; rozmiar = 'L'; }
  }
  const mocny = /\b(mocn\w*|solidn\w*|wytrzymal\w*|nosn\w*)\b/.test(t);
  const szybki = /\bszybk\w*\b/.test(t);
  const srodowisko = [];
  const pary = [
    ['lazienka', /\blazienk\w*\b/],
    ['prysznic', /\bprysznic\w*\b/],
    ['wanna', /\bwann\w*\b/],
    ['umywalka', /\bumywalk\w*\b/],
    ['wilgoc', /\bwilgo\w*\b/],
    ['para', /\bpar[ay]\b/],
    ['kuchnia', /\bkuchni\w*\b/],
    ['zlew', /\bzlew\b/],
    ['zewnatrz', /\bna zewnatrz\b|\bzewnatrz\b/],
    ['balkon', /\bbalkon\w*\b/],
    ['ogrod', /\bogrod\w*\b/],
    ['slonce', /\bslonc\w*\b/],
    ['samochod', /\bsamoch\w*\b/],
    ['obciazenie', /\bobciaz\w*\b/],
    ['recznik', /\brecznik\w*\b/]
  ];
  for (let i = 0; i < pary.length; i++) {
    if (pary[i][1].test(t)) srodowisko.push(pary[i][0]);
  }
  const pytanieMaterial = /\bpla czy petg\b|\bpetg czy pla\b|\bjaki (material|filament)\b|\bz czego\b/.test(t);
  return { rozmiar, mocny, szybki, srodowisko, pytanieMaterial };
}

/**
 * @param {{ mocny?: boolean, srodowisko?: string[] }} cechy
 * @returns {{ material: string, powod: string }}
 */
export function doradzMaterial(cechy) {
  const c = cechy && typeof cechy === 'object' ? cechy : {};
  const s = Array.isArray(c.srodowisko) ? c.srodowisko : [];
  const powod = [];
  if (s.indexOf('lazienka') >= 0) powod.push('łazienka: wilgoć i para');
  if (s.indexOf('prysznic') >= 0) powod.push('prysznic: wilgoć');
  if (s.indexOf('wanna') >= 0) powod.push('wanna: wilgoć');
  if (s.indexOf('umywalka') >= 0) powod.push('umywalka: wilgoć');
  if (s.indexOf('wilgoc') >= 0) powod.push('wilgoć');
  if (s.indexOf('para') >= 0) powod.push('para');
  if (s.indexOf('kuchnia') >= 0) powod.push('kuchnia: wilgoć / ciepło');
  if (s.indexOf('zlew') >= 0) powod.push('zlew: wilgoć');
  if (s.indexOf('zewnatrz') >= 0 || s.indexOf('balkon') >= 0 || s.indexOf('ogrod') >= 0 || s.indexOf('slonce') >= 0) {
    powod.push('na zewnątrz');
  }
  if (s.indexOf('samochod') >= 0) powod.push('samochód: ciepło');
  if (s.indexOf('obciazenie') >= 0) powod.push('obciążenie');
  if (s.indexOf('recznik') >= 0) powod.push('ręcznik = obciążenie');
  if (c.mocny) powod.push('mocny = obciążenie');
  if (powod.length) return { material: 'PETG', powod: powod.join('; ') };
  return { material: 'PLA', powod: 'sucho, w domu, szybki wydruk' };
}

export function zdanieMaLiczbe(zdanie) {
  return /\d/.test(String(zdanie || ''));
}

function rs_fmtPola(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const keys = Object.keys(obj).filter(function (k) { return k !== 'zrodlo'; });
  const bits = [];
  for (let i = 0; i < keys.length; i++) {
    const v = obj[keys[i]];
    if (typeof v === 'number' && Number.isFinite(v)) bits.push(keys[i] + ' ' + v);
  }
  return bits.join(', ');
}

/** Trzy opcje rozmiaru do pytań MATCH — zero cichych domyślnych. */
export function pytaniaRozmiarow(wpis) {
  const r = wpis && wpis.rozmiary;
  if (!r || typeof r !== 'object' || !r.S) return [];
  return [
    'mały (' + rs_fmtPola(r.S) + ') — albo podaj mm',
    'średni (' + rs_fmtPola(r.M) + ') — albo podaj mm',
    'duży (' + rs_fmtPola(r.L) + ') — albo podaj mm'
  ];
}

export function tekstZalozenia(klucz, pola, klasa) {
  return String(klucz) + ': ' + rs_fmtPola(pola) + ' — tabela klasy ' + String(klasa || '') + ', nie pomiar';
}

/**
 * Uzupełnia brakujące pola z tabeli S/M/L. mocny nadpisuje grub/w.
 * @returns {string[]} założenia
 */
export function uzupelnijZTabeli(p, wpis, cechy) {
  const zalozenia = [];
  const r = wpis && wpis.rozmiary;
  if (!r || !p) return zalozenia;
  const c = cechy || {};
  let klucz = c.rozmiar || null;
  if (!klucz && c.szybki) klucz = 'S';
  if (klucz && r[klucz] && typeof r[klucz] === 'object') {
    const src = r[klucz];
    const keys = Object.keys(src);
    for (let i = 0; i < keys.length; i++) {
      const pole = keys[i];
      if (pole === 'zrodlo') continue;
      const v = src[pole];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      if (p[pole] == null || p[pole] === '') p[pole] = v;
    }
    zalozenia.push(tekstZalozenia(klucz, src, (wpis && (wpis.klasa || wpis.id)) || ''));
  }
  if (c.mocny && r.mocny && typeof r.mocny === 'object') {
    const src = r.mocny;
    const keys = Object.keys(src);
    for (let i = 0; i < keys.length; i++) {
      const pole = keys[i];
      if (pole === 'zrodlo') continue;
      const v = src[pole];
      if (typeof v === 'number' && Number.isFinite(v)) p[pole] = v;
    }
    zalozenia.push(tekstZalozenia('mocny', src, (wpis && (wpis.klasa || wpis.id)) || ''));
  }
  return zalozenia;
}

/**
 * MATCH bez chmury, gdy zdanie zawiera dokładnie jedną nazwę/synonim klasy z builderem.
 * @param {string} zdanie
 * @param {(id: string) => object|null} getFn
 */
export function matchLokalny(zdanie, getFn) {
  if (typeof getFn !== 'function') return null;
  const t = rs_bezOgonkow(zdanie);
  const words = t.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  const seen = {};
  const hits = [];
  const maxN = Math.min(4, words.length);
  for (let n = maxN; n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const phrase = words.slice(i, i + n).join(' ');
      if (!phrase) continue;
      const w = getFn(phrase);
      if (!w || !w.szablon_id || w.szablon_id === 'brak_buildera') continue;
      if (seen[w.id]) continue;
      seen[w.id] = true;
      hits.push(w);
    }
  }
  if (hits.length !== 1) return null;
  return {
    decyzja: 'MATCH',
    klasa: hits[0].id,
    parametry: {},
    kandydaci: [{ klasa: hits[0].id, p: 1 }],
    pytania: [],
    uzasadnienie: 'MATCH lokalny (bez chmury)',
    p_klasy: 1,
    lokalny: true
  };
}

function rs_eksportP2S() {
  if (typeof window === 'undefined') return;
  window.P2S = window.P2S || {};
  window.P2S.cechyJakosciowe = cechyJakosciowe;
  window.P2S.doradzMaterial = doradzMaterial;
  window.P2S.zdanieMaLiczbe = zdanieMaLiczbe;
  window.P2S.pytaniaRozmiarow = pytaniaRozmiarow;
  window.P2S.uzupelnijZTabeli = uzupelnijZTabeli;
  window.P2S.matchLokalny = matchLokalny;
  window.P2S.tekstZalozenia = tekstZalozenia;
}
rs_eksportP2S();
