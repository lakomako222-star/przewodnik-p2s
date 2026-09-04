/**
 * Kontrakt SPEC v1 — ten sam spacer w PWA i w CI.
 * Node: Ajv gdy jest w node_modules; inaczej ten walidator.
 * Nie bundlujemy Ajv do index.html (file://).
 */
import { ocenScienkeOtwor, ocenOrientacjeNaSztorc, pytaniaZKodowBramki } from './gate.js';


export function bledySpecSchema(data, schema, path) {
  path = path || '$';
  const out = [];
  if (!schema || data === undefined) return out;
  if (schema.type) {
    const t = schema.type;
    const ok =
      (t === 'object' && data !== null && typeof data === 'object' && !Array.isArray(data))
      || (t === 'array' && Array.isArray(data))
      || (t === 'string' && typeof data === 'string')
      || (t === 'number' && typeof data === 'number' && Number.isFinite(data))
      || (t === 'integer' && typeof data === 'number' && Number.isInteger(data))
      || (t === 'boolean' && typeof data === 'boolean');
    if (!ok) {
      out.push(path + ': oczekiwano ' + t + ', jest ' + typJs(data));
      return out;
    }
  }
  if (schema.enum && schema.enum.indexOf(data) < 0) {
    out.push(path + ': wartość poza enum');
  }
  if (schema.minimum != null && typeof data === 'number' && data < schema.minimum) {
    out.push(path + ': poniżej minimum ' + schema.minimum);
  }
  if (schema.maximum != null && typeof data === 'number' && data > schema.maximum) {
    out.push(path + ': powyżej maximum ' + schema.maximum);
  }
  /* Obiekt/tablica: słowa kluczowe JSON Schema działają na instancji, także gdy
   * podschema (if/then) nie powtarza "type". Inaczej allOf+if z minItems jest martwe. */
  const jestObiekt = data !== null && typeof data === 'object' && !Array.isArray(data);
  if (jestObiekt) {
    (schema.required || []).forEach(function (k) {
      if (data[k] === undefined) out.push(path + '.' + k + ': brak wymaganego pola');
    });
    if (schema.additionalProperties === false && schema.properties) {
      Object.keys(data).forEach(function (k) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties, k)) {
          out.push(path + '.' + k + ': pole poza schematem');
        }
      });
    }
    if (schema.properties) {
      Object.keys(schema.properties).forEach(function (k) {
        if (data[k] !== undefined) {
          out.push.apply(out, bledySpecSchema(data[k], schema.properties[k], path + '.' + k));
        }
      });
    }
  }
  if (Array.isArray(data)) {
    if (schema.minItems != null && data.length < schema.minItems) {
      out.push(path + ': za mało elementów');
    }
    if (schema.maxItems != null && data.length > schema.maxItems) {
      out.push(path + ': za dużo elementów (max ' + schema.maxItems + ')');
    }
    if (schema.items) {
      data.forEach(function (el, i) {
        out.push.apply(out, bledySpecSchema(el, schema.items, path + '[' + i + ']'));
      });
    }
  }
  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach(function (sub) {
      out.push.apply(out, bledySpecSchema(data, sub, path));
    });
  }
  if (schema.if) {
    const ifBledy = bledySpecSchema(data, schema.if, path);
    if (ifBledy.length === 0) {
      if (schema.then) out.push.apply(out, bledySpecSchema(data, schema.then, path));
    } else if (schema.else) {
      out.push.apply(out, bledySpecSchema(data, schema.else, path));
    }
  }
  return out;
}

