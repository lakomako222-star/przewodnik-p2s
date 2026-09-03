/**
 * RAG lokalny po nauka-pack.json — zamknięty katalog wzorców w PWA.
 * Uczenie = katalog + wyszukanie 5 najbliższych do czatu Projekt (dowolny model z ⚙).
 * To NIE fine-tune wag / LoRA: folder ocen/ jest pusty, brak par rozmowa→SPEC.
 * Zero sieci przy wyszukiwaniu. Brak packa = puste trafienia. Nigdy nie wstrzykuj „odrzucony”.
 */
'use strict';

let _pack = null;
let _laduje = null;
let _powod = 'brak';
let _ostatnie = [];
let _ostatnieQ = '';

function norm(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l').replace(/ń/g, 'n')
    .replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
}

const STOP = {
  jaki: 1, jaka: 1, jakie: 1, jak: 1, do: 1, na: 1, w: 1, z: 1, i: 1, o: 1, a: 1,
  od: 1, po: 1, za: 1, czy: 1, ten: 1, ta: 1, to: 1, the: 1, for: 1, of: 1,
  and: 1, or: 1, zrob: 1, mi: 1, sie: 1, mnie: 1, prosze: 1, moze: 1, taki: 1,
  make: 1, want: 1, with: 1, that: 1, this: 1
};

/** Hasło użytkownika → kategoria katalogu (MECHANIKA / TOYS / DIY_HOME). */
const KAT_ALIAS = [
  [/zabawk|figur|pionek|sorter|toy|doll|chess|puzzle|gracz/i, 'TOYS'],
  [/mechan|adapter|uchwyt|tulej|lozysk|bearing|bracket|mount|gwint|srub|nakret|klamr|zawias|gear/i, 'MECHANIKA'],
  [/dom|wieszak|organizer|kuchn|home|diy|haczyk|wiesz|polk|szuflad/i, 'DIY_HOME']
];

function termy(raw) {
  const parts = norm(raw).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP[t]);
  const out = [];
  const seen = {};
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    if (seen[t]) continue;
    seen[t] = 1;
    out.push(t);
    if (t.length >= 5) {
      const stem = t.replace(/(es|ed|ing|ow|ach|ami)$/g, '').replace(/[yiiea]$/, '');
      if (stem.length >= 3 && stem !== t && !seen[stem] && !STOP[stem]) {
        seen[stem] = 1;
        out.push(stem);
      }
    }
  }
  return out;
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

function maOdrzut(s) {
  return /odrzuc/i.test(String(s == null ? '' : s));
}

function hitBezpieczny(w) {
  if (!w) return false;
  return !maOdrzut(w.tytul_czytelny) && !maOdrzut(w.tytul_printables)
    && !maOdrzut(w.opis_krotki) && !maOdrzut(w.sylwetka);
}

function poleKatalogu(w) {
  if (w.tekst_katalogu) return w.tekst_katalogu;
  const slowa = Array.isArray(w.slowa_kluczowe) ? w.slowa_kluczowe.join(' ') : '';
  return [
    w.tytul_czytelny, w.tytul_printables, w.kategoria, w.folder_projektu,
    w.opis_krotki, w.opis_printables, w.format, slowa
  ].filter(Boolean).join(' | ');
}

