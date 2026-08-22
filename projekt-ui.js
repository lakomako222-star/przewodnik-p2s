/**
 * Zakładka Projekt — rozmowa → SPEC → siatka → bramka → 3MF.
 * Prefiks id: pj*. Klucz API tylko z localStorage, nigdy w logu.
 */
import { initEngine, buildAndGate, specDiff, meshToVF, normalizujJednostki } from './builder.js';
import { mesh3MF, tekstDeklaracji, nazwa3mf } from './export3mf.js';
import { WIDOKI, rzutuj, rysuj, etykietaGabarytu } from './preview.js';

const HIST_KEY = 'p2s.projekt.historia';
const DECL_KEY = 'p2s.brief.decl';
const API = 'https://openrouter.ai/api/v1/chat/completions';

const SYS_SPEC = `Jesteś spokojnym, konkretnym doradcą technicznym przy drukarce 3D. Sprzęt użytkownika: Bambu Lab P2S Combo, AMS 2 Pro, płyta BIQU Panda CryoGrip Pro Frostbite. Odpowiadasz WYŁĄCZNIE po polsku, prostym językiem.

CO ODDAJESZ: wypełniony SPEC w formacie JSON według schematu. Nie piszesz kodu. Ani OpenSCAD, ani JavaScriptu, ani niczego, co się uruchamia.

KOLEJNOŚĆ ŹRÓDEŁ: najpierw ustalenia z rozmowy i poprzedni SPEC. Nie zgaduj krytycznego wymiaru — wpisz pytanie do pola pytania i zostaw bryly puste. Wymiar drugorzędny: przyjmij rozsądną wartość i napisz o tym w uwagi_do_druku. Pytaj o jeden brakujący wymiar.

Ze zdjęcia NIE odczytuj milimetrów ani wskazania suwmiarki — wizja tylko kształt i topologia. Wymiar podaje człowiek suwmiarką.

Poprawiasz istniejący projekt, nie zaczynasz od nowa, gdy dostaniesz poprzedni SPEC.

LUZY LICZY APLIKACJA, NIE TY

Kiedy otwór ma coś przyjąć, NIE podajesz średnicy. Podajesz:
  rola: "pasowanie", element_nominalny_mm: <wymiar tego, co wchodzi>,
  pasowanie: "ciasne" | "przesuwne" | "luzne" | "zatrzask"
Aplikacja doliczy luz z tabeli pomiarowej właściciela drukarki.
Jeżeli podasz średnicę samodzielnie, zostanie ona zignorowana.

To samo dotyczy otworów pod wkładki termiczne: podajesz gwint "M4",
nie średnicę 5,6.

CZEGO NIE UMIESZ W TEJ WERSJI

Napisy, gwinty drukowane, dowolne powierzchnie, kształty organiczne,
złożenia wieloczęściowe. Kiedy prośba tego wymaga — POWIEDZ TO WPROST
w polu uwagi_do_druku i zaproponuj obejście (kieszeń pod napis w Bambu
Studio, wkładka termiczna zamiast gwintu, podział na osobne części).
Nie udawaj, że zrobiłeś coś, czego nie ma w SPEC-u.

Jedna część naraz. Pola bryły i cech wyłącznie z zamkniętej listy schematu.
Pierwsza bryła: operacja "dodaj". Nazwy pól po polsku.`;

const SYS_TALK = SYS_SPEC.replace(
  'CO ODDAJESZ: wypełniony SPEC w formacie JSON według schematu. Nie piszesz kodu. Ani OpenSCAD, ani JavaScriptu, ani niczego, co się uruchamia.',
  'To jest rozmowa. Odpowiadasz po polsku: dopytujesz o jeden brakujący wymiar, tłumaczysz, proponujesz. Nie zwracasz JSON ani kodu — SPEC powstaje w osobnym wywołaniu.'
);

let schema = null;
let last = null;
let pytanieRundy = 0;
let engineOk = false;
let engineTried = false;

function $(id) { return document.getElementById(id); }
function get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function key() { return get('p2s.ai.key', ''); }
function model(role) {
  if (role === 'spec') return get('p2s.ai.model.code', 'openai/gpt-5.6-sol-pro');
  if (role === 'diff') return get('p2s.ai.model.json', 'openai/gpt-5.6-sol');
  return get('p2s.ai.model', 'google/gemini-3.1-pro-preview');
}

