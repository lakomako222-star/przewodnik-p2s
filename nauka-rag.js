/**
 * RAG lokalny po nauka-pack.json — pamięć nazwanych części (nie esej, nie GPU).
 * Uczenie = katalog + tagi (rura/kolanko/90/fi80) + 5 najbliższych do czatu Projekt.
 * To NIE fine-tune wag / LoRA / trening GPU: folder ocen/ jest pusty.
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
  [/mechan|adapter|uchwyt|tulej|lozysk|bearing|bracket|mount|gwint|srub|nakret|klamr|zawias|gear|rur[ay]|pipe|elbow|kolanko|kolano/i, 'MECHANIKA'],
  [/dom|wieszak|organizer|kuchn|home|diy|haczyk|wiesz|polk|szuflad/i, 'DIY_HOME']
];

/** PL brief → słowa z tytułów Printables (holder, hook, …). */
const SYN = {
  uchwyt: ['holder', 'hook', 'mount', 'handle', 'bracket'],
  uchwyty: ['holder', 'hook', 'mount', 'handle'],
  haczyk: ['hook'],
  wieszak: ['hanger', 'hook'],
  wanna: ['bath', 'bathtub', 'tub'],
  wanny: ['bath', 'bathtub', 'tub'],
  zabawka: ['toy', 'toys'],
  figurka: ['figure', 'figurine', 'toy'],
  tuleja: ['bushing', 'sleeve', 'spacer'],
  klamra: ['clamp', 'clip'],
  podstawka: ['stand', 'base'],
  organizer: ['organizer', 'tray'],
  gwint: ['thread', 'screw'],
  lozysko: ['bearing'],
  nakretka: ['nut'],
  sruba: ['screw', 'bolt'],
  rura: ['pipe', 'hose', 'tube', 'elbow', 'kolanko'],
  rury: ['pipe', 'hose', 'tube'],
  kolanko: ['elbow', 'pipe', 'rura'],
  kolano: ['elbow', 'kolanko'],
  pipe: ['rura', 'elbow', 'hose'],
  elbow: ['kolanko', 'rura', 'pipe']
};

function termy(raw) {
  const parts = norm(raw).split(/[^a-z0-9]+/).filter((t) =>
    (t.length >= 3 || /^\d{2,3}$/.test(t)) && !STOP[t]
  );
  const out = [];
  const seen = {};
  function add(t) {
    if (!t || seen[t] || STOP[t]) return;
    seen[t] = 1;
    out.push(t);
  }
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    add(t);
    const syn = SYN[t];
    if (syn) for (let j = 0; j < syn.length; j++) add(syn[j]);
    const fm = t.match(/^f(\d{2,3})$/);
    if (fm) {
      add('fi' + fm[1]);
      add('dn' + fm[1]);
      add(fm[1]);
    }
    const fim = t.match(/^(fi|dn)(\d{2,3})$/);
    if (fim) {
      add('fi' + fim[2]);
      add('dn' + fim[2]);
      add(fim[2]);
    }
    if (t.length >= 5) {
      const stem = t.replace(/(es|ed|ing|ow|ach|ami)$/g, '').replace(/[yiiea]$/, '');
      if (stem.length >= 3 && stem !== t) add(stem);
    }
  }
  return out;
}

/** Brief → tagi katalogu: rura, kolanko, 90, fi80. „kąt 90” + rura = kolanko. */
export function tagiZQuery(raw) {
  const n = norm(raw);
  const parts = n.split(/[^a-z0-9]+/).filter(Boolean);
  const seen = {};
  const out = [];
  function add(t) {
    const x = String(t || '').toLowerCase();
    if (!x || seen[x]) return;
    seen[x] = 1;
    out.push(x);
  }
  const isRura = /\b(rur[ay]|pipe|pipes|hose|hoses|tube|tubing|pvc)\b/.test(n);
  const isElbow = /\b(elbow|elbows|kolanko|kolanka|kolano|fitting)\b/.test(n);
  const hasKat = /\b(kat|katem|angle|stopni|degree)\b/.test(n);
  if (isRura) {
    add('rura');
    add('pipe');
  }
  if (isElbow) {
    add('kolanko');
    add('elbow');
  }
  if (/\b90\b/.test(n) || /90\s*(deg|degree|stopni)/.test(n)) add('90');
  if (/\b45\b/.test(n) || /45\s*(deg|degree|stopni)/.test(n)) add('45');
  if (isRura && (seen['90'] || seen['45'] || hasKat)) {
    add('kolanko');
    add('elbow');
  }
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    const nxt = parts[i + 1] || '';
    if (/^(fi|dn|od|id|f)$/.test(t) && /^\d{2,3}$/.test(nxt)) {
      add('fi' + Number(nxt));
      add('dn' + Number(nxt));
      add(String(Number(nxt)));
    }
    const compact = t.match(/^(fi|dn|f)(\d{2,3})$/);
    if (compact) {
      add('fi' + Number(compact[2]));
      add('dn' + Number(compact[2]));
      add(String(Number(compact[2])));
    }
    if (/^\d{2,3}$/.test(t) && isRura && t !== '90' && t !== '45') {
      add('fi' + Number(t));
      add('dn' + Number(t));
      add(String(Number(t)));
    }
  }
  return out;
}

