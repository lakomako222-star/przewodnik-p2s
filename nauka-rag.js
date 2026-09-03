/**
 * RAG lokalny po nauka-pack.json (pomiary + oceny właściciela).
 * Zero sieci przy wyszukiwaniu. Brak packa = puste trafienia.
 */
'use strict';

let _pack = null;
let _laduje = null;
let _powod = 'brak';

function norm(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l').replace(/ń/g, 'n')
    .replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
}

const STOP = {
  jaki: 1, jaka: 1, jakie: 1, jak: 1, do: 1, na: 1, w: 1, z: 1, i: 1, o: 1, a: 1,
  od: 1, po: 1, za: 1, czy: 1, ten: 1, ta: 1, to: 1, the: 1, for: 1, of: 1,
  and: 1, or: 1, zrob: 1, mi: 1, sie: 1, mnie: 1
};

function termy(raw) {
  return norm(raw).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP[t]);
}

function score(queryTerms, tekst) {
  if (!queryTerms.length || !tekst) return 0;
  const hay = norm(tekst);
  let s = 0;
  for (let i = 0; i < queryTerms.length; i++) {
    if (hay.indexOf(queryTerms[i]) >= 0) s += 1;
  }
  return s / queryTerms.length;
}

function urlPack() {
  try {
    if (typeof document !== 'undefined') {
      const scripts = document.getElementsByTagName('script');
      for (let i = scripts.length - 1; i >= 0; i--) {
        const src = scripts[i].src || '';
        if (/projekt-ui\.js(\?|$)/.test(src) || /nauka-rag\.js(\?|$)/.test(src)) {
          return src.replace(/[^/]+\.js(\?.*)?$/, 'nauka-pack.json');
        }
      }
    }
  } catch (e) { /* ignore */ }
  return './nauka-pack.json';
}

export async function ladujPackNauki(force) {
  if (_pack && !force) return _pack;
  if (_laduje && !force) return _laduje;
  _laduje = (async () => {
    try {
      const r = await fetch(urlPack(), { cache: 'no-store' });
      if (!r.ok) {
        _powod = 'http_' + r.status;
        _pack = { wersja: 0, wpisy: [], n: 0 };
        return _pack;
      }
      _pack = await r.json();
      _powod = 'ok';
      return _pack;
    } catch (e) {
      _powod = (e && e.message) || 'fetch';
      _pack = { wersja: 0, wpisy: [], n: 0 };
      return _pack;
    } finally {
      _laduje = null;
    }
  })();
  return _laduje;
}

export function szukajNaukiSync(query, limit) {
  if (!_pack || !Array.isArray(_pack.wpisy) || !_pack.wpisy.length) return [];
  const q = termy(query);
  if (!q.length) return [];
  const lim = limit == null ? 5 : limit;
  const scored = [];
  for (let i = 0; i < _pack.wpisy.length; i++) {
    const w = _pack.wpisy[i];
    let sc = score(q, w.tekst);
    if (w.notatka) sc += 0.15 * score(q, w.notatka);
    if (w.tytul_czytelny) sc += 0.2 * score(q, w.tytul_czytelny);
    if (w.opis_printables) sc += 0.15 * score(q, w.opis_printables);
    if (w.rola === 'wzorzec') sc += 0.08;
    if (sc <= 0) continue;
    scored.push({ sc, w });
  }
  scored.sort((a, b) => b.sc - a.sc);
  return scored.slice(0, lim).map((x) => x.w);
}

export async function szukajNauki(query, limit) {
  await ladujPackNauki(false);
  return szukajNaukiSync(query, limit);
}

export function tekstKontekstuNauki(hits) {
  if (!hits || !hits.length) return '';
  const lines = [
    'BAZA NAUKI (wzorce): folder trening + LIB/TRE/GOLD to POSSEGREGOWANE DOBRE przykłady. Każdy model jest dobry. Tytuł, kategoria i opis mówią, co to jest — ucz się kształtu i funkcji. Kod BLAD_POMIARU / FAIL harnessu to dziura detektora (nie zmierzył walca), NIE werdykt że 3MF jest zły. NIE kopiuj cudzego CAD. NIE powielaj odmowy pomiaru jako „zły model”.'
  ];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const bits = [
      h.id,
      h.rola === 'wzorzec' ? 'rola=wzorzec' : (h.rola ? ('rola=' + h.rola) : ''),
      h.tytul_czytelny || h.nazwa || '',
      h.kategoria || '',
      h.gabaryt || '',
      h.n_czesci != null ? (h.n_czesci + ' części') : '',
      h.opis_printables ? ('opis: ' + h.opis_printables) : '',
      h.powod_po_ludzku ? h.powod_po_ludzku : '',
      h.przerob_odmowy ? ('detektor=' + h.przerob_odmowy + ' (dziura pomiaru, nie wada modelu)') : '',
      h.notatka ? ('notatka: ' + h.notatka) : ''
    ].filter(Boolean);
    lines.push('- ' + bits.join(' | '));
  }
  return lines.join('\n');
}

export function naukaRagStan() {
  return { powod: _powod, n: (_pack && _pack.n) || (_pack && _pack.wpisy && _pack.wpisy.length) || 0 };
}
