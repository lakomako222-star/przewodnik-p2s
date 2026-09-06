/**
 * Rejestr archetypów z wyboru człowieka (archetypy-rejestr.json).
 * MATCH nigdy nie dopisuje do rejestru. Brak szablon_id → brak geometrii (nie zgadujemy).
 * Szablony: nauka-szablony.js (zamrożony) + szablony-obrotowe.js + szablony-home.js.
 */
'use strict';

import {
  rurKolanko, adapterPlyta, uchwyt, katownik, pudelko, zlaczka, trojnik, ruraProsta, SZABLONY
} from './nauka-szablony.js';
import {
  podkladka, tuleja, kolnierz, zaslepka, uchwytZLaczem, kolankoTorus, SZABLONY_OBROTOWE
} from './szablony-obrotowe.js';
import {
  doniczka, haczyk, organizerPrzegrody, kubek, pokrywka, lejek, podstawka, galka, stopka,
  stojak, ociekacz, klipsKabla, wieszakListwa,
  wazon, swiecznik, walek, kolo, uchwytJajka, uchwytSzpuli, stojakOkularow, etykietaRoslin,
  SZABLONY_HOME
} from './szablony-home.js';
import {
  podstawkaLaptopa, stojakMonitora, stojakPada, uchwytSluchawek, uchwytRecznika,
  uchwytLadowarki, uchwytPamieci, wspornikGpu, SZABLONY_12B
} from './szablony-12b.js';
import {
  mocowanieWentylatora, uchwytDysku, prowadnica, kanal, obudowa, ramka, krzyz, klipsU,
  gridfinityBin, SZABLONY_12C
} from './szablony-12c.js';
import {
  mydelniczka, uchwytGabki, uchwytSzczoteczek, uchwytPrysznicowy, uchwytPapieru,
  uchwytLyzek, stojakDesek, miarka,
  organizerKabli, uchwytBitow, uchwytSciennyTabletu, przepustKablowy, klipsFilamentu,
  stojakDysz, pojemnikDesykantu, stojakWkretakow,
  zawiasProsty, klipsTorebki, stojakKredek, zaslepkaGniazdka, ochraniaczNaroznika,
  uchwytKart, wieszakPada, uchwytButelek, SZABLONY_12D
} from './szablony-12d.js';
import {
  doniczkaFalista, doniczkaAzurowa, klamraRurowa, obejma, uchwytSluchawkiPrysznicowej,
  napisTopper, deszczownica, zaczepSkadis, zaczepPegboard, zaczepMultiboard, SZABLONY_12E
} from './szablony-12e.js';
import { wymiaryZeZdania, sprzecznePola, rozbieznePola } from './wymiary-zdanie.js';

export const MATCH_NIE_PISZE_DO_REJESTRU = true;
export const MAX_PYTAN_MATCH = 3;

const FN = {
  rurKolanko, adapterPlyta, uchwyt, katownik, pudelko, zlaczka, trojnik, ruraProsta,
  podkladka, tuleja, kolnierz, zaslepka, uchwytZLaczem, kolankoTorus,
  doniczka, haczyk, organizerPrzegrody,
  kubek, pokrywka, lejek, podstawka, galka, stopka, stojak, ociekacz, klipsKabla, wieszakListwa,
  wazon, swiecznik, walek, kolo, uchwytJajka, uchwytSzpuli, stojakOkularow, etykietaRoslin,
  podstawkaLaptopa, stojakMonitora, stojakPada, uchwytSluchawek, uchwytRecznika,
  uchwytLadowarki, uchwytPamieci, wspornikGpu,
  mocowanieWentylatora, uchwytDysku, prowadnica, kanal, obudowa, ramka, krzyz, klipsU,
  gridfinityBin,
  mydelniczka, uchwytGabki, uchwytSzczoteczek, uchwytPrysznicowy, uchwytPapieru,
  uchwytLyzek, stojakDesek, miarka,
  organizerKabli, uchwytBitow, uchwytSciennyTabletu, przepustKablowy, klipsFilamentu,
  stojakDysz, pojemnikDesykantu, stojakWkretakow,
  zawiasProsty, klipsTorebki, stojakKredek, zaslepkaGniazdka, ochraniaczNaroznika,
  uchwytKart, wieszakPada, uchwytButelek,
  doniczkaFalista, doniczkaAzurowa, klamraRurowa, obejma, uchwytSluchawkiPrysznicowej,
  napisTopper, deszczownica, zaczepSkadis, zaczepPegboard, zaczepMultiboard
};

