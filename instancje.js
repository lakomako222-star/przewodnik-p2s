/**
 * Pamięć instancji Projekt/Przerób — IndexedDB, fallback localStorage.
 * Zapis TYLKO po akceptacji 4 rzutów (#pjAkceptuj / #prAkceptuj).
 */
import { tagiZQuery } from './nauka-rag.js';

const DB_NAME = 'p2s-instancje';
const STORE = 'instancje';
const LS_KEY = 'p2s.instancje.ls';
const LS_LIMIT = 20;
const JPEG_MAX_B = 40000;

function lsGet() {
  try {
    const a = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch (e) {
    return [];
  }
}

function lsSet(a) {
  localStorage.setItem(LS_KEY, JSON.stringify(a));
}

function nowyId(when) {
  return 'inst-' + (when || Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
}

/** Szacunek bajtów z dataURL; cel ~40 kB JPEG. */
export function jpegZCanvas(canvas, maxB) {
  const limit = maxB == null ? JPEG_MAX_B : maxB;
  if (!canvas || typeof canvas.toDataURL !== 'function') return '';
  let q = 0.7;
  let url = '';
  try { url = canvas.toDataURL('image/jpeg', q); } catch (e) { return ''; }
  function bajty(u) {
    const i = String(u).indexOf(',');
    const b64 = i >= 0 ? String(u).slice(i + 1) : String(u);
    return Math.floor(b64.length * 0.75);
  }
  while (url && bajty(url) > limit && q > 0.35) {
    q = Math.round((q - 0.1) * 10) / 10;
    try { url = canvas.toDataURL('image/jpeg', q); } catch (e2) { break; }
  }
  if (url && bajty(url) > limit * 1.2) {
    try {
      const c2 = document.createElement('canvas');
      const w = Math.max(80, Math.round((canvas.width || 280) * 0.55));
      const h = Math.max(60, Math.round((canvas.height || 200) * 0.55));
      c2.width = w;
      c2.height = h;
      const ctx = c2.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, 0, w, h);
        url = c2.toDataURL('image/jpeg', 0.55);
      }
    } catch (e3) { /* zostaw poprzedni */ }
  }
  return url || '';
}

function tokenyQuery(query) {
  const raw = String(query || '');
  let tags = [];
  try {
    if (typeof tagiZQuery === 'function') tags = tagiZQuery(raw) || [];
  } catch (e) { tags = []; }
  const n = raw.toLowerCase()
    .replace(/ł/g, 'l').replace(/ó/g, 'o').replace(/ą/g, 'a').replace(/ę/g, 'e')
    .replace(/ś/g, 's').replace(/ć/g, 'c').replace(/ń/g, 'n').replace(/[żź]/g, 'z');
  const parts = n.split(/[^a-z0-9]+/).filter(function (t) { return t.length >= 2; });
  const seen = {};
  const out = [];
  function add(t) {
    const x = String(t || '').toLowerCase();
    if (!x || seen[x]) return;
    seen[x] = 1;
    out.push(x);
  }
  for (let i = 0; i < tags.length; i++) add(tags[i]);
  for (let i = 0; i < parts.length; i++) add(parts[i]);
  return out;
}

function blobRekordu(rec) {
  return [
    rec && rec.zdanie,
    rec && rec.klasa,
    rec && rec.decyzja,
    rec && rec.parametry && JSON.stringify(rec.parametry)
  ].filter(Boolean).join(' ');
}

export function szukajWLiscie(rekordy, query, k) {
  const ile = k == null ? 5 : k;
  const q = tokenyQuery(query);
  const lista = Array.isArray(rekordy) ? rekordy : [];
  if (!q.length) {
    return lista.slice().sort(function (a, b) {
      return (b.when || 0) - (a.when || 0);
    }).slice(0, ile);
  }
  const scored = lista.map(function (rec) {
    const blob = blobRekordu(rec).toLowerCase()
      .replace(/ł/g, 'l').replace(/ó/g, 'o').replace(/ą/g, 'a').replace(/ę/g, 'e')
      .replace(/ś/g, 's').replace(/ć/g, 'c').replace(/ń/g, 'n').replace(/[żź]/g, 'z');
    let hits = 0;
    for (let i = 0; i < q.length; i++) {
      if (blob.indexOf(q[i]) >= 0) hits += 1;
    }
    return { rec: rec, score: hits };
  }).filter(function (x) { return x.score > 0; })
    .sort(function (a, b) {
      return b.score - a.score || (b.rec.when || 0) - (a.rec.when || 0);
    });
  return scored.slice(0, ile).map(function (x) { return x.rec; });
}

