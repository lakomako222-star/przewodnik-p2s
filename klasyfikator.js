/**
 * Jedno wywołanie OpenRouter json_schema — ten sam orCall co Projekt (nie nowy klient HTTP).
 * MATCH: rejestr pusty → NEW. Rejestr niepusty → walidujParametry; brak_pola + liczba → MATCH+pytanie.
 * MATCH nigdy nie dopisuje do rejestru (archetypy.dopiszDoRejestru rzuca).
 */
import { szukajInstancji } from './instancje.js';
import { ladujRejestr, ladujProgi, lista, zastosujMatch, tekstArchetypow } from './archetypy.js';

export const SYS_KLAS = `Jesteś klasyfikatorem zleceń druku 3D na Bambu Lab P2S. Tylko polski. Nie piszesz kodu ani SPEC.

Oddaj JSON według schematu. decyzja:
- NEW — nowa część z opisu (domyślna, gdy nie ma archetypu).
- REMIX — człowiek ma już plik STL/3MF i chce zmianę wymiaru/cechy na istniejącym modelu.
- REJECT — za mało danych albo to nie jest zlecenie części; wtedy pytania (max 3).
- MATCH — tylko gdy w kontekście jest archetyp o tej samej klasie (id/synonim z listy). Bez archetypów NIE wybieraj MATCH (zostanie NEW).

klasa: krótki identyfikator (np. haczyk, tuleja, ociekacz) albo pusty string.
kandydaci: max 3 {klasa, p} z p w 0..1.
parametry: znane mm — srednica_mm (wewnętrzna/nominalna), srednica_zewn_mm, dlugosc_mm, wysokosc_mm, szerokosc_mm, grubosc_mm; x/y/z_mm tylko dla pudełek/płyt. kat — kąt gięcia w stopniach (kolanko, stojak); fi1/fi2 — średnica wejścia/wyjścia (redukcja); fiDol — średnica dolna/rurki (lejek, doniczka stożek); n — liczba haków/przegród/otworów (liczba całkowita); fiGniazda — gniazdo świecy; fiOtw — otwór w tarczy/kole; fiTrzpienia + podstawa — uchwyt szpuli; szpikulec — etykieta roślin. srednica_zewn_mm tylko gdy zdanie mówi wprost „zewnętrzna”.
pytania: max 3, tylko przy REJECT.
uzasadnienie: jedno–dwa zdania.`;

export const PROGI_KLASYFIKATORA_DOMYSLNE = {
  prog_pewnosci_klasy: null,
  prog_dystansu_do_wszystkich: null,
  when: null,
  notatka: 'Faza D ustali na 100 zdaniach'
};

export const SCHEMAT_KLASYFIKATORA = {
  type: 'object',
  additionalProperties: false,
  required: ['decyzja', 'klasa', 'kandydaci', 'parametry', 'pytania', 'uzasadnienie'],
  properties: {
    decyzja: { type: 'string', enum: ['MATCH', 'REMIX', 'NEW', 'REJECT'] },
    klasa: { type: 'string' },
    kandydaci: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['klasa', 'p'],
        properties: {
          klasa: { type: 'string' },
          p: { type: 'number' }
        }
      }
    },
    parametry: {
      type: 'object',
      additionalProperties: false,
      properties: {
        srednica_mm: { type: ['number', 'null'] },
        srednica_zewn_mm: { type: ['number', 'null'] },
        srednica_wewn_mm: { type: ['number', 'null'] },
        wysokosc_mm: { type: ['number', 'null'] },
        szerokosc_mm: { type: ['number', 'null'] },
        x_mm: { type: ['number', 'null'] },
        y_mm: { type: ['number', 'null'] },
        z_mm: { type: ['number', 'null'] },
        grubosc_mm: { type: ['number', 'null'] },
        dlugosc_mm: { type: ['number', 'null'] },
        fi: { type: ['number', 'null'] },
        fiZ: { type: ['number', 'null'] },
        fi1: { type: ['number', 'null'] },
        fi2: { type: ['number', 'null'] },
        kat: { type: ['number', 'null'] },
        grub: { type: ['number', 'null'] },
        dl: { type: ['number', 'null'] },
        w: { type: ['number', 'null'] },
        h: { type: ['number', 'null'] },
        n: { type: ['number', 'null'] },
        fiDol: { type: ['number', 'null'] },
        fiGniazda: { type: ['number', 'null'] },
        fiOtw: { type: ['number', 'null'] },
        fiTrzpienia: { type: ['number', 'null'] },
        podstawa: { type: ['number', 'null'] },
        szpikulec: { type: ['number', 'null'] },
        gl: { type: ['number', 'null'] },
        gniazdo: { type: ['number', 'null'] },
        otwor: { type: ['number', 'null'] },
        szczelina: { type: ['number', 'null'] },
        nx: { type: ['number', 'null'] },
        ny: { type: ['number', 'null'] },
        hU: { type: ['number', 'null'] },
        a: { type: ['number', 'null'] },
        b: { type: ['number', 'null'] },
        x: { type: ['number', 'null'] },
        y: { type: ['number', 'null'] },
        z: { type: ['number', 'null'] }
      }
    },
    pytania: { type: 'array', maxItems: 3, items: { type: 'string' } },
    uzasadnienie: { type: 'string' }
  }
};

