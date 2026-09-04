/**
 * Bramka przedeksportowa — SPEC v1 / zakładka Projekt.
 * Liczy na żywym obiekcie Manifold (szczelność, ścianka, nawisy).
 */
export function gabaryt(part) {
  const bb = part.boundingBox();
  return {
    x: bb.max[0] - bb.min[0],
    y: bb.max[1] - bb.min[1],
    z: bb.max[2] - bb.min[2],
    min: bb.min,
    max: bb.max
  };
}

export function cienkieScianki(part, wmin, nPrzekrojow = 12) {
  const bb = part.boundingBox(), z0 = bb.min[2], z1 = bb.max[2];
  const eps = wmin / 2, znaleziska = [];
  for (let i = 1; i <= nPrzekrojow; i++) {
    const z = z0 + (z1 - z0) * i / (nPrzekrojow + 1);
    const sek = part.slice(z);
    const A0 = Math.abs(sek.area());
    if (A0 < 1e-6) { sek.delete(); continue; }
    const otw = sek.offset(-eps, 'Round', 2, 32).offset(eps, 'Round', 2, 32);
    const A1 = Math.abs(otw.area());
    const ubytek = (A0 - A1) / A0;
    if (ubytek > 0.02) znaleziska.push({ z: +z.toFixed(2), procent: +(ubytek * 100).toFixed(1) });
    sek.delete(); otw.delete();
  }
  return znaleziska;
}