const SZABLON_WYMAGANE = {
  rurKolanko: ['fi', 'kat'],
  adapterPlyta: ['w', 'h'],
  uchwyt: ['fi', 'h'],
  katownik: ['a', 'b', 'w'],
  pudelko: ['x', 'y', 'z'],
  zlaczka: ['fi1', 'fi2'],
  trojnik: ['fi'],
  ruraProsta: ['fi', 'dl'],
  podkladka: ['fi', 'fiZ'],
  tuleja: ['fi', 'dl'],
  kolnierz: ['fi', 'fiZ'],
  zaslepka: ['fi', 'h'],
  uchwytZLaczem: ['fi', 'h'],
  kolankoTorus: ['fi', 'kat'],
  doniczka: ['fi', 'h'],
  haczyk: ['h', 'dl'],
  organizerPrzegrody: ['x', 'y', 'z'],
  kubek: ['fi', 'h'],
  pokrywka: ['fi'],
  lejek: ['fi', 'fiDol', 'h'],
  podstawka: ['fi'],
  galka: ['fi', 'h'],
  stopka: ['fi', 'h'],
  stojak: ['w', 'h', 'kat'],
  ociekacz: ['x', 'y', 'z'],
  klipsKabla: ['fi'],
  wieszakListwa: ['h', 'dl', 'n'],
  wazon: ['fi', 'h'],
  swiecznik: ['fi', 'h', 'fiGniazda'],
  walek: ['fi', 'dl'],
  kolo: ['fi', 'grub', 'fiOtw'],
  uchwytJajka: ['fi', 'h'],
  uchwytSzpuli: ['fiTrzpienia', 'dl', 'podstawa'],
  stojakOkularow: ['w', 'h'],
  etykietaRoslin: ['dl', 'w', 'szpikulec'],
  podstawkaLaptopa: ['w', 'gl', 'kat'],
  stojakMonitora: ['x', 'y', 'z'],
  stojakPada: ['w', 'kat', 'gniazdo'],
  uchwytSluchawek: ['h', 'dl'],
  uchwytRecznika: ['dl', 'fi'],
  uchwytLadowarki: ['x', 'y', 'z', 'otwor'],
  uchwytPamieci: ['n', 'szczelina'],
  wspornikGpu: ['h', 'podstawa'],
  mocowanieWentylatora: ['fi'],
  uchwytDysku: ['w', 'dl'],
  prowadnica: ['dl', 'w', 'h'],
  kanal: ['dl', 'w', 'h'],
  obudowa: ['x', 'y', 'z'],
  ramka: ['x', 'y'],
  krzyz: ['fi'],
  klipsU: ['w', 'h'],
  gridfinityBin: ['nx', 'ny', 'hU'],
  mydelniczka: ['x', 'y', 'z'],
  uchwytGabki: ['x', 'y', 'z'],
  uchwytSzczoteczek: ['fi', 'h'],
  uchwytPrysznicowy: ['fi', 'kat'],
  uchwytPapieru: ['dl', 'fi'],
  uchwytLyzek: ['x', 'y'],
  stojakDesek: ['w', 'n', 'szczelina'],
  miarka: ['fi', 'h'],
  organizerKabli: ['n', 'fi'],
  uchwytBitow: ['n', 'rozstaw'],
  uchwytSciennyTabletu: ['w', 'grub', 'kat'],
  przepustKablowy: ['fi', 'h'],
  klipsFilamentu: ['fi'],
  stojakDysz: ['n'],
  pojemnikDesykantu: ['x', 'y', 'z'],
  stojakWkretakow: ['n', 'fi'],
  zawiasProsty: ['dl', 'fiOsi'],
  klipsTorebki: ['dl', 'w'],
  stojakKredek: ['nx', 'ny', 'fi'],
  zaslepkaGniazdka: ['x', 'y'],
  ochraniaczNaroznika: ['a', 'h', 'grub'],
  uchwytKart: ['n', 'szczelina'],
  wieszakPada: ['w', 'h'],
  uchwytButelek: ['fi', 'n'],
  doniczkaFalista: ['fi', 'h'],
  doniczkaAzurowa: ['fi', 'h'],
  klamraRurowa: ['fi', 'dl'],
  obejma: ['fi', 'dl'],
  uchwytSluchawkiPrysznicowej: ['fiRury', 'fiSluchawki'],
  napisTopper: ['linie', 'h'],
  deszczownica: ['fi', 'nDysz'],
  zaczepSkadis: ['h'],
  zaczepPegboard: ['h'],
  zaczepMultiboard: ['h']
};