function typJs(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

export function walidujSpecAlboRzuc(spec, schema) {
  const bledy = bledySpecSchema(spec, schema);
  if (bledy.length) {
    throw new Error('SPEC_SCHEMA: ' + bledy.slice(0, 8).join('; '));
  }
  return spec;
}

/** 408/429/5xx OpenRouter — retry ten sam mózg. TIMEOUT klienta to osobna ścieżka. */
export function orHttpRetryowalny(e) {
  const http = e && e.http;
  const m = String((e && e.message) || e || '');
  if (http === 408 || http === 429 || http === 502 || http === 503) return true;
  return /HTTP\s+408|HTTP\s+429|HTTP\s+502|HTTP\s+503|rate.?limit|Provider returned error/i.test(m);
}

export function orTimeoutLubPusty(e) {
  const m = String((e && e.message) || e || '');
  return /TIMEOUT|Pusta odpowied/i.test(m);
}

export function orBackoffMs(proba) {
  return [2000, 8000, 20000][proba];
}

/** Konserwatywny: zero łańcucha na Groka. Eksperymentalny: zapas po wyczerpaniu retry. */
export function orWolnoLancuchZapasu(profil) {
  return String(profil || '') === 'eksperymentalny';
}

/**
 * 402 to Payment Required — skończyły się środki na OpenRouter. Nie wolno tego chować
 * pod OR_BUSY: bieg wygląda wtedy na „dostawca zajęty", a jest na „pusty portfel",
 * i pół godziny idzie na szukanie nie tam, gdzie trzeba. Nie ponawiamy i nie
 * wpisujemy niczego z konta do logu — sam kod i zdanie wystarczą.
 */
export function orBrakSrodkow(e) {
  if (e === 402) return true;
  const http = e && e.http;
  const m = String((e && e.message) || e || '');
  return http === 402 || /HTTP\s+402/.test(m) || /OR_BRAK_SRODKOW/.test(m);
}

export function orKomunikatBrakSrodkow(powod) {
  const p = powod ? (' Powód: ' + String(powod).slice(0, 160) + '.') : '';
  return 'OR_BRAK_SRODKOW: OpenRouter odrzucił żądanie (HTTP 402) — skończyły się środki '
    + 'na koncie. To nie jest problem z modelem ani z siecią, więc ponawianie nie pomoże.' + p;
}

export function orKomunikatBusy(http, powod) {
  if (orBrakSrodkow(http)) return orKomunikatBrakSrodkow(powod);
  const kod = http ? (' (HTTP ' + http + ')') : '';
  const p = powod ? (' Powód: ' + String(powod).slice(0, 160) + '.') : '';
  return 'OR_BUSY: serwer wolny / spróbuj ponownie' + kod
    + '. Profil konserwatywny nie przełącza na Groka.' + p;
}

/**
 * Transport kawałka SPEC. Zwykły POST gubi połączenie na długich odpowiedziach
 * (tace: ucięcie po ~205 s bez żadnego HTTP), więc każdy kawałek idzie strumieniem.
 *
 * Budżet myślenia podajemy wprost, a nie przez effort: u Anthropica effort liczy się
 * jako część max_tokens, więc podnoszenie limitu wydłużało rozumowanie i dalej ucinało
 * JSON — taca weszła w 240 s przy 24 tys., a przy 32 tys. urosła do 828 s i przycięcia.
 * Powtórka po przycięciu dokłada miejsca na JSON, nie na myślenie.
 */
export function profilShardu(p) {
  const s = foldLat((p && (p.id || p.nazwa)) || p || '');
  return {
    stream: true,
    maxTokens: 26000,
    maxTokensRetry: 40000,
    reasoningTokens: 10000,
    ciezki: /tac[a-z]*|tray|kosz|rygiel|latch|zasuw/.test(s)
  };
}

/** Zbiera SSE w buforze; JSON walidujemy dopiero po domknięciu strumienia. */
export function nowyParserSSE() {
  let buf = '';
  let tresc = '';
  let finish = '';
  let zdarzenia = 0;
  let uzycie = null;
  function linia(line) {
    const s = line.trim();
    if (!s || s.startsWith(':')) return;
    if (!s.startsWith('data:')) return;
    const payload = s.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    let j;
    try { j = JSON.parse(payload); } catch (e) { return; }
    zdarzenia += 1;
    if (j.usage) uzycie = j.usage;
    const ch = j.choices && j.choices[0];
    if (!ch) return;
    const d = ch.delta || {};
    if (typeof d.content === 'string') tresc += d.content;
    else if (Array.isArray(d.content)) {
      tresc += d.content.map(function (x) {
        return (x && (x.text || x.content)) || '';
      }).join('');
    }
    if (ch.finish_reason) finish = ch.finish_reason;
  }
  function wynik() {
    const u = uzycie || {};
    const d = u.completion_tokens_details || {};
    return {
      tresc: tresc,
      finishReason: finish,
      zdarzenia: zdarzenia,
      tokenyWyjscie: u.completion_tokens || 0,
      tokenyMyslenie: d.reasoning_tokens || 0
    };
  }
  return {
    dopisz: function (chunk) {
      buf += String(chunk || '');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        linia(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    },
    domknij: function () {
      if (buf) { linia(buf); buf = ''; }
      return wynik();
    },
    stan: wynik
  };
}

/** Przycięta odpowiedź to osobny stan, nie „model nie umie”. */
export function czyPrzycieta(finishReason, err) {
  if (String(finishReason || '') === 'length') return true;
  const m = String((err && err.message) || err || '');
  if (!m) return false;
  return /Unexpected end of (JSON|input)|Expected ['",\]}]|after array element|after property value|Brak JSON w odpowiedzi/i.test(m);
}

/**
 * Kody bramki, które są błędem KONSTRUKCJI, a nie usterką druku: zbudowało się,
 * ale nie jest tym, co zamówiono (belka przez litery, taca bez rantu, stojak bez żeber).
 * Takie werdykty wracają do mózgu jako SPEC_GEOMETRIA — sama ścianka czy nawis nie.
 */
export const KODY_KONSTRUKCJI = [
  'NAPIS_BELKA', 'NAPIS_POZA_OBRYSEM', 'TACA_BEZ_RANTU', 'STOJAK_BEZ_ZEBER'
];

/**
 * Schemat nie zna wymagań buildera (np. poglebienie bez srednica_gniazda_mm
 * przechodzi schemat, a wywala build), więc kawałek sprawdzamy też budowaniem.
 * Builder wstrzykujemy, żeby ten plik nie zależał od silnika.
 */
export function buildShardPreview(spec, buduj) {
  if (typeof buduj !== 'function') return;
  try {
    return buduj(spec);
  } catch (e) {
    const err = new Error('SPEC_GEOMETRIA: ' + String((e && e.message) || e).slice(0, 200));
    err.geometria = true;
    throw err;
  }
}

function wpisyPreview(preview) {
  const czesci = (preview && preview.czesci) || [];
  return ((preview && preview.werdykt && preview.werdykt.wpisy) || []).concat(
    czesci.reduce(function (a, c) {
      return a.concat((c && c.werdykt && c.werdykt.wpisy) || []);
    }, [])
  );
}

export function runShardGeometryGate(preview) {
  const czesci = (preview && preview.czesci) || [];
  const maSiatke = (preview && preview.mesh) || czesci.some(function (c) { return c && c.mesh; });
  if (!maSiatke) {
    const err = new Error('SPEC_GEOMETRIA: build nie dał siatki — zero 3MF');
    err.geometria = true;
    throw err;
  }
  const zle = wpisyPreview(preview).filter(function (w) {
    return w && w.poziom === 'blad' && KODY_KONSTRUKCJI.indexOf(w.kod) >= 0;
  });
  if (zle.length) {
    const err = new Error('SPEC_GEOMETRIA: '
      + zle.map(function (w) { return w.kod + ' — ' + w.tekst; }).join(' | ').slice(0, 700));
    err.geometria = true;
    throw err;
  }
  return { ok: true };
}

export function sprawdzGeometrieShardu(spec, buduj) {
  if (typeof buduj !== 'function') return;
  const r = buildShardPreview(spec, buduj);
  runShardGeometryGate(r);
  return r;
}

function gabarytZPreview(preview) {
  const bb = preview && preview.mesh && preview.mesh.bbox;
  if (bb && bb.min && bb.max) {
    return { min: bb.min, max: bb.max, x: bb.x, y: bb.y, z: bb.z };
  }
  const g = preview && preview.werdykt && preview.werdykt.gabaryt;
  if (g && g.min && g.max) return g;
  return null;
}

/**
 * SCIENKA_OTWOR na kawałku, zanim zlepimy całość. Ten sam detektor co bramka programu
 * (ocenScienkeOtwor z gate.js) na gabarycie podglądu + wpisy z próbnego buildu.
 */
/**
 * Pomiar materiału wokół otworów robi build i zostawia go na ZNORMALIZOWANYM specu
 * (klon z buildera), a nie na tym, co przyszło od mózgu — więc bramkę wołamy na specach
 * z podglądu. Bez tego zostałby tylko szacunek z gabarytu.
 */
function czesciZPreview(preview) {
  if (!preview) return [];
  const lista = (preview.czesci || []).filter(function (c) { return c && c.spec; });
  if (lista.length) {
    return lista.map(function (c) {
      return { spec: c.spec, g: (c.mesh && c.mesh.bbox) || null };
    });
  }
  if (preview.spec) return [{ spec: preview.spec, g: (preview.mesh && preview.mesh.bbox) || null }];
  return [];
}

export function runShardFeatureGate_SCIENKA_OTWOR(preview, spec, opts) {
  opts = opts || {};
  const shardId = opts.shardId != null ? String(opts.shardId) : String((spec && spec.nazwa) || '');
  const czesci = czesciZPreview(preview);
  for (let i = 0; i < czesci.length; i++) {
    const v = ocenScienkeOtwor(czesci[i].g, czesci[i].spec, { shardId: shardId });
    if (!v.ok) return v;
  }
  const g = gabarytZPreview(preview);
  if (!czesci.length && g) {
    const v = ocenScienkeOtwor(g, spec, { shardId: shardId });
    if (!v.ok) return v;
  }
  const zly = wpisyPreview(preview).find(function (w) {
    return w && w.poziom === 'blad' && (w.kod === 'SCIENKA_OTWOR' || w.kod === 'BLAD_POMIARU');
  });
  if (zly) {
    return {
      ok: false,
      code: zly.kod,
      details: {
        shardId: shardId,
        localReason: String(zly.tekst || zly.kod)
      }
    };
  }
  return { ok: true };
}

/**
 * ORIENTACJA_NA_SZTORC na kawałku. Gabaryt podglądu jest już po obrocie z
 * orientacja_druku (builder stosuje go przed zrzutem siatki), więc mierzymy to,
 * co faktycznie stanie na płycie.
 */
export function runShardFeatureGate_ORIENTACJA_NA_SZTORC(preview, spec, opts) {
  opts = opts || {};
  const shardId = opts.shardId != null ? String(opts.shardId) : String((spec && spec.nazwa) || '');
  const g = gabarytZPreview(preview);
  if (!g) return { ok: true };
  return ocenOrientacjeNaSztorc(g, spec, { shardId: shardId });
}

const BRAMKI_KAWALKA = [
  runShardFeatureGate_SCIENKA_OTWOR,
  runShardFeatureGate_ORIENTACJA_NA_SZTORC
];

/** Pierwsza bramka kawałka, która nie przechodzi — jej kod trafia do logu i do naprawy. */
export function runShardFeatureGates(preview, spec, opts) {
  for (let i = 0; i < BRAMKI_KAWALKA.length; i++) {
    const v = BRAMKI_KAWALKA[i](preview, spec, opts);
    if (v && !v.ok) return v;
  }
  return { ok: true };
}

export function tekstNaprawyScienkiOtwor(spec, gate, shardId) {
  const d = (gate && gate.details) || {};
  const id = shardId || d.shardId || (spec && spec.nazwa) || '';
  const liczby = [
    d.wallMm != null ? ('wallMm=' + d.wallMm) : '',
    d.holeDiameterMm != null ? ('holeDiameterMm=' + d.holeDiameterMm) : '',
    d.edgeDistanceMm != null ? ('edgeDistanceMm=' + d.edgeDistanceMm) : '',
    d.localReason || ''
  ].filter(Boolean).join(', ');
  return 'POPRAW TYLKO TEN SHARD.\n'
    + 'Nie zmieniaj liczby części ani przeznaczenia elementu.\n'
    + 'Napraw błąd: SCIENKA_OTWOR.\n\n'
    + 'Wymagania:\n'
    + '- otwór montażowy M3 ma być poprawny geometrycznie,\n'
    + '- ścianka przy otworze nie może być zbyt cienka,\n'
    + '- zachowaj zgodność z resztą shardu,\n'
    + '- zwróć wyłącznie poprawny SPEC tego shardu, zgodny ze schemą.\n\n'
    + 'SHARD: ' + id + '\n'
    + 'SZCZEGÓŁY BRAMKI: ' + liczby + '\n\n'
    + 'POPRZEDNI SPEC TEGO SHARDU:\n' + JSON.stringify(spec);
}

export function tekstNaprawyOrientacji(spec, gate, shardId) {
  const d = (gate && gate.details) || {};
  const id = shardId || d.shardId || (spec && spec.nazwa) || '';
  const liczby = [
    d.wysokoscMm != null ? ('wysokoscMm=' + d.wysokoscMm) : '',
    Array.isArray(d.sladMm) ? ('sladMm=' + d.sladMm.join('×')) : '',
    Array.isArray(d.obrotDeg) ? ('obrot_xyz_deg=[' + d.obrotDeg.join(', ') + ']') : '',
    d.localReason || ''
  ].filter(Boolean).join(', ');
  return 'POPRAW TYLKO TEN SHARD.\n'
    + 'Nie zmieniaj liczby części, wymiarów ani przeznaczenia elementu.\n'
    + 'Napraw błąd: ORIENTACJA_NA_SZTORC.\n\n'
    + 'Wymagania:\n'
    + '- popraw wyłącznie orientacja_druku: obrót wokół właściwej osi,\n'
    + '- najdłuższy wymiar części ma leżeć na płycie, nie stać w Z,\n'
    + '- sciana_na_plycie musi opisywać tę ścianę, która faktycznie leży po obrocie,\n'
    + '- nie ruszaj bryl ani cech — sama orientacja jest do naprawy,\n'
    + '- zwróć wyłącznie poprawny SPEC tego shardu, zgodny ze schemą.\n\n'
    + 'SHARD: ' + id + '\n'
    + 'SZCZEGÓŁY BRAMKI: ' + liczby + '\n\n'
    + 'POPRZEDNI SPEC TEGO SHARDU:\n' + JSON.stringify(spec);
}

/** Prompt naprawczy dobrany do kodu bramki, która oblała kawałek. */
export function tekstNaprawyKawalka(spec, gate, shardId) {
  if (gate && gate.code === 'BLAD_POMIARU') {
    throw new Error('BLAD_POMIARU nie idzie do naprawy — to zepsuty pomiar.');
  }
  if (gate && gate.code === 'ORIENTACJA_NA_SZTORC') {
    return tekstNaprawyOrientacji(spec, gate, shardId);
  }
  return tekstNaprawyScienkiOtwor(spec, gate, shardId);
}

export function bladBramkiKawalka(fg) {
  const d = (fg && fg.details) || {};
  const kod = (fg && fg.code) || 'SCIENKA_OTWOR';
  const err = new Error(kod + ': ' + (d.localReason || 'kawałek nie przeszedł bramki'));
  err.bramkaKawalka = kod;
  err.gate = fg;
  return err;
}

function odmowBezNaprawy(fg, log, teleFn, shardId) {
  const kod = (fg && fg.code) || 'BLAD_POMIARU';
  log('chunk_gate=' + kod);
  log('chunk_repair_attempt=0');
  log('chunk_repair_result=ODMOWA');
  teleFn({
    rola: 'spec-shard',
    shard: shardId,
    chunk_gate: kod,
    chunk_repair_attempt: 0,
    chunk_repair_result: 'ODMOWA'
  });
  throw bladBramkiKawalka(fg);
}

/**
 * Po schemacie i geometrii: bramki kawałka (SCIENKA_OTWOR, ORIENTACJA_NA_SZTORC, BLAD_POMIARU).
 * FAIL konstrukcji → 1 repair tylko tego shardu. BLAD_POMIARU nie idzie do mózgu:
 * to zepsuty pomiar, nie cienka ścianka.
 */
export async function processShardWithRepair(spec, opts) {
  opts = opts || {};
  const shardId = opts.shardId != null ? String(opts.shardId) : String((spec && spec.nazwa) || '');
  const buduj = opts.buduj;
  const log = opts.log || function () {};
  const teleFn = opts.tele || function () {};
  const waliduj = opts.walidujSchema || (opts.schema
    ? function (s) { walidujSpecAlboRzuc(s, opts.schema); }
    : null);

  let preview = opts.preview;
  if (!preview && typeof buduj === 'function') {
    if (typeof waliduj === 'function') waliduj(spec);
    preview = sprawdzGeometrieShardu(spec, buduj);
  }

  const fg = runShardFeatureGates(preview, spec, { shardId: shardId });
  if (fg.ok) return { ok: true, spec: spec, preview: preview, repaired: false };

  if (fg.code === 'BLAD_POMIARU') {
    odmowBezNaprawy(fg, log, teleFn, shardId);
  }

  const kod = fg.code;
  const zglos = function (wynik) {
    if (wynik) log('chunk_repair_result=' + wynik);
    teleFn({
      rola: 'spec-shard',
      shard: shardId,
      chunk_gate: kod,
      chunk_repair_attempt: 1,
      chunk_repair_result: wynik || undefined
    });
  };

  log('chunk_gate=' + kod);
  log('chunk_repair_attempt=1');
  zglos(null);

  if (typeof opts.napraw !== 'function') {
    zglos('FAIL');
    throw bladBramkiKawalka(fg);
  }

  const repaired = await opts.napraw(spec, fg);
  try {
    if (typeof waliduj === 'function') waliduj(repaired);
  } catch (e) {
    zglos('FAIL');
    const err = new Error('SHARD_REPAIR_SCHEMA: ' + String((e && e.message) || e).slice(0, 200));
    err.bramkaKawalka = kod;
    throw err;
  }
  if (specPusteBryly(repaired)) {
    zglos('FAIL');
    const err = new Error('SHARD_REPAIR_SCHEMA: puste bryły po naprawie ' + kod);
    err.bramkaKawalka = kod;
    throw err;
  }
  const preview2 = sprawdzGeometrieShardu(repaired, buduj);
  const fg2 = runShardFeatureGates(preview2, repaired, { shardId: shardId });
  zglos(fg2.ok ? 'PASS' : 'FAIL');
  if (!fg2.ok) throw bladBramkiKawalka(fg2);
  return { ok: true, spec: repaired, preview: preview2, repaired: true };
}

export function komunikatPrzyciecia(shard, finishReason, limit) {
  return 'SHARD_TRUNCATED: kawałek ' + (shard || '?')
    + ' urwany (finish_reason=' + (finishReason || 'json') + ', limit ' + limit + ' tokenów).';
}

function bledyWerdyktu(r) {
  return ((r && r.werdykt && r.werdykt.wpisy) || []).filter(function (w) {
    return w && w.poziom === 'blad';
  });
}

/**
 * Autokorekta ×3 przed pytaniami z mapy kod→pytanie.
 * `napraw` to istniejąca ścieżka (LLM / processShardWithRepair). Bez LLM w testach: mock.
 */
export async function petlaAutokorekty(spec, opts) {
  opts = opts || {};
  const maxIter = opts.maxIter == null ? 3 : opts.maxIter;
  const buduj = opts.buduj;
  const napraw = opts.napraw;
  if (typeof buduj !== 'function') throw new Error('petlaAutokorekty: brak buduj');
  let current = spec;
  let iteracje = 0;
  let r = buduj(current);
  while (r && !(r.pytania && r.pytania.length && !r.mesh) && bledyWerdyktu(r).length) {
    if (iteracje >= maxIter || typeof napraw !== 'function') break;
    iteracje += 1;
    current = await napraw(current, r.werdykt, iteracje);
    r = buduj(current);
  }
  const bledy = bledyWerdyktu(r);
  const pytania = bledy.length ? pytaniaZKodowBramki(bledy) : [];
  return {
    spec: current,
    wynik: r,
    iteracje: iteracje,
    pytania: pytania,
    stop: bledy.length ? 'pytania' : 'ok'
  };
}

export function specPusteBryly(spec) {
  const b = ((spec && spec.bryly) || []).length;
  const c = ((spec && spec.czesci) || []).reduce(function (n, cz) {
    return n + ((cz && cz.bryly) || []).length;
  }, 0);
  return (b + c) === 0;
}

export function oznaczSzacunek(spec, opts) {
  opts = opts || {};
  const s = spec || {};
  if (opts.szacunek) {
    s.pochodzenie_wymiaru = 'szacunek';
    s.derivedFrom = 'estimated';
  } else if (opts.zmierzone) {
    s.pochodzenie_wymiaru = s.pochodzenie_wymiaru || 'zmierzone';
    s.derivedFrom = s.derivedFrom || 'measured';
  }
  return s;
}

export function werdyktEksperymentalny(spec) {
  return (spec && spec.derivedFrom === 'estimated')
    || (spec && spec.pochodzenie_wymiaru === 'szacunek');
}

function foldLat(s) {
  return String(s || '').toLowerCase()
    .replace(/ł/g, 'l').replace(/ó/g, 'o').replace(/ą/g, 'a')
    .replace(/ę/g, 'e').replace(/ś/g, 's').replace(/ć/g, 'c')
    .replace(/ń/g, 'n').replace(/ż/g, 'z').replace(/ź/g, 'z');
}

/** Duży składak (ociekacz/zasuwa) — nie topper, nie pad. */
export function wykryjSharding(blob) {
  const s = foldLat(blob);
  if (/vader|flydigi|kontroler|gerber|napis|topper|chrzest|urodzin/.test(s)
      && !/ociekacz|zasuw|rygiel/.test(s)) {
    return false;
  }
  if (/ociekacz|dish.?rack|ander/.test(s)) return true;
  if (/550\s*[x×]\s*240|55\s*x\s*24/.test(s)) return true;
  if (/zasuw|rygiel|door.?latch|jaskolcz|dovetail/.test(s)) return true;
  return false;
}

export function planCzesciDomyslny(blob) {
  const s = foldLat(blob);
  if (/ociekacz|550|55\s*x\s*24|ander/.test(s)) {
    return [
      { id: 'taca-L', nazwa: 'taca-L', rola: 'base', hint: 'lewa taca-wanienka ~183×240×25 mm: pełna kostka 183×240×25 „dodaj” MINUS wnętrze 178,2×235,2×25 od Z=2,4 „odejmij” — rant 2,4 mm dookoła po czterech bokach, dno 2,4 mm. Do tego pióro 12×12×10 mm na +X. Płaska płyta bez rantu leci na bramce TACA_BEZ_RANTU' },
      { id: 'taca-M', nazwa: 'taca-M', rola: 'base', hint: 'środkowa taca-wanienka, ten sam przepis (kostka minus wnętrze), wnęka żeńska +0,4 mm na −X i pióro męskie na +X' },
      { id: 'taca-P', nazwa: 'taca-P', rola: 'base', hint: 'prawa taca-wanienka, ten sam przepis, wnęka żeńska +0,4 mm na −X, spadek 2 mm do odpływu' },
      { id: 'stelaz-L', nazwa: 'stelaz-L', rola: 'mount', hint: 'grzebień na talerze: rama + pręty Ø≥3,6 mm, odwrócone U, ≤230 mm' },
      { id: 'stelaz-P', nazwa: 'stelaz-P', rola: 'mount', hint: 'druga połowa grzebienia + pióro/wnęka' },
      { id: 'koszyk', nazwa: 'koszyk', rola: 'insert', hint: 'koszyk na sztućce: ramka + pręty Ø≥3,6 mm i dno z otworami, nie płaska kratka, brim' }
    ];
  }
  if (/zasuw|rygiel|latch|jaskolcz/.test(s)) {
    return [
      { id: 'korpus', nazwa: 'korpus', rola: 'base', hint: 'korpus ~86×25, rynna kieszeń, otwory Ø4, gabaryt v11' },
      { id: 'rygiel', nazwa: 'rygiel', rola: 'insert', hint: 'rygiel ~70×9,6×7 + gałka, luz 0,4 do rynny' }
    ];
  }
  return [];
}

export function walidujPlanCzesci(plan) {
  const lista = plan && plan.czesci;
  if (!Array.isArray(lista) || lista.length < 2 || lista.length > 8) return false;
  return lista.every(function (c) { return c && c.id && c.nazwa; });
}

const MAT_OK = { PLA: 1, PETG: 1, ABS: 1, TPU: 1 };

function materialSpec(v, fallback) {
  return MAT_OK[v] ? v : (MAT_OK[fallback] ? fallback : 'PETG');
}

/** Shard 1.1 z geometrią w czesci[] → SPEC 1.0 jednej części (bez pola czesci). */
export function splaszczShardDo10(spec, nazwa) {
  const s = spec && typeof spec === 'object' ? spec : {};
  let bryly = s.bryly;
  let cechy = s.cechy;
  let naz = s.nazwa || nazwa;
  let orient = s.orientacja_druku;
  let podpory = s.podpory;
  let brim = s.brim;
  let mat = s.material;
  let opis = s.opis_slowny;
  let uwagi = s.uwagi_do_druku;
  if ((!Array.isArray(bryly) || !bryly.length) && Array.isArray(s.czesci)) {
    const c = s.czesci.find(function (x) { return x && x.bryly && x.bryly.length; });
    if (c) {
      bryly = c.bryly;
      cechy = c.cechy || [];
      naz = naz || c.nazwa;
      orient = c.orientacja_druku || orient;
      podpory = c.podpory || podpory;
      brim = c.brim || brim;
      mat = c.material || mat;
      opis = c.opis_slowny || opis;
      uwagi = c.uwagi_do_druku || uwagi;
    }
  }
  const out = {
    spec_version: '1.0',
    nazwa: naz || 'czesc',
    material: materialSpec(mat, 'PETG'),
    opis_slowny: opis || '',
    bryly: bryly || [],
    cechy: cechy || [],
    pytania: [],
    uwagi_do_druku: uwagi || ''
  };
  if (orient) out.orientacja_druku = orient;
  if (podpory) out.podpory = podpory;
  if (brim) out.brim = brim;
  if (s.pochodzenie_wymiaru) out.pochodzenie_wymiaru = s.pochodzenie_wymiaru;
  if (s.derivedFrom) out.derivedFrom = s.derivedFrom;
  return out;
}

/** Składa SPEC 1.1 z kawałków 1.0. Tylko pola ze schematu v1. */
export function zlepSpecCzesci(root, czesciSpec) {
  const lista = (czesciSpec || []).map(function (c) {
    return splaszczShardDo10(c, c && c.nazwa);
  }).filter(function (c) {
    return c && Array.isArray(c.bryly) && c.bryly.length;
  });
  if (!lista.length) throw new Error('SHARD_FAIL: zero części z bryłami — zero 3MF');
  const r0 = lista[0];
  const out = {
    spec_version: '1.1',
    nazwa: (root && root.nazwa) || r0.nazwa || 'skladak',
    material: materialSpec((root && root.material) || r0.material, 'PETG'),
    opis_slowny: (root && root.opis_slowny) || '',
    bryly: [],
    cechy: [],
    pytania: [],
    uwagi_do_druku: ((root && root.uwagi_do_druku) || '')
      + ' SPEC sharded: ' + lista.map(function (c) { return c.nazwa; }).join(', ') + '.',
    czesci: lista.map(function (c) {
      const cz = {
        nazwa: c.nazwa,
        material: materialSpec(c.material, r0.material),
        opis_slowny: c.opis_slowny,
        bryly: c.bryly,
        cechy: c.cechy || [],
        uwagi_do_druku: c.uwagi_do_druku
      };
      if (c.orientacja_druku) cz.orientacja_druku = c.orientacja_druku;
      if (c.podpory) cz.podpory = c.podpory;
      if (c.brim) cz.brim = c.brim;
      return cz;
    })
  };
  if (r0.orientacja_druku) out.orientacja_druku = r0.orientacja_druku;
  if (r0.podpory) out.podpory = r0.podpory;
  if (r0.brim) out.brim = r0.brim;
  const poch = (root && root.pochodzenie_wymiaru) || r0.pochodzenie_wymiaru;
  const der = (root && root.derivedFrom) || r0.derivedFrom;
  if (poch) out.pochodzenie_wymiaru = poch;
  if (der) out.derivedFrom = der;
  return out;
}