function katZQuery(raw) {
  const s = String(raw || '');
  for (let i = 0; i < KAT_ALIAS.length; i++) {
    if (KAT_ALIAS[i][0].test(s)) return KAT_ALIAS[i][1];
  }
  return null;
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

function zapiszOstatnie(query, hits) {
  _ostatnie = hits || [];
  _ostatnieQ = String(query || '');
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('p2s.nauka.rag.ostatnie', JSON.stringify({
        query: _ostatnieQ.slice(0, 120),
        when: Date.now(),
        hits: _ostatnie.map((h) => ({
          tytul: h.tytul_czytelny || h.nazwa || h.id,
          kategoria: h.kategoria || '',
          sylwetka: h.sylwetka || '',
          gabaryt: h.gabaryt || '',
          n_czesci: h.n_czesci
        }))
      }));
    }
  } catch (e) { /* ignore */ }
  try {
    if (typeof document !== 'undefined' && document.dispatchEvent) {
      document.dispatchEvent(new CustomEvent('p2s-nauka-rag', {
        detail: { query: _ostatnieQ, n: _ostatnie.length }
      }));
    }
  } catch (e) { /* ignore */ }
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
  const lim = limit == null ? 5 : limit;
  if (!q.length) return [];
  const katHint = katZQuery(query);
  const scored = [];
  for (let i = 0; i < _pack.wpisy.length; i++) {
    const w = _pack.wpisy[i];
    if (!hitBezpieczny(w)) continue;
    let sc = 0;
    sc += 1.15 * score(q, w.tytul_czytelny);
    sc += 1.10 * score(q, w.tytul_printables);
    sc += 0.95 * score(q, w.kategoria);
    sc += 0.90 * score(q, w.folder_projektu);
    sc += 0.80 * score(q, w.opis_krotki);
    sc += 0.75 * score(q, w.opis_printables);
    sc += 0.85 * score(q, Array.isArray(w.slowa_kluczowe) ? w.slowa_kluczowe.join(' ') : '');
    sc += 0.55 * score(q, poleKatalogu(w));
    if (katHint && String(w.kategoria || '').toUpperCase() === katHint) sc += 0.22;
    if (w.rola === 'wzorzec') sc += 0.28;
    else sc *= 0.55;
    if (sc <= 0) continue;
    scored.push({ sc, w });
  }
  scored.sort((a, b) => b.sc - a.sc);
  const hits = scored.slice(0, lim).map((x) => x.w);
  zapiszOstatnie(query, hits);
  return hits;
}

export async function szukajNauki(query, limit) {
  await ladujPackNauki(false);
  return szukajNaukiSync(query, limit);
}

function bitCzysty(s) {
  const t = String(s == null ? '' : s).trim();
  if (!t || maOdrzut(t)) return '';
  return t;
}

export function tekstKontekstuNauki(hits, zapytanie) {
  if (!hits || !hits.length) return '';
  const x = bitCzysty(zapytanie).replace(/\s+/g, ' ').slice(0, 80) || 'tej rzeczy';
  const lines = [
    'BAZA NAUKI — Katalog wzorców (posegregowane DOBRE modele). Użyj podobnych jako odniesienia jak ma wyglądać: ' + x + '.',
    'To zamknięty katalog lokalny (RAG w PWA), nie fine-tune wag. Naśladuj strukturę i funkcję najbliższych trafień — części FDM podobne do tych nazw. Nie kopiuj CAD. Nie odmawiaj rysowania dlatego, że detektor nie zmierzył otworu (BLAD_POMIARU to dziura pomiaru, nie werdykt „zły model”). Folder ocen/ jest pusty: brak par rozmowa→SPEC do LoRA.'
  ];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    if (!hitBezpieczny(h)) continue;
    const bits = [
      bitCzysty(h.tytul_czytelny || h.nazwa),
      h.rola === 'wzorzec' ? 'rola=wzorzec' : '',
      bitCzysty(h.kategoria),
      bitCzysty(h.sylwetka),
      bitCzysty(h.gabaryt),
      h.n_czesci != null ? (h.n_czesci + ' części') : '',
      bitCzysty(h.opis_krotki || h.opis_printables)
    ].filter(Boolean);
    lines.push('- ' + bits.join(' | '));
  }
  return lines.join('\n');
}

export function naukaRagStan() {
  const wp = (_pack && _pack.wpisy) || [];
  const kat = {};
  let wz = 0;
  for (let i = 0; i < wp.length; i++) {
    const w = wp[i];
    if (w.rola === 'wzorzec' || /^(LIB|TRE|GOLD)-/.test(String(w.id || ''))) wz += 1;
    const k = String(w.kategoria || '?');
    kat[k] = (kat[k] || 0) + 1;
  }
  return {
    powod: _powod,
    n: (_pack && _pack.n) || wp.length || 0,
    wzorce: wz,
    kategorie: Object.keys(kat).length,
    kategorie_liczby: kat,
    ostatnie_n: _ostatnie.length,
    ostatnie_q: _ostatnieQ
  };
}

export function naukaRagOstatnie() {
  return {
    query: _ostatnieQ,
    hits: _ostatnie.slice(),
    stan: naukaRagStan()
  };
}