/** Źródła w kolejności; cel ustawiany tylko gdy pusty. Zero imputacji (brak źródła = brak pola). */
const SZABLON_ALIASY = {
  uchwyt: { h: ['z', 'dl'] },
  adapterPlyta: { w: ['x'], h: ['y'], grub: ['z'] },
  ruraProsta: { dl: ['z'] },
  pudelko: { x: ['dl'], y: ['w'], z: ['h'] },
  zlaczka: {},
  rurKolanko: {},
  trojnik: {},
  katownik: { a: ['dl', 'x'], b: ['h', 'y'] },
  podkladka: {},
  tuleja: { dl: ['z'] },
  kolnierz: { h: ['z', 'dl'] },
  zaslepka: { h: ['z', 'dl'] },
  uchwytZLaczem: { h: ['z', 'dl'] },
  kolankoTorus: {},
  doniczka: { h: ['z', 'dl'] },
  haczyk: { h: ['z'], dl: ['y'] },
  organizerPrzegrody: { x: ['dl'], y: ['w'], z: ['h'], przegrody: ['n'] },
  kubek: { h: ['z', 'dl'] },
  pokrywka: {},
  lejek: { h: ['z', 'dl'], fi: ['fi1'], fiDol: ['fi2'] },
  podstawka: {},
  galka: { h: ['z'] },
  stopka: { h: ['z'] },
  stojak: { w: ['x'], h: ['z'] },
  ociekacz: { x: ['dl'], y: ['w'], z: ['h'] },
  klipsKabla: { fi: ['d'] },
  wieszakListwa: { h: ['z'], dl: ['y'], n: ['przegrody'] },
  wazon: { h: ['z', 'dl'] },
  swiecznik: { h: ['z'], fiGniazda: ['fiDol', 'fi2'] },
  walek: { dl: ['h', 'z'] },
  kolo: { grub: ['h', 'z'], fiOtw: ['fiDol', 'fi2'] },
  uchwytJajka: { h: ['z'] },
  uchwytSzpuli: { fiTrzpienia: ['fi'], dl: ['h', 'z'], podstawa: ['fiZ', 'w'] },
  stojakOkularow: { w: ['x'], h: ['z'] },
  etykietaRoslin: { dl: ['x'], w: ['y'], szpikulec: ['h', 'z'] },
  podstawkaLaptopa: { w: ['x'], gl: ['y', 'dl'], kat: ['kat'] },
  stojakMonitora: { x: ['dl'], y: ['w'], z: ['h'] },
  stojakPada: { w: ['x'], gniazdo: ['fi', 'szczelina'] },
  uchwytSluchawek: { h: ['z'], dl: ['y'] },
  uchwytRecznika: { dl: ['x'], fi: ['d'], wsporniki: ['n'] },
  uchwytLadowarki: { x: ['dl'], y: ['w'], z: ['h'], otwor: ['fiOtw', 'fi'] },
  uchwytPamieci: { szczelina: ['w', 'grub'] },
  wspornikGpu: { h: ['z'], podstawa: ['fi', 'fiZ'] },
  mocowanieWentylatora: {},
  uchwytDysku: { w: ['x'], dl: ['y'] },
  prowadnica: { dl: ['x'], w: ['y'] },
  kanal: { dl: ['x'], w: ['y'] },
  obudowa: { x: ['dl'], y: ['w'], z: ['h'] },
  ramka: { x: ['dl'], y: ['w'], grub: ['z'] },
  krzyz: {},
  klipsU: { w: ['x'], h: ['z'] },
  gridfinityBin: { nx: ['x', 'n'], ny: ['y'], hU: ['h', 'z'] },
  mydelniczka: { x: ['dl'], y: ['w'], z: ['h'], otwory: ['n'] },
  uchwytGabki: { x: ['dl'], y: ['w'], z: ['h'] },
  uchwytSzczoteczek: { h: ['z'] },
  uchwytPrysznicowy: {},
  uchwytPapieru: { dl: ['x'], fi: ['d'] },
  uchwytLyzek: { x: ['dl'], y: ['w'] },
  stojakDesek: { w: ['x'] },
  miarka: { h: ['z'] },
  organizerKabli: {},
  uchwytBitow: { rozstaw: ['w'] },
  uchwytSciennyTabletu: { w: ['x'] },
  przepustKablowy: { h: ['z', 'dl'] },
  klipsFilamentu: {},
  stojakDysz: {},
  pojemnikDesykantu: { x: ['dl'], y: ['w'], z: ['h'], otwory: ['n'] },
  stojakWkretakow: {},
  zawiasProsty: { dl: ['x'], fiOsi: ['fi', 'otwor'] },
  klipsTorebki: { dl: ['x'], w: ['y'] },
  stojakKredek: {},
  zaslepkaGniazdka: { x: ['dl', 'w'], y: ['h'] },
  ochraniaczNaroznika: { a: ['dl', 'x'] },
  uchwytKart: { szczelina: ['w', 'grub'] },
  wieszakPada: { w: ['x'], h: ['z'] },
  uchwytButelek: {},
  doniczkaFalista: { h: ['z'] },
  doniczkaAzurowa: { h: ['z'], n_listew: ['n'] },
  klamraRurowa: { dl: ['h', 'z'] },
  obejma: { dl: ['h', 'z'] },
  uchwytSluchawkiPrysznicowej: { fiRury: ['fi'], fiSluchawki: ['fi2'] },
  napisTopper: {},
  deszczownica: { nDysz: ['n'] },
  zaczepSkadis: { h: ['z'] },
  zaczepPegboard: { h: ['z'] },
  zaczepMultiboard: { h: ['z'] }
};