function parsujJsonModelu(txt) {
  const s = String(txt || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : s;
  const i = raw.indexOf('{');
  const j = raw.lastIndexOf('}');
  if (i < 0 || j <= i) throw new Error('Brak JSON w odpowiedzi klasyfikatora');
  return JSON.parse(raw.slice(i, j + 1));
}

function fewShotTekst(instancje, archetypy) {
  const linie = [];
  const inst = instancje || [];
  for (let i = 0; i < inst.length; i++) {
    const r = inst[i];
    linie.push('- instancja ' + (r.decyzja || '') + ' klasa=' + (r.klasa || '?')
      + ' „' + String(r.zdanie || '').slice(0, 120) + '”');
  }
  const arch = archetypy || [];
  for (let i = 0; i < arch.length; i++) {
    const a = arch[i];
    linie.push('- archetyp klasa=' + (a.klasa || a.id || '?') + ' '
      + String(a.opis || a.uzasadnienie || '').slice(0, 160));
  }
  return linie.length ? ('Kontekst (few-shot):\n' + linie.join('\n')) : 'Kontekst: brak instancji i archetypów.';
}

function aliasParametry(p) {
  const o = Object.assign({}, p && typeof p === 'object' ? p : {});
  if (o.fi == null && o.srednica_mm != null) o.fi = o.srednica_mm;
  if (o.fi == null && o.srednica_wewn_mm != null) o.fi = o.srednica_wewn_mm;
  if (o.fiZ == null && o.srednica_zewn_mm != null) o.fiZ = o.srednica_zewn_mm;
  if (o.h == null && o.wysokosc_mm != null) o.h = o.wysokosc_mm;
  if (o.w == null && o.szerokosc_mm != null) o.w = o.szerokosc_mm;
  if (o.grub == null && o.grubosc_mm != null) o.grub = o.grubosc_mm;
  if (o.dl == null && o.dlugosc_mm != null) o.dl = o.dlugosc_mm;
  if (o.x == null && o.x_mm != null) o.x = o.x_mm;
  if (o.y == null && o.y_mm != null) o.y = o.y_mm;
  if (o.z == null && o.z_mm != null) o.z = o.z_mm;
  if (o.fi1 == null && o.fi1_mm != null) o.fi1 = o.fi1_mm;
  if (o.fi2 == null && o.fi2_mm != null) o.fi2 = o.fi2_mm;
  if (o.fiDol == null && o.fiDol_mm != null) o.fiDol = o.fiDol_mm;
  if (o.fiDol == null && o.fi2 != null) o.fiDol = o.fi2;
  if (o.fiGniazda == null && o.fiDol != null) o.fiGniazda = o.fiDol;
  if (o.fiOtw == null && o.fi2 != null) o.fiOtw = o.fi2;
  if (o.fiTrzpienia == null && o.fi != null) o.fiTrzpienia = o.fi;
  if (o.podstawa == null && o.fiZ != null) o.podstawa = o.fiZ;
  if (o.n == null && o.liczba_hakow != null) o.n = o.liczba_hakow;
  if (o.n == null && o.przegrody != null) o.n = o.przegrody;
  return o;
}

function normalizujWynik(raw, zdanie) {
  const out = {
    decyzja: 'NEW',
    klasa: '',
    kandydaci: [],
    parametry: {},
    pytania: [],
    uzasadnienie: ''
  };
  if (!raw || typeof raw !== 'object') return zastosujMatch(out, zdanie);
  const d = String(raw.decyzja || 'NEW').toUpperCase();
  out.decyzja = (d === 'MATCH' || d === 'REMIX' || d === 'NEW' || d === 'REJECT') ? d : 'NEW';
  out.klasa = String(raw.klasa || '');
  out.kandydaci = Array.isArray(raw.kandydaci) ? raw.kandydaci.slice(0, 3) : [];
  out.parametry = aliasParametry(raw.parametry);
  out.pytania = Array.isArray(raw.pytania)
    ? raw.pytania.map(function (p) { return String(p); }).slice(0, 3).filter(Boolean)
    : [];
  out.uzasadnienie = String(raw.uzasadnienie || '');
  return zastosujMatch(out, zdanie);
}

export async function klasyfikujZdanie(zdanie, opts) {
  opts = opts || {};
  const call = opts.orCall || (typeof orCall === 'function' ? orCall : null);
  if (typeof call !== 'function') throw new Error('klasyfikator: brak orCall (wpięcie w projekt-ui)');
  const k = opts.k == null ? 5 : opts.k;
  let inst = opts.instancje;
  if (!inst && typeof szukajInstancji === 'function') {
    try { inst = await szukajInstancji(zdanie, k); } catch (e) { inst = []; }
  }
  try { await ladujRejestr(false); } catch (e2) { /* fetch 404 = rejestr pusty */ }
  try { await ladujProgi(false); } catch (eP) { /* brak progu = bez MATCH→NEW */ }
  const arch = opts.archetypy || lista();
  const user = 'Zdanie:\n' + String(zdanie || '') + '\n\n'
    + fewShotTekst(inst, arch) + '\n\n' + tekstArchetypow();
  const body = {
    model: opts.model || (typeof pjModelRoli === 'function' ? pjModelRoli('talk') : undefined),
    messages: [
      { role: 'system', content: SYS_KLAS },
      { role: 'user', content: user }
    ],
    max_tokens: opts.max_tokens || 1200,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'klasyfikator_v1', strict: true, schema: SCHEMAT_KLASYFIKATORA }
    }
  };
  let txt;
  try {
    txt = await call(body, opts.timeoutMs || 60000);
  } catch (e) {
    /* Astra 6 (i inni) na strict json_schema oddają HTTP 400 „Provider returned error”
       bez słowa schema — ten sam fallback co przy jawnym błędzie response_format. */
    if (/json_schema|response_format|HTTP 400/i.test(String((e && e.message) || e))) {
      txt = await call(Object.assign({}, body, {
        response_format: { type: 'json_object' }
      }), opts.timeoutMs || 60000);
    } else {
      throw e;
    }
  }
  return normalizujWynik(parsujJsonModelu(txt), opts.zdanieWymiary || zdanie);
}

if (typeof window !== 'undefined') {
  window.P2S = window.P2S || {};
  Object.assign(window.P2S, {
    klasyfikujZdanie: klasyfikujZdanie,
    SYS_KLAS: SYS_KLAS,
    SCHEMAT_KLASYFIKATORA: SCHEMAT_KLASYFIKATORA,
    PROGI_KLASYFIKATORA_DOMYSLNE: PROGI_KLASYFIKATORA_DOMYSLNE
  });
}