function openDb() {
  return new Promise(function (resolve, reject) {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IDB_BRAK'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = function () { reject(req.error || new Error('IDB_OPEN')); };
    req.onupgradeneeded = function (ev) {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('when', 'when', { unique: false });
        os.createIndex('klasa', 'klasa', { unique: false });
        os.createIndex('decyzja', 'decyzja', { unique: false });
      }
    };
    req.onsuccess = function () { resolve(req.result); };
  });
}

function idbGetAll(db) {
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(STORE, 'readonly');
    const os = tx.objectStore(STORE);
    if (typeof os.getAll === 'function') {
      const r = os.getAll();
      r.onsuccess = function () { resolve(r.result || []); };
      r.onerror = function () { reject(r.error); };
      return;
    }
    const out = [];
    const c = os.openCursor();
    c.onsuccess = function (ev) {
      const cur = ev.target.result;
      if (cur) { out.push(cur.value); cur.continue(); }
      else resolve(out);
    };
    c.onerror = function () { reject(c.error); };
  });
}

function idbPut(db, rec) {
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    const r = os.put(rec);
    r.onsuccess = function () { resolve(rec); };
    r.onerror = function () { reject(r.error); };
  });
}

let _komunikatFallback = '';

export function komunikatInstancji() {
  return _komunikatFallback;
}

function ustawKomunikat(t) {
  _komunikatFallback = t || '';
}

function recNorm(wej, extra) {
  extra = extra || {};
  const when = wej && wej.when != null ? wej.when : Date.now();
  const rec = {
    id: (wej && wej.id) || nowyId(when),
    when: when,
    zdanie: (wej && wej.zdanie) || extra.zdanie || '',
    decyzja: (wej && wej.decyzja) || extra.decyzja || 'NEW',
    klasa: (wej && wej.klasa) || extra.klasa || '',
    parametry: (wej && wej.parametry) || extra.parametry || {},
    spec: (wej && wej.spec) || extra.spec || null,
    bramka: (wej && wej.bramka) || extra.bramka || { eksportOk: false, wpisy: [], iteracje: 0 },
    render_png: (wej && wej.render_png) || extra.render_png || '',
    wersja_app: (wej && wej.wersja_app) || extra.wersja_app || '',
    mimo: !!(wej && wej.mimo) || !!extra.mimo
  };
  return rec;
}

export async function zapiszInstancje(wej, extra) {
  const rec = recNorm(wej, extra);
  ustawKomunikat('');
  try {
    const db = await openDb();
    await idbPut(db, rec);
    try { db.close(); } catch (e0) {}
    return { ok: true, id: rec.id, fallback: false, rec: rec };
  } catch (e) {
    const msg = 'IndexedDB niedostępne (WebView?) — zapisuję instancję w localStorage, limit '
      + LS_LIMIT + '.';
    ustawKomunikat(msg);
    try {
      const a = lsGet();
      a.push(rec);
      while (a.length > LS_LIMIT) a.shift();
      lsSet(a);
      return { ok: true, id: rec.id, fallback: true, komunikat: msg, rec: rec };
    } catch (e2) {
      const fail = 'Nie zapisałem instancji (IDB i localStorage padły).';
      ustawKomunikat(fail);
      return { ok: false, fallback: true, komunikat: fail };
    }
  }
}

export async function wszystkieInstancje() {
  try {
    const db = await openDb();
    const all = await idbGetAll(db);
    try { db.close(); } catch (e0) {}
    return all || [];
  } catch (e) {
    return lsGet();
  }
}

export async function szukajInstancji(query, k) {
  const all = await wszystkieInstancje();
  return szukajWLiscie(all, query, k);
}

export async function eksportInstancjiJSONL() {
  const all = await wszystkieInstancje();
  return all.map(function (r) { return JSON.stringify(r); }).join('\n') + (all.length ? '\n' : '');
}

export async function importInstancji(jsonl) {
  const text = String(jsonl || '');
  const linie = text.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  let n = 0;
  const bledy = [];
  for (let i = 0; i < linie.length; i++) {
    try {
      const obj = JSON.parse(linie[i]);
      const out = await zapiszInstancje(obj);
      if (out && out.ok) n += 1;
      else bledy.push('wiersz ' + (i + 1));
    } catch (e) {
      bledy.push('wiersz ' + (i + 1) + ': ' + String((e && e.message) || e).slice(0, 80));
    }
  }
  return { ok: bledy.length === 0, n: n, bledy: bledy };
}

if (typeof window !== 'undefined') {
  window.P2S = window.P2S || {};
  Object.assign(window.P2S, {
    zapiszInstancje: zapiszInstancje,
    szukajInstancji: szukajInstancji,
    szukajWLiscie: szukajWLiscie,
    eksportInstancjiJSONL: eksportInstancjiJSONL,
    importInstancji: importInstancji,
    jpegZCanvas: jpegZCanvas,
    komunikatInstancji: komunikatInstancji,
    wszystkieInstancje: wszystkieInstancje
  });
}