let _rejestr = { when: null, wpisy: [], n: 0, _powod: 'brak', _zaladowany: false };
let _archLaduje = null;
let _progi = { prog_pewnosci_klasy: null, prog_dystansu_do_wszystkich: null, _zaladowany: false };
let _ladujeProgi = null;

function urlRejestr() {
  try {
    if (typeof document !== 'undefined') {
      const scripts = document.getElementsByTagName('script');
      for (let i = scripts.length - 1; i >= 0; i--) {
        const src = scripts[i].src || '';
        if (/projekt-ui\.js(\?|$)/.test(src) || /archetypy\.js(\?|$)/.test(src) || /nauka-rag\.js(\?|$)/.test(src)) {
          return src.replace(/[^/]+\.js(\?.*)?$/, 'archetypy-rejestr.json');
        }
      }
    }
  } catch (e) { /* ignore */ }
  return './archetypy-rejestr.json';
}

function urlProgi() {
  return urlRejestr().replace(/archetypy-rejestr\.json(\?.*)?$/, 'progi-klasyfikatora.json$1');
}

export function ustawProgi(obj) {
  const o = obj && typeof obj === 'object' ? obj : {};
  const p = o.prog_pewnosci_klasy;
  const d = o.prog_dystansu_do_wszystkich;
  _progi = {
    prog_pewnosci_klasy: (typeof p === 'number' && Number.isFinite(p)) ? p : null,
    prog_dystansu_do_wszystkich: (typeof d === 'number' && Number.isFinite(d)) ? d : null,
    _zaladowany: true
  };
  return _progi;
}

export function progiAktualne() {
  return {
    prog_pewnosci_klasy: _progi.prog_pewnosci_klasy,
    prog_dystansu_do_wszystkich: _progi.prog_dystansu_do_wszystkich,
    _zaladowany: !!_progi._zaladowany
  };
}

export async function ladujProgi(force) {
  if (_progi && _progi._zaladowany && !force) return _progi;
  if (_ladujeProgi && !force) return _ladujeProgi;
  _ladujeProgi = (async () => {
    try {
      const r = await fetch(urlProgi(), { cache: 'no-store' });
      if (!r.ok) {
        ustawProgi({});
        return _progi;
      }
      ustawProgi(await r.json());
      return _progi;
    } catch (e) {
      ustawProgi({});
      return _progi;
    } finally {
      _ladujeProgi = null;
    }
  })();
  return _ladujeProgi;
}

function pMaxKandydatow(wynik) {
  let p = null;
  const kand = wynik && wynik.kandydaci;
  if (Array.isArray(kand)) {
    for (let i = 0; i < kand.length; i++) {
      const v = kand[i] && kand[i].p;
      if (typeof v === 'number' && Number.isFinite(v) && (p == null || v > p)) p = v;
    }
  }
  if (p == null && wynik && typeof wynik.p_klasy === 'number' && Number.isFinite(wynik.p_klasy)) {
    p = wynik.p_klasy;
  }
  return p;
}

function zamrozWpis(w) {
  return JSON.parse(JSON.stringify(w));
}