function tagiWpisu(w) {
  return Array.isArray(w && w.tagi) ? w.tagi : [];
}

function boostTagow(qTags, wTags) {
  if (!qTags.length || !wTags.length) return 0;
  let sc = 0;
  let hits = 0;
  const set = {};
  for (let i = 0; i < wTags.length; i++) set[wTags[i]] = 1;
  for (let i = 0; i < qTags.length; i++) {
    const t = qTags[i];
    if (!set[t]) continue;
    hits += 1;
    if (/^(fi|dn)\d{2,3}$/.test(t)) sc += 0.85;
    else if (t === 'kolanko' || t === 'elbow' || t === 'rura' || t === 'pipe') sc += 0.55;
    else if (t === '90' || t === '45') sc += 0.50;
    else sc += 0.22;
  }
  if (hits >= 2) sc += 0.40;
  if (hits >= 3) sc += 0.30;
  return sc;
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
    w.opis_krotki, w.opis_printables, w.co_to_jest, w.opis_z_pliku,
    Array.isArray(w.nazwy_czesci) ? w.nazwy_czesci.join(' ') : '',
    w.format, slowa
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
          id: h.id,
          tytul: h.tytul_czytelny || h.nazwa || h.id,
          kategoria: h.kategoria || '',
          sylwetka: h.sylwetka || '',
          gabaryt: h.gabaryt || '',
          n_czesci: h.n_czesci,
          tagi: Array.isArray(h.tagi) ? h.tagi.slice(0, 8) : [],
          co_to_jest: (h.co_to_jest || h.opis_z_pliku || '').slice(0, 160)
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

export function ustawPackNauki(pack) {
  _pack = pack && typeof pack === 'object' ? pack : { wersja: 0, wpisy: [], n: 0 };
  _powod = Array.isArray(_pack.wpisy) && _pack.wpisy.length ? 'ok' : 'brak';
  return _pack;
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
  const qTags = tagiZQuery(query);
  const lim = limit == null ? 5 : limit;
  if (!q.length && !qTags.length) return [];
  const katHint = katZQuery(query);
  const scored = [];
  for (let i = 0; i < _pack.wpisy.length; i++) {
    const w = _pack.wpisy[i];
    if (!hitBezpieczny(w)) continue;
    const wTags = tagiWpisu(w);
    let sc = 0;
    sc += 1.15 * score(q, w.tytul_czytelny);
    sc += 1.10 * score(q, w.tytul_printables);
    sc += 0.95 * score(q, w.kategoria);
    sc += 0.90 * score(q, w.folder_projektu);
    sc += 1.20 * score(q, w.co_to_jest);
    sc += 1.18 * score(q, w.opis_z_pliku);
    sc += 1.12 * score(q, Array.isArray(w.nazwy_czesci) ? w.nazwy_czesci.join(' ') : '');
    sc += 0.80 * score(q, w.opis_krotki);
    sc += 0.75 * score(q, w.opis_printables);
    sc += 0.85 * score(q, Array.isArray(w.slowa_kluczowe) ? w.slowa_kluczowe.join(' ') : '');
    sc += 1.25 * score(q, wTags.join(' '));
    sc += 0.55 * score(q, poleKatalogu(w));
    sc += boostTagow(qTags, wTags);
    if (sc <= 0) continue;
    if (katHint && String(w.kategoria || '').toUpperCase() === katHint) sc += 0.22;
    if (w.rola === 'wzorzec') sc += 0.28;
    else sc *= 0.55;
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

export function tekstKontekstuNauki(hits, zapytanie, _szablonyTekst) {
  if (!hits || !hits.length) return (_szablonyTekst || '');
  const x = bitCzysty(zapytanie).replace(/\s+/g, ' ').slice(0, 80) || 'tej rzeczy';
  const qTags = tagiZQuery(zapytanie);
  const ksztaltQ = qTags.some((t) =>
    t === 'rura' || t === 'pipe' || t === 'kolanko' || t === 'elbow' ||
    /^(fi|dn)\d{2,3}$/.test(t)
  );
  const lines = [];
  const pamiec = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    if (!hitBezpieczny(h)) continue;
    const wTags = tagiWpisu(h);
    const overlap = qTags.filter((t) => wTags.indexOf(t) >= 0);
    if (overlap.length || ksztaltQ) {
      const tyt = bitCzysty(h.tytul_czytelny || h.nazwa) || h.id;
      const gab = bitCzysty(h.gabaryt) || 'gabaryt nieznany';
      const tagBit = overlap.length ? ' tagi ' + overlap.join(', ') : '';
      pamiec.push(
        'PAMIĘĆ KATALOGU: już widziałeś podobne: ' + (h.id || '?') +
        ' «' + tyt + '» gabaryt ' + gab + tagBit +
        (bitCzysty(h.co_to_jest || h.opis_z_pliku)
          ? ' — ' + bitCzysty(h.co_to_jest || h.opis_z_pliku).slice(0, 180)
          : '') +
        ' — tak to było zrobione. Nie zgaduj od zera.'
      );
    }
  }
  if (pamiec.length) {
    lines.push('======== PAMIĘĆ KATALOGU (NAZWANE CZĘŚCI, NIE ESEJ, NIE TRENING GPU) ========');
    lines.push('Już oglądałeś i indeksowałeś te wzorce. Przypomnij sobie konkret, nie zgaduj od zera.');
    const y0 = hits.find(hitBezpieczny);
    if (y0) {
      lines.push(
        'Ćwiczył ten katalog: gdy ktoś prosi o ' + x + ', masz wzorzec ' +
        (y0.id || '?') + ' (już widziany).'
      );
    }
    const cw = _pack && _pack.cwicz;
    if (cw && cw.n) {
      lines.push(
        'Ćwiczenie offline: ' + cw.self_hit + '/' + cw.n +
        ' (' + cw.self_hit_pct + '%) self-hit@5 — katalog przypomina siebie. Wagi LLM bez zmian.'
      );
    }
    for (let i = 0; i < pamiec.length; i++) lines.push(pamiec[i]);
    lines.push('==========================================================================');
  }
  lines.push(
    'BAZA NAUKI — Katalog wzorców (posegregowane DOBRE modele). Użyj podobnych jako odniesienia jak ma wyglądać: ' + x + '.'
  );
  lines.push(
    'To zamknięty katalog lokalny (pamięć nazw + tagów w PWA), nie fine-tune wag ani trening GPU. Naśladuj strukturę i funkcję najbliższych trafień — części FDM podobne do tych nazw. Nie kopiuj CAD. Nie odmawiaj rysowania dlatego, że detektor nie zmierzył otworu (BLAD_POMIARU to dziura pomiaru, nie werdykt „zły model”). Folder ocen/ jest pusty: brak par rozmowa→SPEC do LoRA.'
  );
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    if (!hitBezpieczny(h)) continue;
    const bits = [
      bitCzysty(h.id),
      bitCzysty(h.tytul_czytelny || h.nazwa),
      h.rola === 'wzorzec' ? 'rola=wzorzec' : '',
      bitCzysty(h.kategoria),
      Array.isArray(h.tagi) && h.tagi.length ? 'tagi=' + h.tagi.join(',') : '',
      bitCzysty(h.co_to_jest || h.opis_z_pliku),
      Array.isArray(h.nazwy_czesci) && h.nazwy_czesci.length ? 'części=' + h.nazwy_czesci.join(',') : '',
      bitCzysty(h.sylwetka),
      bitCzysty(h.gabaryt),
      h.n_czesci != null ? (h.n_czesci + ' części') : '',
      bitCzysty(h.opis_krotki || h.opis_printables)
    ].filter(Boolean);
    lines.push('- ' + bits.join(' | '));
  }
  if (_szablonyTekst) lines.push('\n' + _szablonyTekst);
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
    ostatnie_q: _ostatnieQ,
    cwicz: (_pack && _pack.cwicz) || null
  };
}

export function naukaRagOstatnie() {
  return {
    query: _ostatnieQ,
    hits: _ostatnie.slice(),
    stan: naukaRagStan()
  };
}