export function nawisy(part, warstwa = 0.2) {
  const m = part.getMesh(), np = m.numProp, vp = m.vertProperties, tv = m.triVerts;
  const zmin = part.boundingBox().min[2];
  let najgorszy = 0, polePodparte = 0, poleZle = 0, poleRazem = 0;
  const zle = [];
  for (let i = 0; i < tv.length; i += 3) {
    const p = k => [vp[tv[i + k] * np], vp[tv[i + k] * np + 1], vp[tv[i + k] * np + 2]];
    const A = p(0), B = p(1), C = p(2);
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]); if (len < 1e-12) continue;
    const pole = len / 2; poleRazem += pole;
    const naStole = A[2] <= zmin + warstwa && B[2] <= zmin + warstwa && C[2] <= zmin + warstwa;
    const nz = n[2] / len;
    if (naStole) { if (nz < -0.999) polePodparte += pole; continue; }
    if (nz < -1e-6) {
      const odPionu = 90 - Math.acos(Math.min(1, -nz)) * 180 / Math.PI;
      if (odPionu > najgorszy) najgorszy = odPionu;
      if (odPionu > 45) {
        poleZle += pole;
        zle.push({
          t: i, pole,
          min: [
            Math.min(A[0], B[0], C[0]),
            Math.min(A[1], B[1], C[1]),
            Math.min(A[2], B[2], C[2])
          ],
          max: [
            Math.max(A[0], B[0], C[0]),
            Math.max(A[1], B[1], C[1]),
            Math.max(A[2], B[2], C[2])
          ]
        });
      }
    }
  }
  const parent = zle.map((_, i) => i);
  const root = i => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== i) { const n = parent[i]; parent[i] = r; i = n; }
    return r;
  };
  const polacz = (a, b) => {
    const ra = root(a), rb = root(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const edges = new Map();
  zle.forEach((f, i) => {
    const a = tv[f.t], b = tv[f.t + 1], c = tv[f.t + 2];
    for (const [u0, v0] of [[a, b], [b, c], [c, a]]) {
      const u = Math.min(u0, v0), v = Math.max(u0, v0);
      const key = `${u}:${v}`, prev = edges.get(key);
      if (prev == null) edges.set(key, i); else polacz(i, prev);
    }
  });
  const grupy = new Map();
  zle.forEach((f, i) => {
    const r = root(i);
    let g = grupy.get(r);
    if (!g) {
      g = { pole: 0, trojkatow: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      grupy.set(r, g);
    }
    g.pole += f.pole; g.trojkatow++;
    for (let k = 0; k < 3; k++) {
      if (f.min[k] < g.min[k]) g.min[k] = f.min[k];
      if (f.max[k] > g.max[k]) g.max[k] = f.max[k];
    }
  });
  const spojne = [...grupy.values()].map(g => {
    const rozmiar = g.max.map((v, i) => v - g.min[i]);
    return {
      pole_mm2: +g.pole.toFixed(1),
      trojkatow: g.trojkatow,
      rozmiar_mm: rozmiar.map(v => +v.toFixed(1)),
      krytyczny: g.pole >= 20 && rozmiar.filter(v => v >= 3).length >= 2
    };
  }).sort((a, b) => b.pole_mm2 - a.pole_mm2);
  return {
    najgorszy: +najgorszy.toFixed(1),
    procentZlych: poleRazem > 0 ? +(100 * poleZle / poleRazem).toFixed(1) : 0,
    poleZlych: +poleZle.toFixed(1),
    poleNaStole: +polePodparte.toFixed(1),
    najwiekszySpojny: spojne[0]?.pole_mm2 || 0,
    spojne,
    krytyczny: spojne.some(g => g.krytyczny)
  };
}

function wpis(poziom, kod, tekst, liczba) {
  const o = { poziom, kod, tekst };
  if (liczba != null) o.liczba = liczba;
  return o;
}

/**
 * Pytania po 3 nieudanych autokorektach — mapa kod bramki → pytanie (bez LLM).
 */
export const MAPA_PYTAN_BRAMKI = {
  SCIANKA: 'Która ścianka może być grubsza (min 0,8 mm)?',
  OTWOR_MALY: 'Jaka średnica otworu (min 2 mm)?',
  BRYLY: 'Ma być jedna część czy zestaw?',
  PLYTA: 'Zmniejszyć gabaryt do 256 mm?'
};

export function pytaniaZKodowBramki(wpisy) {
  const seen = {};
  const out = [];
  const lista = Array.isArray(wpisy) ? wpisy : [];
  for (let i = 0; i < lista.length; i++) {
    const w = lista[i];
    if (!w || w.poziom !== 'blad') continue;
    const kod = w.kod;
    if (!MAPA_PYTAN_BRAMKI[kod] || seen[kod]) continue;
    seen[kod] = 1;
    out.push(MAPA_PYTAN_BRAMKI[kod]);
    if (out.length >= 3) break;
  }
  return out;
}

function statusManifoldNoError(status) {
  if (status == null || status === '') return null;
  if (status === 'NoError' || status === 0) return true;
  return false;
}

function propozycjaOrientacjiTekst(part, spec, opts) {
  const fn = (opts && typeof opts.wybierzOrientacjeBezPodpor === 'function')
    ? opts.wybierzOrientacjeBezPodpor
    : (typeof globalThis !== 'undefined' && globalThis.P2S
      && typeof globalThis.P2S.wybierzOrientacjeBezPodpor === 'function'
      && globalThis.P2S.wybierzOrientacjeBezPodpor);
  if (!fn) return '';
  try {
    const mesh = part && typeof part.getMesh === 'function' ? part.getMesh() : part;
    if (!mesh || !mesh.vertProperties) return '';
    const sug = fn(mesh, (spec && spec.cechy) || [], opts && opts.orientacjaOpcje);
    if (!sug || !Array.isArray(sug.obrot_xyz_deg)) return '';
    const os = sug.obrot_xyz_deg.map(function (n) { return Number(n) || 0; }).join(', ');
    let t = ' Propozycja obrotu (bez automatycznego zastosowania): [' + os + ']°';
    if (sug.przesuniecie_z_mm != null && Number.isFinite(Number(sug.przesuniecie_z_mm))) {
      t += ', przesunięcie Z ' + Number(sug.przesuniecie_z_mm).toFixed(2) + ' mm';
    }
    return t + '.';
  } catch (e) {
    return '';
  }
}

/**
 * Jedyny korzeń progów ścianki — obie zakładki biorą stąd.
 *
 * Obie liczby są ZGADNIĘTE do czasu wydruku kuponu 6.15 (ścianki 0,4 / 0,8 / 1,2 / 1,6 mm,
 * odczyt: najcieńsza, która jeszcze schodzi z płyty). Po wydruku zmień tu jedną liczbę
 * i oba progi przesuną się razem.
 *
 * To dwie różne fizyki, dlatego nie jedna liczba. DRUKOWALNA odpowiada na pytanie
 * „co dysza umie położyć" i to mierzy kupon. WOKOL_OTWORU odpowiada na „ile materiału
 * wytrzyma wyrwanie wkręta" i nie wolno jej zjechać poniżej 2 mm nawet na drukarce,
 * która kładzie 0,4 mm — M3 w 1 mm ścianki i tak rozłupie. Podłoga 2,0 jest nośna,
 * mnożnik to tylko sprzężenie w drugą stronę: gorsza drukarka podnosi wymagany margines.
 */
export const SCIANKA_DRUKOWALNA_MM = 0.8;
export const SCIANKA_WOKOL_OTWORU_MM = Math.max(2.0, 2.5 * SCIANKA_DRUKOWALNA_MM);
/** Promień dyszy = połowa SCIANKA_DRUKOWALNA (ścianka = dwie ścieżki).
 *  Najmniejsza cecha, jaka fizycznie może istnieć w wydruku. Kupon 6.15
 *  rusza SCIANKA — to idzie razem, bez osobnej literału 0,4. */
export const PROMIEN_DYSZY_MM = SCIANKA_DRUKOWALNA_MM / 2;

/**
 * Jedyny legalny odczyt progu. Brak źródła albo zero to wyjątek, nie undefined:
 * `(rZew - rN) < undefined` jest zawsze false i bramka milknie na wszystkim.
 */
export function wymaganaSciankaDrukowalna(zrodlo) {
  const v = zrodlo && zrodlo.SCIANKA_DRUKOWALNA_MM;
  if (!(v > 0)) throw new Error('brak P2S.SCIANKA_DRUKOWALNA_MM');
  return v;
}

/**
 * Bramka licząca wielkość fizyczną (długość, grubość, średnica) nie wolno
 * porównywać wartości niemożliwej z progiem. −1,6 mm < 2 mm jest prawdziwe
 * arytmetycznie i wysyła zdrowy model do naprawy. NaN i Infinity też.
 * Zero zostaje — to „nie ma materiału”, czyli SCIENKA_OTWOR, nie zepsuty pomiar.
 */
export function pomiarFizycznyNiemozliwy(v) {
  return typeof v !== 'number' || !Number.isFinite(v) || v < 0;
}

/**
 * Promień otworu poniżej dyszy jest tak samo niemożliwy jak ścianka −1,6 mm.
 * Zero ścianki zostaje SCIENKA_OTWOR („nie ma materiału”). Zero promienia
 * otworu to zepsuty pomiar — oś muska ścianę, to nie jest cecha.
 */
export function promienCechyNiemozliwy(r) {
  return typeof r !== 'number' || !Number.isFinite(r) || r < PROMIEN_DYSZY_MM;
}

function maxGabarytMm(g) {
  if (!g || !g.min || !g.max) return null;
  const dx = g.max[0] - g.min[0];
  const dy = g.max[1] - g.min[1];
  const dz = g.max[2] - g.min[2];
  const m = Math.max(dx, dy, dz);
  return Number.isFinite(m) ? m : null;
}

/**
 * Ścianka większa niż cała część jest tak samo niemożliwa jak ujemna.
 * Porównanie do NAJMNIEJSZEGO gabarytu fałszywie pali płyty (ścianka 5,9 mm
 * w XY przy grubości 5 mm jest legalna). Strażnik: wall > max(dx,dy,dz).
 */
export function sciankaPonadGabaryt(v, g) {
  const maxG = maxGabarytMm(g);
  return Number.isFinite(v) && maxG != null && v > maxG + 1e-6;
}

function werdyktBladPomiaru(opts) {
  opts = opts || {};
  const v = opts.wallMm;
  const opis = (typeof v === 'number' && Number.isFinite(v))
    ? (v.toFixed(2) + ' mm')
    : String(v);
  return {
    ok: false,
    code: 'BLAD_POMIARU',
    details: {
      shardId: opts.shardId != null ? String(opts.shardId) : '',
      wallMm: v,
      holeDiameterMm: opts.holeDiameterMm,
      edgeDistanceMm: v,
      localReason: 'Pomiar ścianki wokół otworu dał wartość niemożliwą ('
        + opis + '). To zepsuty pomiar, nie wymiar skrajny — odmowa, bez naprawy geometrii.'
        + (opts.dopisek ? ' ' + opts.dopisek : '')
    }
  };
}

const OS_INDEKS = { x: 0, y: 1, z: 2 };
const CECHY_Z_OTWOREM = ['otwor', 'otwor_pod_wkladke', 'poglebienie', 'poglebienie_stozkowe'];

function srednicaOtworu(c) {
  return c.srednica_mm || c.srednica_otworu_mm || null;
}

/** Cięciwy przekroju siatki płaszczyzną prostopadłą do osi, rzutowane na dwie osie w płaszczyźnie. */
function cieciwyPrzekroju(mesh, iOs, t, iA, iB) {
  const np = mesh.numProp || 3;
  const vp = mesh.vertProperties;
  const tv = mesh.triVerts;
  const out = [];
  for (let f = 0; f + 3 <= tv.length; f += 3) {
    const o = [tv[f] * np, tv[f + 1] * np, tv[f + 2] * np];
    const d = [vp[o[0] + iOs] - t, vp[o[1] + iOs] - t, vp[o[2] + iOs] - t];
    if ((d[0] > 0 && d[1] > 0 && d[2] > 0) || (d[0] < 0 && d[1] < 0 && d[2] < 0)) continue;
    const pk = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if ((d[i] <= 0 && d[j] > 0) || (d[i] > 0 && d[j] <= 0)) {
        const u = d[i] / (d[i] - d[j]);
        pk.push([
          vp[o[i] + iA] + u * (vp[o[j] + iA] - vp[o[i] + iA]),
          vp[o[i] + iB] + u * (vp[o[j] + iB] - vp[o[i] + iB])
        ]);
      }
    }
    if (pk.length >= 2) out.push([pk[0], pk[1]]);
  }
  return out;
}

/** Ścianek wyciętego otworu musi być w przekroju dużo (N=96 daje dziesiątki cięciw). */
const MIN_CIECIW_OTWORU = 8;

function odlegloscOdOdcinka(cx, cy, a, b) {
  const ax = a[0] - cx, ay = a[1] - cy;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const dd = dx * dx + dy * dy;
  let u = dd > 1e-12 ? -(ax * dx + ay * dy) / dd : 0;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(ax + u * dx, ay + u * dy);
}

/**
 * Materiał wokół każdego otworu, mierzony na przekroju prostopadłym do OSI TEGO otworu —
 * do najbliższej krawędzi konturu, nie do bounding boxa. Bbox kłamie w dwie strony:
 * przepuszcza otwór 0,4 mm od krawędzi okna w płycie i zatrzymuje otwór odsunięty
 * od nieregularnego obrysu.
 *
 * Wołane PRZED zastosujOrientacjeDruku, bo punkt_mm cechy jest w układzie SPEC-u,
 * a obrót przenosi siatkę do układu płyty.
 */
export function zmierzMarginesyOtworow(part, spec) {
  let mesh = null;
  try { mesh = part.getMesh(); } catch (e) { return []; }
  if (!mesh || !mesh.vertProperties || !mesh.triVerts) return [];
  const out = [];
  for (const c of (spec && spec.cechy) || []) {
    if (!c || CECHY_Z_OTWOREM.indexOf(c.typ) < 0) continue;
    const d = srednicaOtworu(c);
    const iOs = OS_INDEKS[String(c.os || '').toLowerCase()];
    if (!(d > 0) || iOs == null || !Array.isArray(c.punkt_mm)) continue;
    const osie = [0, 1, 2].filter(i => i !== iOs);
    const iA = osie[0], iB = osie[1];
    const r = d / 2;
    const cx = c.punkt_mm[iA], cy = c.punkt_mm[iB];
    let naj = Infinity;
    let sciankiOtworu = 0;
    // Ścianka samego otworu leży w odległości ~r od środka i nie jest krawędzią materiału.
    for (const cw of cieciwyPrzekroju(mesh, iOs, c.punkt_mm[iOs], iA, iB)) {
      const od = odlegloscOdOdcinka(cx, cy, cw[0], cw[1]);
      if (od <= r + 0.02) sciankiOtworu++;
      else if (od < naj) naj = od;
    }
    // Brak ścianek otworu znaczy, że ten otwór niczego nie wyciął — wypadł w powietrzu
    // (np. w środku okna) albo płaszczyzna minęła bryłę. Nie zgłaszamy pomiaru,
    // bo odległość do najbliższej krawędzi wyglądałaby wtedy na zdrowy zapas.
    if (sciankiOtworu < MIN_CIECIW_OTWORU || naj === Infinity) continue;
    out.push({
      id: c.id || c.typ,
      os: c.os,
      srednica_mm: +d.toFixed(3),
      punkt_mm: c.punkt_mm.slice(),
      margines_mm: +(naj - r).toFixed(3)
    });
  }
  return out;
}

/**
 * Ścianka przy otworze — próg SCIANKA_WOKOL_OTWORU_MM, wspólny dla obu zakładek.
 * Gdy build zdążył zmierzyć materiał (spec._marginesyOtworow), bierzemy pomiar.
 * Bez pomiaru zostaje zgrubny szacunek z gabarytu: liczy tylko w XY i tylko do bboxa,
 * więc łapie wyłącznie otwory przy zewnętrznej krawędzi prostokątnej części.
 */
export function ocenScienkeOtwor(g, spec, opts) {
  opts = opts || {};
  const shardId = opts.shardId != null ? String(opts.shardId) : String((spec && spec.nazwa) || '');
  const zmierzone = (spec && spec._marginesyOtworow) || opts.marginesy || null;
  if (zmierzone && zmierzone.length) {
    for (const m of zmierzone) {
      if (pomiarFizycznyNiemozliwy(m.margines_mm)) {
        return werdyktBladPomiaru({
          shardId: shardId,
          wallMm: m.margines_mm,
          holeDiameterMm: m.srednica_mm,
          dopisek: m.os ? ('Oś cechy: ' + m.os + '.') : ''
        });
      }
      if (sciankaPonadGabaryt(m.margines_mm, g)) {
        return werdyktBladPomiaru({
          shardId: shardId,
          wallMm: m.margines_mm,
          holeDiameterMm: m.srednica_mm,
          dopisek: 'Ścianka większa niż największy gabaryt części — pomiar niemożliwy.'
        });
      }
    }
    let zly = null;
    for (const m of zmierzone) if (!zly || m.margines_mm < zly.margines_mm) zly = m;
    if (zly && zly.margines_mm < SCIANKA_WOKOL_OTWORU_MM - 1e-6) {
      return {
        ok: false,
        code: 'SCIENKA_OTWOR',
        details: {
          shardId: shardId,
          wallMm: zly.margines_mm,
          holeDiameterMm: zly.srednica_mm,
          edgeDistanceMm: zly.margines_mm,
          localReason: 'Tylko ' + zly.margines_mm.toFixed(2) + ' mm materiału wokół otworu Ø'
            + zly.srednica_mm.toFixed(2) + ' mm w punkcie ['
            + zly.punkt_mm.map(function (n) { return n.toFixed(1); }).join(', ')
            + '], wymagane ' + SCIANKA_WOKOL_OTWORU_MM.toFixed(1)
            + ' mm. Mierzone na przekroju prostopadłym do osi ' + zly.os + '.'
        }
      };
    }
    return { ok: true };
  }
  const cechy = (spec && spec.cechy) || [];
  if (!g || !g.min || !g.max) return { ok: true };
  for (let i = 0; i < cechy.length; i++) {
    const c = cechy[i];
    if (!c) continue;
    if (CECHY_Z_OTWOREM.indexOf(c.typ) < 0) continue;
    const d = srednicaOtworu(c);
    if (!(d && c.punkt_mm)) continue;
    const r = d / 2, p = c.punkt_mm;
    const margs = [
      p[0] - r - g.min[0], g.max[0] - (p[0] + r),
      p[1] - r - g.min[1], g.max[1] - (p[1] + r)
    ];
    const edge = Math.min.apply(null, margs);
    if (pomiarFizycznyNiemozliwy(edge) || sciankaPonadGabaryt(edge, g)) {
      return werdyktBladPomiaru({
        shardId: shardId,
        wallMm: +(+edge).toFixed(3),
        holeDiameterMm: +(+d).toFixed(3),
        dopisek: sciankaPonadGabaryt(edge, g)
          ? 'Ścianka większa niż największy gabaryt części — szacunek z gabarytu.'
          : 'Szacunek z gabarytu (bbox), bez pomiaru konturu.'
      });
    }
    if (edge < SCIANKA_WOKOL_OTWORU_MM - 1e-6) {
      const wallMm = +edge.toFixed(3);
      return {
        ok: false,
        code: 'SCIENKA_OTWOR',
        details: {
          shardId: shardId,
          wallMm: wallMm,
          holeDiameterMm: +(+d).toFixed(3),
          edgeDistanceMm: wallMm,
          localReason: 'Mniej niż ' + SCIANKA_WOKOL_OTWORU_MM.toFixed(1)
            + ' mm materiału wokół otworu Ø' + d.toFixed(2)
            + ' mm w punkcie [' + p.map(function (n) { return n.toFixed(1); }).join(', ')
            + '] (szacunek z gabarytu, bez pomiaru konturu).'
        }
      };
    }
  }
  return { ok: true };
}

/**
 * Część postawiona na wiórze. Mózg deklaruje orientacja_druku.obrot_xyz_deg i builder
 * ten obrót stosuje, więc obrót wokół złej osi kładzie część na cienkim boku:
 * listwa 220 mm dostała [0,90,0] i stanęła pionowo na śladzie 14 mm, choć bliźniacza
 * listwa z tym samym uzasadnieniem dostała [90,0,0] i leży płasko.
 * Mierzymy gabaryt PO obrocie. Trzy warunki naraz, żeby nie karać uczciwie wysokich
 * części (stojak Ø205×220, wazon 60×60×200): wysoka, wyższa niż 2,5× dłuższy bok
 * śladu i stojąca na boku cieńszym niż czwarta część wysokości.
 */
export function ocenOrientacjeNaSztorc(g, spec, opts) {
  opts = opts || {};
  const shardId = opts.shardId != null ? String(opts.shardId) : String((spec && spec.nazwa) || '');
  if (!g || !g.min || !g.max) return { ok: true };
  const dx = g.max[0] - g.min[0];
  const dy = g.max[1] - g.min[1];
  const dz = g.max[2] - g.min[2];
  if (!(dx > 0 && dy > 0 && dz > 0)) return { ok: true };
  if (dz <= 100) return { ok: true };
  if (dz < 2.5 * Math.max(dx, dy)) return { ok: true };
  if (Math.min(dx, dy) >= 0.25 * dz) return { ok: true };

  const obrot = (spec && spec.orientacja_druku && spec.orientacja_druku.obrot_xyz_deg) || null;
  const slad = dx.toFixed(0) + '×' + dy.toFixed(0);
  return {
    ok: false,
    code: 'ORIENTACJA_NA_SZTORC',
    details: {
      shardId: shardId,
      wysokoscMm: +dz.toFixed(1),
      sladMm: [+dx.toFixed(1), +dy.toFixed(1)],
      obrotDeg: Array.isArray(obrot) ? obrot.slice() : null,
      localReason: 'Część stoi na sztorc: ' + dz.toFixed(0) + ' mm wysokości na śladzie '
        + slad + ' mm'
        + (Array.isArray(obrot) ? (' po obrocie [' + obrot.join(', ') + ']') : '')
        + '. Najdłuższy wymiar poszedł w Z — obrót wykonany wokół złej osi.'
    }
  };
}

/**
 * Bramka toppera. Wzorzec (generator_topper_aniolek.py + pomiar 3MF) nie ma ANI
 * jednej belki przez litery i nic nie wystaje poza obrys płyty poza nogami w dół.
 * Nasz builder sam robi mostek pod linią bazową, więc każda DODATKOWA bryła obok
 * napisu to prawie zawsze belka wstawiona „na oko" w mm — tu ją zatrzymujemy.
 *
 * @param {object} napis  {litery, obrysDokladny, nogi_mm, ...} z napisMesh
 * @param {Array}  obce   [{id, bryla}] bryły „dodaj" postawione obok napisu
 * @param {{CrossSection:*}} env
 */
export function sprawdzDodatkiNapisu(napis, obce, env) {
  const CS = env && env.CrossSection;
  const out = [];
  if (!CS || !napis || !napis.litery || !napis.litery.length) return out;
  const TOL = 2.0;
  const literyCS = CS.ofPolygons(napis.litery, 'Positive');
  const obrysCS = CS.ofPolygons(napis.obrysDokladny, 'Positive');
  const dozwolony = obrysCS.offset(TOL, 'Round', 2, 16);
  try {
    for (const o of obce) {
      const bb = o.bryla.boundingBox();
      const zSr = (bb.min[2] + bb.max[2]) / 2;
      let slad = null;
      try { slad = o.bryla.slice(zSr); } catch (e) { slad = null; }
      if (!slad || slad.isEmpty()) { if (slad) slad.delete(); continue; }

      const przez = slad.intersect(literyCS);
      const polePrzez = Math.abs(przez.area());
      przez.delete();
      if (polePrzez > 1.0) {
        out.push(wpis('blad', 'NAPIS_BELKA',
          'Bryła „' + o.id + '” przechodzi przez litery (' + polePrzez.toFixed(1)
          + ' mm² wspólnego rzutu). Wzorzec toppera nie ma belek przez litery — '
          + 'litery spina mostek pod linią bazową, który silnik robi sam. '
          + 'Usuń tę bryłę albo przesuń ją poniżej mostka.', polePrzez));
      }

      const poza = slad.subtract(dozwolony);
      const polePoza = Math.abs(poza.area());
      poza.delete();
      if (polePoza > 4.0) {
        const pb = slad.bounds();
        out.push(wpis('blad', 'NAPIS_POZA_OBRYSEM',
          'Bryła „' + o.id + '” wystaje poza obrys napisu o więcej niż ' + TOL
          + ' mm (' + polePoza.toFixed(0) + ' mm² poza ramką, zasięg X '
          + pb.min[0].toFixed(0) + '…' + pb.max[0].toFixed(0) + ' mm). '
          + 'Poza obrys wolno wyjść tylko nóżkom w dół — te robi pole nogi_mm.', polePoza));
      }
      slad.delete();
    }
  } finally {
    literyCS.delete();
    obrysCS.delete();
    dozwolony.delete();
  }
  return out;
}

function foldPl(s) {
  return String(s || '').toLowerCase()
    .replace(/ł/g, 'l').replace(/ó/g, 'o').replace(/ą/g, 'a').replace(/ę/g, 'e')
    .replace(/ś/g, 's').replace(/ć/g, 'c').replace(/ń/g, 'n').replace(/[żź]/g, 'z');
}

/** Pole największej dziury (konturu ujemnego) w przekroju — „czy to się nabierze wody". */
function poleDziur(sekcja) {
  let dziury = 0;
  let najw = 0;
  for (const kontur of sekcja.toPolygons()) {
    let a = 0;
    for (let i = 0, n = kontur.length; i < n; i++) {
      const p = kontur[i], q = kontur[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    a /= 2;
    if (a < 0) { dziury += -a; if (-a > najw) najw = -a; }
  }
  return { suma: dziury, najwieksza: najw };
}

/**
 * Bramka tacy/ociekacza: płaska płyta bez rantu nie może dostać PASS.
 * Taca ANDER 550×240 to wanienka — dno 2,4 mm i rant dookoła do 25 mm
 * (SYS_SPEC: „wysokość ścianki razem z dnem = 25 mm, nie 12 mm").
 * Test: w 60% wysokości przekrój musi być JEDNYM zamkniętym rantem z dziurą.
 */
export function sprawdzTace(part, spec) {
  const out = [];
  const blob = foldPl([
    spec && spec.nazwa,
    ((spec && spec.bryly) || []).map(b => b && b.id).join(' ')
  ].filter(Boolean).join(' '));
  // Wkłady ociekacza (grzebień, stelaż, koszyk) to nie wanienki — rantu nie mają i mieć nie muszą.
  const wklad = /grzebien|stelaz|koszyk|insert|wklad|palec|zab-|ramie/.test(blob);
  const jestTaca = !wklad && /\btac[aeoy]|wanienk|rynienk|ociekacz/.test(blob);
  if (!jestTaca) return out;

  const g = gabaryt(part);
  const pole = g.x * g.y;
  if (g.z < 12) {
    out.push(wpis('blad', 'TACA_BEZ_RANTU',
      'Taca ma tylko ' + g.z.toFixed(1) + ' mm wysokości — to płaska płyta, nie wanienka. '
      + 'Ociekacz 550×240: dno 2,4 mm + rant dookoła, razem 25 mm.', g.z));
    return out;
  }
  const z = g.min[2] + g.z * 0.6;
  let sek = null;
  try { sek = part.slice(z); } catch (e) { return out; }
  if (!sek || sek.isEmpty()) { if (sek) sek.delete(); return out; }
  const czesci = sek.decompose();
  const nCzesci = czesci.length;
  for (const c of czesci) c.delete();
  const dz = poleDziur(sek);
  sek.delete();

  if (dz.najwieksza < pole * 0.35) {
    out.push(wpis('blad', 'TACA_BEZ_RANTU',
      'Na wysokości ' + z.toFixed(1) + ' mm przekrój tacy nie zamyka wanienki — '
      + 'największa dziura ' + dz.najwieksza.toFixed(0) + ' mm² przy obrysie '
      + pole.toFixed(0) + ' mm² (' + nCzesci + ' rozłącznych kawałków). '
      + 'Rant musi iść dookoła po WSZYSTKICH czterech bokach, nie tylko po dwóch — '
      + 'inaczej woda wypływa bokiem. Dodaj brakujące ścianki.', dz.najwieksza));
  }
  return out;
}

/**
 * Bramka stojaka żebrowanego: „taki jak Towel_Holder_Ribbed" bez żeber to nie ten projekt.
 * Wzorzec (pomiar): rura Ø120/Ø112 (ścianka 4 mm) × 250 mm, żłobkowanie o amplitudzie
 * 3,74 mm, trzpień Ø33 na gilzę, 433 cm³. Minimum, którego pilnujemy: 6 żeber.
 */
export function sprawdzZebrowanie(spec) {
  const out = [];
  const blob = foldPl([spec && spec.nazwa, spec && spec.opis_slowny].filter(Boolean).join(' '));
  // Tylko stojaki/uchwyty — „rozważ żebra" w uwagach tacy nie jest obietnicą żebrowania.
  const jestStojak = /stojak|uchwyt|holder|kosz na |podajnik|rolk|recznik|papier/.test(blob);
  const chceZebra = /zeberk|zebrow|zebrowan|ribbed|zlobk/.test(blob);
  if (!jestStojak || !chceZebra) return out;
  const bryly = (spec && spec.bryly) || [];
  const zeber = bryly.filter(b => /zeberk|zebro|zebra|rib|palec|prec|pret|listw/.test(foldPl(b && b.id))).length
    + ((spec && spec.cechy) || []).filter(c => c && c.typ === 'zebro').length;
  if (zeber < 6) {
    out.push(wpis('blad', 'STOJAK_BEZ_ZEBER',
      'SPEC obiecuje żebrowanie („' + (spec.nazwa || '') + '”), a ma tylko ' + zeber
      + ' żeber. Wzorzec Towel_Holder_Ribbed ma żłobkowanie na całym obwodzie '
      + '(ścianka 4 mm, amplituda ~3,7 mm) — daj min. 6 żeber albo nie pisz „żebrowany”.',
      zeber));
  }
  return out;
}

/**
 * @param {*} part Manifold
 * @param {object} dekl deklaracja (bbox z pomiaru po budowie)
 * @param {object} spec znormalizowany SPEC
 * @param {{ wmin?: number, wylaczBramki?: string[] }} opts wmin 0.8 (nośna) albo 0.42
 */
export function sprawdzBramke(part, dekl, spec, opts = {}) {
  const out = [];
  const blad = (kod, tekst, n) => out.push(wpis('blad', kod, tekst, n));
  const ostrz = (kod, tekst, n) => out.push(wpis('ostrzezenie', kod, tekst, n));

  if (part.isEmpty()) blad('PUSTA', 'Bryła jest pusta — operacje się wyzerowały.');
  const vol = part.volume();
  if (vol <= 0) blad('OBJETOSC', 'Objętość zero lub ujemna.');

  // Self-intersection: Manifold gwarantuje rozmaitość wyniku CSG — nie liczymy
  // przecięć siatki osobno. Szczelność / błąd topologii = part.status()
  // (enum bundli: string "NoError" albo kod ManifoldError, np. "NotManifold").
  const topo = (dekl && dekl.topologia) || {};
  const zamierzona = (spec && Array.isArray(spec.czesci) && spec.czesci.length)
    ? spec.czesci.length
    : 1;
  const czesciN = (typeof topo.czesci_n === 'number' && Number.isFinite(topo.czesci_n))
    ? topo.czesci_n
    : null;
  if (czesciN != null && czesciN !== zamierzona) {
    blad('BRYLY',
      'Liczba brył ' + czesciN + ' ≠ zamierzona ' + zamierzona
      + (zamierzona === 1
        ? ' (jedna część). Rozłączne powłoki to zestaw — podziel SPEC na czesci albo złącz geometrię.'
        : ' (zestaw).'),
      czesciN);
  }
  const stOk = statusManifoldNoError(topo.status);
  if (stOk === false) {
    blad('TOPOLOGIA',
      'Manifold.status() = ' + String(topo.status) + ' (oczekiwane NoError). '
      + 'Nie liczę self-intersection osobno — bundla rzuca ManifoldError albo zwraca ten status.',
      0);
  }

  const g = gabaryt(part);
  const tol = (dekl && typeof dekl.tolerance_mm === 'number') ? dekl.tolerance_mm : 0.2;
  if (dekl && dekl.bbox) {
    for (const os of ['x', 'y', 'z']) {
      const d = Math.abs(g[os] - dekl.bbox[os]);
      if (d > tol) {
        blad('GABARYT',
          `Oś ${os.toUpperCase()}: zbudowano ${g[os].toFixed(2)} mm, zadeklarowano ${dekl.bbox[os].toFixed(2)} mm, różnica ${d.toFixed(2)} mm.`);
      }
    }
  }
  if (g.x > 256 || g.y > 256 || g.z > 256) {
    blad('PLYTA',
      `Część nie mieści się na płycie 256 × 256 × 256 mm (${g.x.toFixed(1)} × ${g.y.toFixed(1)} × ${g.z.toFixed(1)} mm). ` +
      'Podziel na części z kołkami Ø5 × 10 mm (rozdział 14.13).');
  }

  const wmin = opts.wmin == null ? 0.8 : opts.wmin;
  const cienkieNosna = cienkieScianki(part, 0.8, 12);
  const cienkie = wmin < 0.8 ? cienkieScianki(part, 0.42, 12) : cienkieNosna;
  const kodSci = 'SCIANKA';
  if (wmin >= 0.8) {
    if (cienkieNosna.length) {
      const opis = cienkieNosna.map(x => `Z=${x.z} mm ubytek ${x.procent}%`).join('; ');
      blad(kodSci, `Ścianka cieńsza niż 0,8 mm (nośna). ${opis}. Świadomie przełącz na 0,42 mm, jeśli ścianka nie przenosi obciążenia.`, cienkieNosna[0].procent);
    }
  } else if (cienkie.length) {
    const opis = cienkie.map(x => `Z=${x.z} mm ubytek ${x.procent}%`).join('; ');
    blad(kodSci, `Ścianka cieńsza niż 0,42 mm. ${opis}.`, cienkie[0].procent);
  } else if (cienkieNosna.length) {
    const opis = cienkieNosna.map(x => `Z=${x.z} mm ubytek ${x.procent}%`).join('; ');
    ostrz(kodSci, `Ta ścianka wyjdzie, ale nie uniesie obciążenia. ${opis}.`, cienkieNosna[0].procent);
  }

  const nw = nawisy(part);
  if (nw.najgorszy > 45 && nw.procentZlych > 2) {
    ostrz('NAWIS',
      `Nawis ${nw.najgorszy}° pod półką, ${nw.procentZlych}% powierzchni — dodaj żebro albo podpory / fazę 45°.`,
      nw.najgorszy);
  }
  if (nw.najgorszy > 50) {
    ostrz('NAWIS_50',
      'Nawis ' + nw.najgorszy + '° (próg 50°).'
      + propozycjaOrientacjiTekst(part, spec, opts)
      + ' Modelu nie obracam automatycznie.',
      nw.najgorszy);
  }
  if (nw.krytyczny) {
    ostrz('NAWIS_SPOJNY',
      `Spójny płat nawisu ma ${nw.najwiekszySpojny.toFixed(1)} mm² — sprawdź orientację w slicerze. ` +
      'Pojedyncze kosmetyczne trójkąty są pomijane.',
      nw.najwiekszySpojny);
  }
  const deklaracjaBezPodpor = opts.bezPodpor === true
    || /\[\s*BEZ\s+PODP[OÓ]R\s*\]/i.test([
      spec && spec.nazwa,
      spec && spec.uwagi_do_druku,
      spec && spec.orientacja_druku && spec.orientacja_druku.uzasadnienie
    ].filter(Boolean).join(' '));
  if (deklaracjaBezPodpor && nw.krytyczny) {
    blad('ORIENTACJA_DRUKU',
      `Plik oznaczony [BEZ PODPÓR] ma spójny nawis ${nw.najwiekszySpojny.toFixed(1)} mm². ` +
      'Nie eksportuję fałszywego PASS — sprawdź orientację albo zmień projekt.',
      nw.najwiekszySpojny);
  } else if (spec && spec.podpory && spec.podpory.wymagane === false && nw.krytyczny) {
    ostrz('PODPORY',
      `SPEC mówi brak podpór, ale jest spójny nawis ${nw.najwiekszySpojny.toFixed(1)} mm². ` +
      'W Studio sprawdź podgląd cięcia — nie ufaj samej deklaracji.',
      nw.najwiekszySpojny);
  }
  const brimZadeklarowany = spec && spec.brim && spec.brim.wymagany === true;
  if (nw.poleNaStole < 100 && g.z > 40 && !brimZadeklarowany) {
    ostrz('STOL',
      `Styk ze stołem ${nw.poleNaStole} mm² przy wysokości ${g.z.toFixed(1)} mm — ryzyko odklejenia, rozważ brim.`,
      nw.poleNaStole);
  }

  const mat = spec && spec.material;
  const cechy = (spec && spec.cechy) || [];
  for (const c of cechy) {
    if (c.typ === 'otwor' || c.typ === 'otwor_pod_wkladke' || c.typ === 'poglebienie' || c.typ === 'poglebienie_stozkowe') {
      const d = c.srednica_mm || c.srednica_otworu_mm;
      if (d && d < 2.0) {
        blad('OTWOR_MALY',
          'Średnica otworu ' + d.toFixed(2) + ' mm < 2,0 mm — za mała na P2S (błąd, nie ostrzeżenie).',
          d);
      }
      if (d && (d < 1.5 || d > 30)) {
        ostrz('OTWOR', `Średnica otworu ${d.toFixed(2)} mm poza zakresem 1,5–30 mm.`);
      }
    }
    if (c.typ === 'kieszen' && c.promien_naroza_mm != null && c.promien_naroza_mm < 2.2 && c.rola === 'pasowanie') {
      ostrz('NAROZE', `promien_naroza_mm ${c.promien_naroza_mm} < 2,2 mm przy roli pasowanie — ostry narożnik wewnętrzny nie istnieje pod dyszą.`);
    }
    if (c.typ === 'zatrzask') {
      if (c.grubosc_ramienia_mm != null && (c.grubosc_ramienia_mm < 2.5 || c.grubosc_ramienia_mm > 3.5)) {
        ostrz('ZATRZASK_GRUBOSC', `Grubość ramienia ${c.grubosc_ramienia_mm} mm poza 2,5–3,5 mm.`);
      }
      if (mat === 'PLA') {
        ostrz('ZATRZASK_PLA', 'PLA pęka przy wielokrotnym zginaniu — do zatrzasków PETG.');
      }
    }
  }
  const sci = ocenScienkeOtwor(g, spec);
  if (!sci.ok) {
    blad(sci.code || 'SCIENKA_OTWOR', sci.details.localReason, sci.details.wallMm);
  }

  const skip = new Set((opts && opts.wylaczBramki) || []);
  if (!skip.has('TACA_BEZ_RANTU')) {
    for (const w of sprawdzTace(part, spec)) out.push(w);
  }
  if (!skip.has('STOJAK_BEZ_ZEBER')) {
    for (const w of sprawdzZebrowanie(spec)) out.push(w);
  }

  const cm3 = vol / 1000;
  if (cm3 > 200) {
    const gPetg = cm3 * 0.43;
    const godz = cm3 / 33;
    ostrz('OBJETOSC_DUZA',
      `To jest ~${gPetg.toFixed(0)} g PETG i ~${godz.toFixed(0)} h — rozważ żebra zamiast litego przekroju (${cm3.toFixed(0)} cm³).`,
      cm3);
  } else if (cm3 > 80) {
    const gPetg = cm3 * 0.44;
    const godz = cm3 / 26;
    ostrz('OBJETOSC',
      `${cm3.toFixed(0)} cm³ ≈ ${gPetg.toFixed(0)} g PETG, ~${godz.toFixed(0)} h — rozważ żebra.`,
      cm3);
  }

  const maBlad = out.some(x => x.poziom === 'blad');
  return { wpisy: out, eksportOk: !maBlad, nawisy: nw, cienkie, gabaryt: g, objetosc_mm3: vol };
}