function ustawWewn(obj) {
  const wpisy = Array.isArray(obj && obj.wpisy) ? obj.wpisy.map(zamrozWpis) : [];
  Object.freeze(wpisy);
  _rejestr = {
    when: obj && obj.when != null ? obj.when : null,
    wpisy,
    n: wpisy.length,
    notatka: obj && obj.notatka,
    zrodlo: obj && obj.zrodlo,
    _powod: wpisy.length ? 'ok' : 'pusty',
    _zaladowany: true
  };
  return _rejestr;
}

export function ustawRejestr(obj) {
  return ustawWewn(obj && typeof obj === 'object' ? obj : { wpisy: [] });
}

export async function ladujRejestr(force) {
  if (_rejestr && _rejestr._zaladowany && !force) return _rejestr;
  if (_archLaduje && !force) return _archLaduje;
  _archLaduje = (async () => {
    try {
      const r = await fetch(urlRejestr(), { cache: 'no-store' });
      if (!r.ok) {
        ustawWewn({ wpisy: [] });
        _rejestr._powod = 'http_' + r.status;
        return _rejestr;
      }
      const data = await r.json();
      ustawWewn(data);
      return _rejestr;
    } catch (e) {
      ustawWewn({ wpisy: [] });
      _rejestr._powod = (e && e.message) || 'fetch';
      return _rejestr;
    } finally {
      _archLaduje = null;
    }
  })();
  return _archLaduje;
}

export function czyRejestrGotowy() {
  return Array.isArray(_rejestr.wpisy) && _rejestr.wpisy.length > 0;
}

export function lista() {
  return (_rejestr.wpisy || []).map(zamrozWpis);
}

function norm(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l').replace(/ń/g, 'n')
    .replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
}

export function getArchetyp(id) {
  if (id == null || id === '') return null;
  const sid = String(id);
  const n = norm(sid);
  const wpisy = _rejestr.wpisy || [];
  for (const w of wpisy) {
    if (w.id === sid || norm(w.id) === n) return zamrozWpis(w);
    if (w.klasa && norm(w.klasa) === n) return zamrozWpis(w);
  }
  for (const w of wpisy) {
    const syn = w.synonimy || [];
    for (let i = 0; i < syn.length; i++) {
      if (norm(syn[i]) === n) return zamrozWpis(w);
    }
  }
  return null;
}

/** Alias ESM. W PWA nazwa `get` koliduje z localStorage — wołaj getArchetyp. */
export function get(id) {
  return getArchetyp(id);
}

function brakuje(params, pole) {
  if (!params || typeof params !== 'object') return true;
  const v = params[pole];
  if (v == null || v === '') return true;
  return false;
}

function znajdzSzablon(id) {
  if (!id) return null;
  let sz = SZABLONY.find(s => s.id === id);
  if (sz) return sz;
  sz = SZABLONY_OBROTOWE.find(s => s.id === id);
  if (sz) return sz;
  sz = SZABLONY_HOME.find(s => s.id === id);
  if (sz) return sz;
  sz = SZABLONY_12B.find(s => s.id === id);
  if (sz) return sz;
  sz = SZABLONY_12C.find(s => s.id === id);
  if (sz) return sz;
  sz = SZABLONY_12D.find(s => s.id === id);
  if (sz) return sz;
  return SZABLONY_12E.find(s => s.id === id) || null;
}

/**
 * Aliasy per szablon. Nie nadpisuje pola już ustawionego. Nie zgaduje brakujących liczb.
 * zlaczka: fi1 ← fi tylko gdy fi2 już podane.
 */
function aliasujParametrySzablonu(szablonId, params) {
  const o = Object.assign({}, params && typeof params === 'object' ? params : {});
  const mapa = SZABLON_ALIASY[szablonId] || {};
  const cele = Object.keys(mapa);
  for (let i = 0; i < cele.length; i++) {
    const cel = cele[i];
    if (!brakuje(o, cel)) continue;
    const zrodla = mapa[cel] || [];
    for (let j = 0; j < zrodla.length; j++) {
      const z = zrodla[j];
      if (!brakuje(o, z)) {
        o[cel] = o[z];
        break;
      }
    }
  }
  if (szablonId === 'zlaczka' && brakuje(o, 'fi1') && !brakuje(o, 'fi') && !brakuje(o, 'fi2')) {
    o.fi1 = o.fi;
  }
  return o;
}

function archUnikalne(arr) {
  const src = Array.isArray(arr) ? arr : [];
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const v = Number(src[i]);
    if (!Number.isFinite(v)) continue;
    let jest = false;
    for (let j = 0; j < out.length; j++) {
      if (Math.abs(out[j] - v) <= 0.05) { jest = true; break; }
    }
    if (!jest) out.push(v);
  }
  return out;
}