function hist() {
  try { const a = JSON.parse(get(HIST_KEY, '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function pushHist(entry) {
  const a = hist();
  a.push(entry);
  while (a.length > 20) a.shift();
  set(HIST_KEY, JSON.stringify(a));
  fillHist();
}

function fillHist() {
  const sel = $('pjHist'); if (!sel) return;
  const a = hist();
  sel.innerHTML = a.map((e, i) => '<option value="' + i + '"' + (i === a.length - 1 ? ' selected' : '') + '>v' + (i + 1) + (e.note ? ' — ' + e.note : '') + '</option>').join('')
    || '<option value="">Historia</option>';
}

function chatLine(who, text) {
  const box = $('pjChat'); if (!box) return;
  const d = document.createElement('div');
  d.className = 'pj-line ' + who;
  d.textContent = (who === 'me' ? '> ' : '< ') + text;
  box.appendChild(d);
}

function setWarn(werdykt, extra) {
  const el = $('pjWarn'); if (!el) return;
  const wp = (werdykt && werdykt.wpisy) || [];
  const all = extra ? extra.concat(wp) : wp;
  if (!all.length) { el.innerHTML = ''; return; }
  el.innerHTML = all.map(w => {
    const k = w.poziom === 'blad' ? 'pj-err' : 'pj-warn';
    return '<div class="' + k + '">' + (w.poziom === 'blad' ? '⛔ ' : '⚠ ') + escapeHtml(w.tekst || w) + '</div>';
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function rysujCztery(mesh, bbox) {
  const keys = ['izo', 'przod', 'bok', 'gora'];
  const ids = ['pjIzo', 'pjPrzod', 'pjBok', 'pjGora'];
  const lab = ['pjLabIzo', 'pjLabPrzod', 'pjLabBok', 'pjLabGora'];
  keys.forEach((k, i) => {
    const c = $(ids[i]); if (!c) return;
    const ctx = c.getContext('2d');
    rysuj(ctx, rzutuj(mesh, WIDOKI[k], c.width, c.height));
    const lb = $(lab[i]);
    if (lb) lb.textContent = WIDOKI[k].etykieta + ' · ' + etykietaGabarytu(k, bbox);
  });
  const bb = $('pjBbox');
  if (bb) bb.textContent = bbox.x.toFixed(0) + ' × ' + bbox.y.toFixed(0) + ' × ' + bbox.z.toFixed(0) + ' mm';
}

function pokazDecl(dekl, mesh) {
  const el = $('pjDecl'); if (!el) return;
  try { localStorage.setItem(DECL_KEY, JSON.stringify(dekl)); } catch (e) {}
  if (typeof window.aDeclHtml === 'function') {
    el.innerHTML = window.aDeclHtml(mesh.bbox, [{ a: { watertight: true } }]);
  } else {
    el.innerHTML = '<p>X ' + mesh.bbox.x.toFixed(2) + ' · Y ' + mesh.bbox.y.toFixed(2) + ' · Z ' + mesh.bbox.z.toFixed(2) + ' mm</p>';
  }
  const wk = (dekl.wymiary_krytyczne || []).map(w =>
    '<p>' + escapeHtml(w.nazwa) + ': ' + Number(w.wartosc_mm).toFixed(2).replace('.', ',') + ' mm</p>').join('');
  if (wk) el.innerHTML += wk;
}

function syncExport(werdykt) {
  const btn = $('pjDl3mf'), anal = $('pjAnal'), mimo = $('pjMimo');
  const ok = werdykt && werdykt.eksportOk;
  const force = mimo && mimo.checked;
  if (btn) btn.disabled = !(last && last.mesh) || (!ok && !force);
  if (anal) anal.disabled = !(last && last.mesh);
}

async function bootEngine() {
  if (engineTried) return engineOk;
  engineTried = true;
  const msg = $('pjEngineMsg');
  try {
    const r = await fetch('./engine/manifold.wasm', { method: 'HEAD' });
    if (!r.ok) throw new Error('brak wasm');
    await initEngine();
    schema = await (await fetch('./spec-v1.schema.json')).json();
    engineOk = true;
    if (msg) msg.hidden = true;
    return true;
  } catch (e) {
    engineOk = false;
    if (msg) {
      msg.hidden = false;
      msg.textContent = 'Zakładka Projekt wymaga plików silnika obok przewodnika. Reszta przewodnika działa normalnie.';
    }
    return false;
  }
}

async function orCall(body) {
  const k = key();
  if (!k) throw new Error('Brak klucza OpenRouter');
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + k,
      'Content-Type': 'application/json',
      'HTTP-Referer': location.origin || 'https://localhost',
      'X-Title': 'Przewodnik P2S Projekt'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
  const c = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!c) throw new Error('Pusta odpowiedź modelu');
  return c;
}

function parseSpec(txt) {
  const s = String(txt).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : s;
  const i = raw.indexOf('{'), j = raw.lastIndexOf('}');
  if (i < 0 || j <= i) throw new Error('Brak JSON w odpowiedzi SPEC');
  return JSON.parse(raw.slice(i, j + 1));
}

async function zbuduj(spec, note, prev) {
  const r = buildAndGate(spec);
  if (r.pytania && r.pytania.length) {
    setWarn({ wpisy: r.pytania.map(t => ({ poziom: 'ostrzezenie', kod: 'PYTANIE', tekst: t })) });
    $('pjPytanieWrap').hidden = false;
    $('pjPytanie').textContent = r.pytania[0];
    chatLine('ai', r.pytania.join(' '));
    return r;
  }
  $('pjPytanieWrap').hidden = true;
  last = r;
  if (prev) {
    const d = specDiff(prev, r.spec);
    const box = $('pjDiff');
    if (box) {
      box.hidden = false;
      const items = d.length
        ? d.map(x => '<li>' + escapeHtml(x.path) + ': ' + escapeHtml(JSON.stringify(x.from)) + ' → ' + escapeHtml(JSON.stringify(x.to)) + '</li>').join('')
        : '<li>brak zmian w polach</li>';
      box.innerHTML = '<b>Zmiany SPEC</b><ul>' + items + '</ul><p>reszta bez zmian</p>';
    }
  }
  rysujCztery(r.mesh, r.mesh.bbox);
  pokazDecl(r.deklaracja, r.mesh);
  setWarn(r.werdykt);
  syncExport(r.werdykt);
  pushHist({ spec: r.spec, deklaracja: r.deklaracja, note: note || '', when: Date.now() });
  if (r.spec.uwagi_do_druku) chatLine('ai', r.spec.uwagi_do_druku);
  return r;
}

async function zrob() {
  if (!(await bootEngine())) return;
  const raw = ($('pjIn').value || '').trim();
  if (!raw) return;
  const text = normalizujJednostki(raw);
  chatLine('me', text);
  $('pjIn').value = '';
  if (!key()) {
    chatLine('ai', 'Brak klucza API — wklej SPEC ręcznie poniżej. Budowanie, podgląd i 3MF działają offline.');
    $('pjSpec').focus();
    return;
  }
  try {
    const talk = await orCall({
      model: model('text'),
      messages: [
        { role: 'system', content: SYS_TALK },
        { role: 'user', content: text }
      ]
    });
    chatLine('ai', talk);
    const prev = last && last.spec;
    const userB = prev
      ? ('POPRZEDNI SPEC:\n' + JSON.stringify(prev) + '\n\nPROŚBA O ZMIANĘ:\n' + text +
        '\n\nZwróć CAŁY SPEC z naniesioną zmianą. Zmień WYŁĄCZNIE to, o co proszono. Każde inne pole ma zostać co do znaku identyczne.')
      : (text + '\n\nUstalenia z rozmowy:\n' + talk);
    const specTxt = await orCall({
      model: model(prev ? 'diff' : 'spec'),
      messages: [
        { role: 'system', content: SYS_SPEC },
        { role: 'user', content: userB }
      ],
      response_format: schema ? { type: 'json_schema', json_schema: { name: 'spec_v1', strict: true, schema: schema } } : { type: 'json_object' },
      reasoning: { effort: prev ? 'low' : 'high' }
    });
    await zbuduj(parseSpec(specTxt), text.slice(0, 40), prev && prev);
    pytanieRundy = 0;
  } catch (e) {
    setWarn({ wpisy: [{ poziom: 'blad', kod: 'MODEL', tekst: e.message }] });
    chatLine('ai', e.message);
  }
}

function offline() {
  const off = typeof navigator !== 'undefined' && navigator.onLine === false;
  const el = $('pjOffline');
  if (el) el.hidden = !off;
  const inp = $('pjIn'), btn = $('pjZrob');
  if (off) {
    if (inp) { inp.disabled = true; inp.placeholder = 'brak połączenia — możesz wkleić SPEC ręcznie'; }
    if (btn) btn.disabled = true;
  } else {
    if (inp) { inp.disabled = false; inp.placeholder = 'np. uchwyt na wiatrówkę na ścianę, kolba 63 mm, PETG'; }
    if (btn) btn.disabled = false;
  }
}

function bind() {
  const z = $('pjZrob'); if (z) z.addEventListener('click', zrob);
  const inp = $('pjIn');
  if (inp) inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zrob(); }
  });
  const bs = $('pjBuildSpec');
  if (bs) bs.addEventListener('click', async () => {
    if (!(await bootEngine())) return;
    try {
      const prev = last && last.spec;
      await zbuduj(JSON.parse($('pjSpec').value), 'ręczny SPEC', prev);
    } catch (e) {
      setWarn({ wpisy: [{ poziom: 'blad', kod: 'SPEC', tekst: e.message }] });
    }
  });
  const dl = $('pjDl3mf');
  if (dl) dl.addEventListener('click', async () => {
    if (!last || !last.mesh) return;
    if (!last.werdykt.eksportOk && !($('pjMimo') && $('pjMimo').checked)) return;
    if (!last.werdykt.eksportOk) {
      const powod = window.prompt('Eksport mimo błędów bramki. Zapisz powód:');
      if (!powod) return;
      pushHist({ spec: last.spec, note: 'wiem, co robię: ' + powod, when: Date.now() });
    }
    const n = hist().length || 1;
    const buf = await mesh3MF(last.mesh, { nazwa: last.spec.nazwa });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'model/3mf' }));
    a.download = nazwa3mf(last.spec, n);
    a.click();
    const t = tekstDeklaracji(last.spec, last.deklaracja, last.werdykt);
    const b = document.createElement('a');
    b.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' }));
    b.download = String(last.spec.nazwa || 'czesc') + '_v' + n + '_deklaracja.txt';
    b.click();
  });
  function toAnal() {
    if (!last || !last.mesh || typeof window.__p2sAnalLoadMesh !== 'function') {
      const pick = document.getElementById('aPick');
      const drop = document.getElementById('aDrop');
      const sz = document.getElementById('aSize');
      if (pick) pick.hidden = false;
      if (drop) drop.hidden = true;
      if (sz) sz.textContent = 'brak bryły w zakładce Projekt — najpierw Zrób';
      return false;
    }
    const vf = meshToVF(last.mesh);
    window.__p2sAnalLoadMesh(last.spec.nazwa || 'projekt', vf.V, vf.F);
    const tab = document.querySelector('#tabs .tab[data-v="tools"]');
    if (tab) tab.click();
    const t = document.getElementById('tAnal');
    if (t) t.scrollIntoView();
    return true;
  }
  const an = $('pjAnal');
  if (an) an.addEventListener('click', toAnal);
  window.__p2sProjektToAnal = toAnal;
  const mimo = $('pjMimo');
  if (mimo) mimo.addEventListener('change', () => syncExport(last && last.werdykt));
  const histSel = $('pjHist');
  if (histSel) histSel.addEventListener('change', async () => {
    const a = hist(); const i = +histSel.value;
    if (!a[i] || !a[i].spec) return;
    if (!(await bootEngine())) return;
    await zbuduj(a[i].spec, 'powrót v' + (i + 1));
  });
  const py = $('pjPytanieOk');
  if (py) py.addEventListener('click', async () => {
    const ans = ($('pjPytanieIn').value || '').trim();
    if (!ans) return;
    pytanieRundy += 1;
    $('pjIn').value = ans;
    if (pytanieRundy >= 2) chatLine('ai', 'Przyjmuję wartości domyślne po dwóch rundach pytań.');
    zrob();
  });
  const wmin = $('pjWmin');
  if (wmin) wmin.addEventListener('change', async () => {
    if (!last || !last.spec) return;
    last = buildAndGate(last.spec, { wmin: wmin.checked ? 0.42 : 0.8 });
    setWarn(last.werdykt);
    syncExport(last.werdykt);
  });
  window.addEventListener('online', offline);
  window.addEventListener('offline', offline);
  offline();
  fillHist();
}

const tabs = document.getElementById('tabs');
if (tabs) tabs.addEventListener('click', e => {
  const b = e.target.closest('.tab');
  if (b && b.dataset.v === 'projekt') bootEngine();
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
else bind();

window.__p2sProjektFromBrief = function (text) {
  const t = document.querySelector('#tabs .tab[data-v="projekt"]');
  if (t) t.click();
  const inp = $('pjIn');
  if (inp) inp.value = text;
};