/** Jedna jawna wartość ze zdania → pole, gdy LLM go nie podał. Zero imputacji przy 0/2+ wartościach. */
function archDolaczWymiaryZdania(p, zdanie) {
  if (zdanie == null || zdanie === '' || typeof wymiaryZeZdania !== 'function') return;
  const wym = wymiaryZeZdania(zdanie);
  const pola = Object.keys(wym);
  for (let i = 0; i < pola.length; i++) {
    const pole = pola[i];
    if (!brakuje(p, pole)) continue;
    const uniq = archUnikalne(wym[pole]);
    if (uniq.length === 1) p[pole] = uniq[0];
  }
}

function archBrakSzablonu(wpis) {
  const id = wpis && wpis.szablon_id;
  return !id || id === 'brak_buildera';
}

/**
 * @returns {{ ok: boolean, powod: string|null, pole?: string, brakujace_pole?: string }}
 */
export function walidujParametry(id, params) {
  const wpis = getArchetyp(id);
  if (!wpis) return { ok: false, powod: 'brak_archetypu', pole: null };
  const p = params && typeof params === 'object' ? params : {};
  const schema = wpis.schemat_parametrow || {};
  const required = Array.isArray(schema.required) ? schema.required.slice() : [];
  const wymSz = SZABLON_WYMAGANE[wpis.szablon_id] || [];
  for (let i = 0; i < wymSz.length; i++) {
    if (required.indexOf(wymSz[i]) < 0) required.push(wymSz[i]);
  }
  for (let i = 0; i < required.length; i++) {
    const pole = required[i];
    if (brakuje(p, pole)) {
      return { ok: false, powod: 'brak_pola', pole, brakujace_pole: pole };
    }
  }
  const props = schema.properties || {};
  const keys = Object.keys(props);
  for (let i = 0; i < keys.length; i++) {
    const pole = keys[i];
    if (!Object.prototype.hasOwnProperty.call(p, pole)) continue;
    const spec = props[pole] || {};
    const v = p[pole];
    if (spec.type === 'number') {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) {
        return { ok: false, powod: 'nie_liczba', pole };
      }
      if (typeof spec.minimum === 'number' && n < spec.minimum) {
        return { ok: false, powod: 'ponizej_minimum', pole };
      }
      if (typeof spec.maximum === 'number' && n > spec.maximum) {
        return { ok: false, powod: 'powyzej_maximum', pole };
      }
    }
  }
  return { ok: true, powod: null };
}

/**
 * @returns {{ spec: object|null, powod: string|null, pole?: string }}
 */
export function build(id, params) {
  const wpis = getArchetyp(id);
  if (!wpis) return { spec: null, powod: 'brak_archetypu' };
  if (!wpis.szablon_id) return { spec: null, powod: 'brak_buildera' };
  const fn = FN[wpis.szablon_id] || (znajdzSzablon(wpis.szablon_id) || {}).fn;
  if (typeof fn !== 'function') return { spec: null, powod: 'brak_buildera' };
  const p = aliasujParametrySzablonu(wpis.szablon_id, params);
  const wal = walidujParametry(id, p);
  if (!wal.ok) return { spec: null, powod: wal.powod, pole: wal.pole };
  const sz = znajdzSzablon(wpis.szablon_id);
  const names = String((sz && sz.parametry) || '').split(',').map(s => s.trim()).filter(Boolean);
  const args = names.map(n => p[n]);
  try {
    const spec = fn.apply(null, args);
    if (!spec || typeof spec !== 'object') return { spec: null, powod: 'brak_buildera' };
    return {
      spec: {
        nazwa: spec.nazwa,
        material: spec.material,
        bryly: spec.bryly,
        cechy: spec.cechy || [],
        uwagi_do_druku: spec.uwagi_do_druku || ''
      },
      powod: null
    };
  } catch (e) {
    return { spec: null, powod: 'brak_buildera' };
  }
}

export function dopiszDoRejestru() {
  throw new Error('MATCH_NIGDY_NIE_DOPISUJE_DO_REJESTRU');
}

function pytanieOPole(pole, klasa) {
  if (pole === 'kat') return 'Podaj kąt gięcia [stopnie] dla klasy ' + (klasa || '') + '.';
  return 'Podaj ' + pole + ' [mm] dla klasy ' + (klasa || '') + '.';
}

function maLiczbe(params) {
  const o = params && typeof params === 'object' ? params : {};
  const keys = Object.keys(o);
  for (let i = 0; i < keys.length; i++) {
    const v = o[keys[i]];
    if (typeof v === 'number' && Number.isFinite(v)) return true;
    if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v.replace(',', '.')))) return true;
  }
  return false;
}

function archDodajPytanie(pytania, q, znacznikPola) {
  const juz = pytania.some(function (t) {
    return String(t).indexOf(znacznikPola) >= 0;
  });
  if (!juz && pytania.length < MAX_PYTAN_MATCH) pytania.push(q);
}

function archUsunPolaSprzeczne(p, zdanie, out, pytania) {
  if (zdanie == null || zdanie === '' || typeof wymiaryZeZdania !== 'function') return false;
  const wym = wymiaryZeZdania(zdanie);
  out.wymiary_zdanie = wym;
  const sprz = sprzecznePola(wym);
  const rozb = rozbieznePola(wym, p);
  if (sprz.length) out.sprzeczne_pola = sprz;
  if (rozb.length) out.rozbiezne_pola = rozb;
  const brak = [];
  for (let i = 0; i < sprz.length; i++) {
    const pole = sprz[i].pole;
    const vals = sprz[i].wartosci;
    delete p[pole];
    const jed = pole === 'kat' ? '°' : ' mm';
    archDodajPytanie(pytania, pole + ': ' + vals.join(' czy ') + jed + '?', pole);
    out.uzasadnienie = String(out.uzasadnienie || '') + ' [MATCH: sprzeczne_pole ' + pole + ' ' + vals.join('|') + ']';
    if (brak.indexOf(pole) < 0) brak.push(pole);
  }
  for (let i = 0; i < rozb.length; i++) {
    const pole = rozb[i].pole;
    delete p[pole];
    archDodajPytanie(
      pytania,
      'zdanie mówi ' + pole + ' ' + rozb[i].zdanie + ', model ' + rozb[i].model + ' — które?',
      pole
    );
    out.uzasadnienie = String(out.uzasadnienie || '')
      + ' [MATCH: rozbiezne_pole ' + pole + ' ' + rozb[i].zdanie + '|' + rozb[i].model + ']';
    if (brak.indexOf(pole) < 0) brak.push(pole);
  }
  if (brak.length) out.brakujace_pola = brak;
  return sprz.length > 0 || rozb.length > 0;
}

/**
 * Post-processing decyzji LLM. Rejestr pusty → MATCH traktuj jako NEW.
 * Rejestr niepusty + MATCH: walidujParametry; brak_pola + jest liczba → MATCH + pytanie;
 * brak_pola bez żadnej liczby → REJECT brak_wymiaru. NIE dopisuje do rejestru.
 * zdanie (opcjonalne): warstwa deterministyczna — sprzeczne pole → REJECT + pytanie;
 * unikalny wymiar ze zdania uzupełnia puste pole LLM; brak szablon_id → NEW.
 */
export function zastosujMatch(wynik, zdanie) {
  const out = wynik && typeof wynik === 'object' ? Object.assign({}, wynik) : { decyzja: 'NEW' };
  const pytania = Array.isArray(out.pytania) ? out.pytania.slice(0, MAX_PYTAN_MATCH) : [];
  const gotowy = czyRejestrGotowy();

  if (!gotowy) {
    if (out.decyzja === 'MATCH') {
      out.decyzja = 'NEW';
      out.uzasadnienie = String(out.uzasadnienie || '') + ' [MATCH→NEW: rejestr pusty/brak archetypów]';
    }
    out.pytania = pytania.slice(0, MAX_PYTAN_MATCH);
    return out;
  }

  if (out.decyzja !== 'MATCH') {
    out.pytania = pytania.slice(0, MAX_PYTAN_MATCH);
    return out;
  }

  const wpis = getArchetyp(out.klasa);
  if (!wpis) {
    out.decyzja = 'NEW';
    out.uzasadnienie = String(out.uzasadnienie || '') + ' [MATCH→NEW: klasa nie w rejestrze]';
    out.pytania = pytania.slice(0, MAX_PYTAN_MATCH);
    return out;
  }

  const progP = _progi.prog_pewnosci_klasy;
  if (typeof progP === 'number') {
    const pk = pMaxKandydatow(out);
    if (pk != null && pk < progP) {
      out.decyzja = 'NEW';
      out.pytania = pytania.slice(0, MAX_PYTAN_MATCH);
      out.uzasadnienie = String(out.uzasadnienie || '') + ' [MATCH→NEW: p=' + pk + '<prog]';
      return out;
    }
  }

  const p = aliasujParametrySzablonu(wpis.szablon_id, out.parametry || {});
  archDolaczWymiaryZdania(p, zdanie);
  const p2 = aliasujParametrySzablonu(wpis.szablon_id, p);
  Object.assign(p, p2);
  out.parametry = p;
  const bylaSprzeczka = archUsunPolaSprzeczne(p, zdanie, out, pytania);
  if (bylaSprzeczka && out.sprzeczne_pola && out.sprzeczne_pola.length) {
    out.decyzja = 'REJECT';
    out.klasa = wpis.id;
    out.pytania = pytania.slice(0, MAX_PYTAN_MATCH);
    out.uzasadnienie = String(out.uzasadnienie || '') + ' [REJECT: sprzeczne_pole]';
    return out;
  }
  if (archBrakSzablonu(wpis)) {
    out.decyzja = 'NEW';
    out.klasa = wpis.id;
    out.pytania = pytania.slice(0, MAX_PYTAN_MATCH);
    out.uzasadnienie = String(out.uzasadnienie || '') + ' [MATCH→NEW: brak_buildera]';
    return out;
  }
  const wal = walidujParametry(wpis.id, p);
  if (!wal.ok) {
    const pole = wal.brakujace_pole || wal.pole;
    if (wal.powod === 'brak_pola' && !maLiczbe(p) && !bylaSprzeczka) {
      out.decyzja = 'REJECT';
      out.pytania = pytania.slice(0, MAX_PYTAN_MATCH);
      out.uzasadnienie = String(out.uzasadnienie || '') + ' [REJECT: brak_wymiaru]';
      return out;
    }
    if (wal.powod === 'brak_pola') {
      if (pole) {
        archDodajPytanie(pytania, pytanieOPole(pole, wpis.klasa || wpis.id), pole);
        if (!out.brakujace_pola || !out.brakujace_pola.length) out.brakujace_pola = [pole];
      }
      out.decyzja = 'MATCH';
      out.klasa = wpis.id;
      out.pytania = pytania.slice(0, MAX_PYTAN_MATCH);
      out.uzasadnienie = String(out.uzasadnienie || '') + ' [MATCH: brak_pola' + (pole ? ' ' + pole : '') + ']';
      return out;
    }
    if (pole) {
      archDodajPytanie(pytania, pytanieOPole(pole, wpis.klasa || wpis.id), pole);
    }
    out.decyzja = 'REJECT';
    out.pytania = pytania.slice(0, MAX_PYTAN_MATCH);
    out.uzasadnienie = String(out.uzasadnienie || '') + ' [REJECT: ' + wal.powod + (pole ? ' ' + pole : '') + ']';
    return out;
  }

  out.klasa = wpis.id;
  out.pytania = pytania.slice(0, MAX_PYTAN_MATCH);
  return out;
}

export function tekstArchetypow() {
  const wp = _rejestr.wpisy || [];
  if (!wp.length) {
    return '======== ARCHETYPY ========\nRejestr pusty. MATCH niemożliwy — traktuj MATCH jako NEW. Nie wymyślaj klas.\n============================';
  }
  const lines = [
    '======== ARCHETYPY (wybór człowieka, nie zgaduj nowych) ========',
    'MATCH tylko gdy klasa jest na tej liście. Nie dopisuj do rejestru.'
  ];
  for (let i = 0; i < wp.length; i++) {
    const w = wp[i];
    lines.push(
      'ID ' + w.id +
      (w.klasa ? ' (' + w.klasa + ')' : '') +
      (w.szablon_id ? ' szablon=' + w.szablon_id : ' szablon=brak_buildera') +
      ' — ' + (w.opis || '')
    );
    if (w.synonimy && w.synonimy.length) lines.push('  synonimy: ' + w.synonimy.join(', '));
  }
  lines.push('================================================================');
  return lines.join('\n');
}

function eksportP2S() {
  if (typeof window === 'undefined') return;
  window.P2S = window.P2S || {};
  window.P2S.archetypy = {
    ladujRejestr, lista, get: getArchetyp, getArchetyp, walidujParametry, build, zastosujMatch,
    ustawRejestr, dopiszDoRejestru, MATCH_NIE_PISZE_DO_REJESTRU,
    tekstArchetypow, czyRejestrGotowy, MAX_PYTAN_MATCH,
    ustawProgi, ladujProgi, progiAktualne
  };
}
eksportP2S();
