/**
 * Zapis 3MF — trzy wpisy ZIP, unit=millimeter.
 * mtime: 0 rzuca „date not in range 1980-2099” — zawsze podawaj datę.
 */
async function fflateApi() {
  if (globalThis.fflate && typeof globalThis.fflate.zipSync === 'function') return globalThis.fflate;
  return import('fflate');
}

const CT_XML =
`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

const RELS_XML =
`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rel0" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

const esc3 = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r3 = n => { const s = Math.round(n * 1e6) / 1e6; return Object.is(s, -0) ? 0 : s; };

function polaMesh(mesh) {
  const np = Number(mesh && mesh.numProp) || 3;
  const vp = mesh && mesh.vertProperties;
  const tv = mesh && mesh.triVerts;
  if (!vp || !tv || vp.length % np || tv.length % 3) {
    throw new Error('Niepoprawna siatka: wymagane vertProperties/triVerts.');
  }
  return { np, vp, tv };
}

export function bboxMesh(mesh) {
  const { np, vp } = polaMesh(mesh);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vp.length; i += np) {
    for (let k = 0; k < 3; k++) {
      const v = Number(vp[i + k]);
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  const size = max.map((v, i) => v - min[i]);
  return { min, max, x: size[0], y: size[1], z: size[2] };
}

/**
 * Fizycznie obraca wierzchołki (kolejno X, Y, Z), bez zmiany skali.
 * Domyślnie przesuwa wyłącznie Z tak, aby minZ było równe 0.
 */
export function obrocMesh(mesh, obrotXyzDeg = [0, 0, 0], opcje = {}) {
  const { np, vp, tv } = polaMesh(mesh);
  const rot = przygotujObrot(obrotXyzDeg);
  const out = new Float64Array((vp.length / np) * 3);
  let minZ = Infinity;
  for (let i = 0, j = 0; i < vp.length; i += np, j += 3) {
    const [x3, y3, z3] = obrocWektor(
      [Number(vp[i]), Number(vp[i + 1]), Number(vp[i + 2])],
      rot
    );
    out[j] = Math.abs(x3) < 1e-12 ? 0 : x3;
    out[j + 1] = Math.abs(y3) < 1e-12 ? 0 : y3;
    out[j + 2] = Math.abs(z3) < 1e-12 ? 0 : z3;
    if (out[j + 2] < minZ) minZ = out[j + 2];
  }
  const ustawNaStole = opcje.minZZero !== false;
  const dz = ustawNaStole ? -minZ : 0;
  if (dz) {
    for (let i = 2; i < out.length; i += 3) {
      out[i] = Math.abs(out[i] + dz) < 1e-12 ? 0 : out[i] + dz;
    }
  }
  const wynik = {
    numProp: 3,
    vertProperties: out,
    triVerts: tv instanceof Uint32Array ? new Uint32Array(tv) : Uint32Array.from(tv)
  };
  return { mesh: wynik, obrot_xyz_deg: obrotXyzDeg.slice(0, 3), przesuniecie_z_mm: dz, bbox: bboxMesh(wynik) };
}

function przygotujObrot(obrotXyzDeg) {
  const r = [0, 1, 2].map(i => Number(obrotXyzDeg[i] || 0) * Math.PI / 180);
  const [sx, sy, sz] = r.map(Math.sin), [cx, cy, cz] = r.map(Math.cos);
  return { sx, sy, sz, cx, cy, cz };
}

function obrocWektor(p, rot) {
  const [x0, y0, z0] = p;
  const x1 = x0, y1 = y0 * rot.cx - z0 * rot.sx, z1 = y0 * rot.sx + z0 * rot.cx;
  const x2 = x1 * rot.cy + z1 * rot.sy, y2 = y1, z2 = -x1 * rot.sy + z1 * rot.cy;
  return [x2 * rot.cz - y2 * rot.sz, x2 * rot.sz + y2 * rot.cz, z2];
}

export function obrocPunkt(p, obrotXyzDeg = [0, 0, 0], przesuniecieZMm = 0) {
  const q = obrocWektor(p.map(Number), przygotujObrot(obrotXyzDeg));
  q[2] += Number(przesuniecieZMm || 0);
  return q.map(v => Math.abs(v) < 1e-12 ? 0 : v);
}

export function transformujCecheWalcowa(cecha, obrotXyzDeg, przesuniecieZMm = 0) {
  const { iOs, poprzeczne } = opisOsi(cecha.os);
  const s = cecha.srodek || [cecha.cx, cecha.cy];
  const punkt = t => {
    const p = [0, 0, 0];
    p[iOs] = Number(t);
    p[poprzeczne[0]] = Number(s[0]);
    p[poprzeczne[1]] = Number(s[1]);
    return obrocPunkt(p, obrotXyzDeg, przesuniecieZMm);
  };
  const p0 = punkt(cecha.od_mm), p1 = punkt(cecha.do_mm);
  const d = p1.map((v, i) => v - p0[i]);
  let nowaOs = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(d[i]) > Math.abs(d[nowaOs])) nowaOs = i;
  const nowePoprzeczne = [0, 1, 2].filter(i => i !== nowaOs);
  return {
    ...cecha,
    os: ['x', 'y', 'z'][nowaOs],
    srodek: nowePoprzeczne.map(i => (p0[i] + p1[i]) / 2),
    od_mm: Math.min(p0[nowaOs], p1[nowaOs]),
    do_mm: Math.max(p0[nowaOs], p1[nowaOs]),
    r: Number(cecha.r ?? cecha.srednica_mm / 2),
    srednica_mm: Number(cecha.srednica_mm ?? 2 * cecha.r)
  };
}

function triDane(vp, tv, t) {
  const ia = tv[t] * 3, ib = tv[t + 1] * 3, ic = tv[t + 2] * 3;
  const A = [vp[ia], vp[ia + 1], vp[ia + 2]];
  const B = [vp[ib], vp[ib + 1], vp[ib + 2]];
  const C = [vp[ic], vp[ic + 1], vp[ic + 2]];
  const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  const n = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0]
  ];
  const len = Math.hypot(n[0], n[1], n[2]);
  return { A, B, C, n, len, pole: len / 2, nz: len > 1e-12 ? n[2] / len : 0 };
}

/**
 * Niezależna analiza siatki w orientacji druku.
 * Odróżnia spójny płat wymagający podpory od pojedynczych kosmetycznych trójkątów.
 */
export function analizujNawisyMesh(mesh, opcje = {}) {
  const src = mesh.numProp === 3 ? mesh : obrocMesh(mesh, [0, 0, 0], { minZZero: false }).mesh;
  const { vp, tv } = polaMesh(src);
  const bb = bboxMesh(src);
  const warstwa = Number(opcje.warstwa_mm ?? 0.2);
  const kat = Number(opcje.kat_krytyczny_deg ?? 45);
  const minPole = Number(opcje.min_spojne_pole_mm2 ?? 20);
  const minRozmiar = Number(opcje.min_spojny_rozmiar_mm ?? 3);
  const progNz = Math.sin(kat * Math.PI / 180);
  let poleRazem = 0, poleZle = 0, poleNaStole = 0, najgorszy = 0;
  const zle = [];
  for (let t = 0; t < tv.length; t += 3) {
    const d = triDane(vp, tv, t);
    if (d.len < 1e-12) continue;
    poleRazem += d.pole;
    const maxZ = Math.max(d.A[2], d.B[2], d.C[2]);
    const minZ = Math.min(d.A[2], d.B[2], d.C[2]);
    const naStole = maxZ <= bb.min[2] + warstwa + 1e-6;
    if (naStole && d.nz < -0.99) {
      poleNaStole += d.pole * Math.abs(d.nz);
      continue;
    }
    if (d.nz >= -1e-8) continue;
    const odPionu = Math.asin(Math.min(1, -d.nz)) * 180 / Math.PI;
    if (odPionu > najgorszy) najgorszy = odPionu;
    if (-d.nz <= progNz + 1e-9) continue;
    poleZle += d.pole;
    zle.push({
      face: t / 3, t, pole: d.pole,
      min: [
        Math.min(d.A[0], d.B[0], d.C[0]),
        Math.min(d.A[1], d.B[1], d.C[1]),
        minZ
      ],
      max: [
        Math.max(d.A[0], d.B[0], d.C[0]),
        Math.max(d.A[1], d.B[1], d.C[1]),
        maxZ
      ]
    });
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
  const krawedzie = new Map();
  zle.forEach((f, i) => {
    const a = tv[f.t], b = tv[f.t + 1], c = tv[f.t + 2];
    for (const [u0, v0] of [[a, b], [b, c], [c, a]]) {
      const u = Math.min(u0, v0), v = Math.max(u0, v0);
      const key = `${u}:${v}`;
      const prev = krawedzie.get(key);
      if (prev == null) krawedzie.set(key, i);
      else polacz(i, prev);
    }
  });
  const grupy = new Map();
  zle.forEach((f, i) => {
    const r = root(i);
    let g = grupy.get(r);
    if (!g) {
      g = { pole_mm2: 0, trojkatow: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      grupy.set(r, g);
    }
    g.pole_mm2 += f.pole;
    g.trojkatow++;
    for (let k = 0; k < 3; k++) {
      if (f.min[k] < g.min[k]) g.min[k] = f.min[k];
      if (f.max[k] > g.max[k]) g.max[k] = f.max[k];
    }
  });
  const spojne = [...grupy.values()].map(g => {
    const rozmiar = g.max.map((v, i) => v - g.min[i]);
    const rozneOsie = rozmiar.filter(v => v >= minRozmiar).length;
    return {
      pole_mm2: +g.pole_mm2.toFixed(2),
      trojkatow: g.trojkatow,
      min: g.min.map(r3), max: g.max.map(r3),
      rozmiar_mm: rozmiar.map(r3),
      krytyczny: g.pole_mm2 >= minPole && rozneOsie >= 2
    };
  }).sort((a, b) => b.pole_mm2 - a.pole_mm2);
  const naj = spojne[0] || null;
  return {
    najgorszy: +najgorszy.toFixed(1),
    procentZlych: poleRazem > 0 ? +(100 * poleZle / poleRazem).toFixed(2) : 0,
    poleZlych: +poleZle.toFixed(2),
    poleNaStole: +poleNaStole.toFixed(2),
    najwiekszySpojny: naj ? naj.pole_mm2 : 0,
    spojne,
    krytyczny: spojne.some(g => g.krytyczny),
    bbox: bb
  };
}

function opisOsi(os) {
  const a = String(os || '').replace('-', '').toLowerCase();
  const iOs = { x: 0, y: 1, z: 2 }[a];
  if (iOs == null) throw new Error(`Nieznana oś cechy: ${os}`);
  return { a, iOs, poprzeczne: [0, 1, 2].filter(i => i !== iOs) };
}

/**
 * Mierzy wyłącznie spójne powierzchnie wewnętrzne wskazanych otworów/gniazd.
 * Dzięki temu duży poziomy otwór nie ginie w globalnym progu procentowym.
 */
export function analizujNawisCechWalcowych(mesh, cechy, obrotXyzDeg = [0, 0, 0], opcje = {}) {
  const { np, vp, tv } = polaMesh(mesh);
  const rot = przygotujObrot(obrotXyzDeg);
  const progNz = Math.sin(Number(opcje.kat_krytyczny_deg ?? 45) * Math.PI / 180);
  const tolR = Number(opcje.tolerancja_promienia_mm ?? 0.65);
  const wyniki = [];
  for (const c of cechy || []) {
    const { iOs, poprzeczne } = opisOsi(c.os);
    const srodek = c.srodek || [c.cx, c.cy];
    const r = Number(c.r ?? c.srednica_mm / 2);
    const od = Math.min(Number(c.od_mm), Number(c.do_mm));
    const doMm = Math.max(Number(c.od_mm), Number(c.do_mm));
    if (!Number.isFinite(r) || !Number.isFinite(od) || !Number.isFinite(doMm)
      || !Number.isFinite(srodek[0]) || !Number.isFinite(srodek[1])) continue;
    let poleSciany = 0, poleRyzyka = 0, trojkatow = 0, ryzykownych = 0;
    const katy = new Set();
    for (let t = 0; t < tv.length; t += 3) {
      const idx = [tv[t], tv[t + 1], tv[t + 2]];
      const P = idx.map(id => [
        Number(vp[id * np]), Number(vp[id * np + 1]), Number(vp[id * np + 2])
      ]);
      const q = [
        (P[0][0] + P[1][0] + P[2][0]) / 3,
        (P[0][1] + P[1][1] + P[2][1]) / 3,
        (P[0][2] + P[1][2] + P[2][2]) / 3
      ];
      if (q[iOs] < od + 0.25 || q[iOs] > doMm - 0.25) continue;
      const du = q[poprzeczne[0]] - Number(srodek[0]);
      const dv = q[poprzeczne[1]] - Number(srodek[1]);
      const rr = Math.hypot(du, dv);
      if (Math.abs(rr - r) > tolR) continue;
      const d = triDane(
        Float64Array.from(P.flat()),
        Uint32Array.from([0, 1, 2]),
        0
      );
      if (d.len < 1e-12) continue;
      const n = d.n.map(v => v / d.len);
      if (Math.abs(n[iOs]) > 0.25) continue;
      const radialDot = n[poprzeczne[0]] * du + n[poprzeczne[1]] * dv;
      if (radialDot >= -0.35 * rr) continue;
      const nr = obrocWektor(n, rot);
      poleSciany += d.pole;
      trojkatow++;
      katy.add(Math.round(Math.atan2(dv, du) * 180 / Math.PI / 5));
      if (nr[2] < -progNz - 1e-9) {
        poleRyzyka += d.pole;
        ryzykownych++;
      }
    }
    wyniki.push({
      id: c.id ?? null,
      os: String(c.os),
      srednica_mm: +(2 * r).toFixed(3),
      od_mm: od,
      do_mm: doMm,
      pole_sciany_mm2: +poleSciany.toFixed(2),
      pole_ryzyka_mm2: +poleRyzyka.toFixed(2),
      trojkatow,
      ryzykownych,
      pokrycie_kata_deg: katy.size * 5,
      krytyczny: poleRyzyka >= Number(opcje.min_pole_cechy_mm2 ?? 20)
        && ryzykownych >= Number(opcje.min_trojkatow_cechy ?? 8)
    });
  }
  return {
    cechy: wyniki,
    pole_ryzyka_mm2: +wyniki.reduce((s, x) => s + x.pole_ryzyka_mm2, 0).toFixed(2),
    krytyczny: wyniki.some(x => x.krytyczny)
  };
}

export function rotacjeOsiowe() {
  const out = [], seen = new Set();
  for (const x of [0, 90, 180, 270]) {
    for (const y of [0, 90, 180, 270]) {
      for (const z of [0, 90, 180, 270]) {
        const r = przygotujObrot([x, y, z]);
        const key = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
          .map(v => obrocWektor(v, r).map(n => Math.round(n)).join(',')).join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([x, y, z]);
      }
    }
  }
  return out;
}

export function wybierzOrientacjeBezPodpor(mesh, cechy = [], opcje = {}) {
  const ocenione = rotacjeOsiowe().map(obrot => {
    const tr = obrocMesh(mesh, obrot);
    const nawisy = analizujNawisyMesh(tr.mesh, opcje);
    const walce = analizujNawisCechWalcowych(mesh, cechy, obrot, opcje);
    const krytycznePole = nawisy.spojne.filter(g => g.krytyczny)
      .reduce((s, g) => s + g.pole_mm2, 0);
    const maCechy = walce.cechy.length > 0;
    const score = walce.pole_ryzyka_mm2 * -100000
      + nawisy.poleNaStole * (maCechy ? 100 : 10)
      + krytycznePole * (maCechy ? -0.1 : -100)
      + nawisy.poleZlych * (maCechy ? -0.05 : -2)
      - tr.bbox.z * 0.01;
    return {
      obrot_xyz_deg: obrot,
      przesuniecie_z_mm: tr.przesuniecie_z_mm,
      bbox: tr.bbox,
      nawisy,
      walce,
      score
    };
  }).sort((a, b) => b.score - a.score);
  return { ...ocenione[0], kandydaci: ocenione };
}

export function sprawdzOrientacjeBezPodpor(mesh, cechy = [], obrotXyzDeg = [0, 0, 0], opcje = {}) {
  const tr = obrocMesh(mesh, obrotXyzDeg);
  const nawisy = analizujNawisyMesh(tr.mesh, opcje);
  const walce = analizujNawisCechWalcowych(mesh, cechy, obrotXyzDeg, opcje);
  const minKontakt = Number(opcje.min_pole_styku_mm2 ?? 100);
  const wymagajGlobalnie = opcje.wymagaj_braku_spojnych_nawisow !== false;
  const maCechy = walce.cechy.length > 0;
  const stabilny = nawisy.poleNaStole >= minKontakt;
  const cechyBezPodpor = maCechy && !walce.krytyczny;
  const globalnieBezPodpor = !nawisy.krytyczny;
  const kod = !stabilny ? 'NIESTABILNY_STYK'
    : !maCechy ? 'SPRAWDZ_ORIENTACJE'
      : !cechyBezPodpor ? 'PODPORA_W_CESZE_MIERZONEJ'
        : wymagajGlobalnie && !globalnieBezPodpor ? 'SPRAWDZ_ORIENTACJE'
          : 'PASS';
  return {
    pass: stabilny && cechyBezPodpor && (!wymagajGlobalnie || globalnieBezPodpor),
    kod,
    stabilny,
    cechyBezPodpor,
    globalnieBezPodpor,
    wymagaj_braku_spojnych_nawisow: wymagajGlobalnie,
    obrot_xyz_deg: obrotXyzDeg.slice(0, 3),
    przesuniecie_z_mm: tr.przesuniecie_z_mm,
    bbox: tr.bbox,
    nawisy,
    walce,
    komunikat: kod === 'PASS'
      ? wymagajGlobalnie
        ? 'Brak spójnych krytycznych nawisów; cechy mierzone są bez podpór, a styk z płytą jest stabilny.'
        : 'Potwierdzone kryterium cech mierzonych: brak podpory w cechach i stabilny styk.'
      : kod === 'PODPORA_W_CESZE_MIERZONEJ'
        ? 'Spójny nawis przecina mierzoną powierzchnię walcową — sprawdź orientację; nie oznaczaj pliku jako bez podpór.'
        : kod === 'NIESTABILNY_STYK'
          ? `Styk z płytą ${nawisy.poleNaStole.toFixed(1)} mm² jest mniejszy niż ${minKontakt.toFixed(1)} mm².`
          : maCechy
            ? `Cechy mierzone są bez podpór, ale pozostaje spójny nawis ${nawisy.najwiekszySpojny.toFixed(1)} mm² poza nimi — sprawdź orientację w slicerze.`
            : 'Brak wskazanych cech mierzonych — nie potwierdzam orientacji bez podpór; sprawdź orientację w slicerze.'
  };
}

export function wybierzObrotOsiDoZ(mesh, os) {
  const axis = String(os || '').replace('-', '').toLowerCase();
  const kandydaci = axis === 'y'
    ? [[90, 0, 0], [-90, 0, 0]]
    : axis === 'x'
      ? [[0, -90, 0], [0, 90, 0]]
      : [[0, 0, 0], [180, 0, 0]];
  const ocenione = kandydaci.map(obrot => {
    const tr = obrocMesh(mesh, obrot);
    const analiza = analizujNawisyMesh(tr.mesh);
    const karaKrytyczna = analiza.spojne.filter(g => g.krytyczny)
      .reduce((s, g) => s + g.pole_mm2, 0);
    const score = analiza.poleNaStole * 10 - analiza.poleZlych * 2
      - karaKrytyczna * 1000 - tr.bbox.z * 0.01;
    return {
      obrot_xyz_deg: obrot,
      przesuniecie_z_mm: tr.przesuniecie_z_mm,
      bbox: tr.bbox,
      analiza,
      score
    };
  }).sort((a, b) => b.score - a.score);
  return { ...ocenione[0], kandydaci: ocenione };
}

function siatkaXml(mesh) {
  const np = mesh.numProp || 3, vp = mesh.vertProperties, tv = mesh.triVerts;
  const nv = vp.length / np;
  const V = new Array(nv);
  for (let i = 0; i < nv; i++)
    V[i] = `<vertex x="${r3(vp[i * np])}" y="${r3(vp[i * np + 1])}" z="${r3(vp[i * np + 2])}"/>`;
  const T = new Array(tv.length / 3);
  for (let i = 0; i < tv.length; i += 3)
    T[i / 3] = `<triangle v1="${tv[i]}" v2="${tv[i + 1]}" v3="${tv[i + 2]}"/>`;
  return { V, T };
}

export async function mesh3MF(mesh, opcje = {}) {
  const { zipSync, strToU8 } = await fflateApi();
  const nazwa = opcje.nazwa || 'czesc';
  const obracac = Array.isArray(opcje.obrot_xyz_deg)
    || opcje.minZZero === true;
  const gotowy = obracac
    ? obrocMesh(mesh, opcje.obrot_xyz_deg || [0, 0, 0], { minZZero: opcje.minZZero !== false }).mesh
    : mesh;
  const { V, T } = siatkaXml(gotowy);

  const model =
`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <metadata name="Application">Przewodnik P2S</metadata>
 <metadata name="Title">${esc3(nazwa)}</metadata>
 <metadata name="Description">${esc3(opisHintStudio(opcje.spec))}</metadata>
 <resources>
  <object id="1" type="model" name="${esc3(nazwa)}">
   <mesh>
    <vertices>${V.join('')}</vertices>
    <triangles>${T.join('')}</triangles>
   </mesh>
  </object>
 </resources>
 <build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></build>
</model>`;

  return zipSync({
    '[Content_Types].xml': strToU8(CT_XML),
    '_rels/.rels': strToU8(RELS_XML),
    '3D/3dmodel.model': strToU8(model)
  }, { level: 6, mtime: opcje.mtime || new Date(2020, 0, 1) });
}

function transformItem3mf(t) {
  const a = Array.isArray(t) && t.length === 12 ? t : [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  return a.map(r3).join(' ');
}

export async function mesh3MFWiele(czesci, opcje = {}) {
  const { zipSync, strToU8 } = await fflateApi();
  const obiekty = [], itemy = [];
  let kursorX = 0;
  const ODSTEP = opcje.odstep_mm ?? 8;
  const zachowaj = opcje.zachowajPolozenie === true;

  czesci.forEach((cz, i) => {
    const id = i + 1;
    const src = cz.mesh || cz;
    const rot = cz.obrot_xyz_deg || opcje.obrot_xyz_deg;
    const m = (rot || opcje.minZZero === true)
      ? obrocMesh(src, rot || [0, 0, 0], { minZZero: opcje.minZZero !== false }).mesh
      : src;
    const { V, T } = siatkaXml(m);
    obiekty.push(
`  <object id="${id}" type="model" name="${esc3(cz.nazwa || 'czesc' + id)}">
   <mesh>
    <vertices>${V.join('')}</vertices>
    <triangles>${T.join('')}</triangles>
   </mesh>
  </object>`);
    if (zachowaj || cz.zachowajPolozenie) {
      itemy.push(`<item objectid="${id}" transform="${transformItem3mf(cz.transform)}" printable="1"/>`);
      return;
    }
    const b = cz.bbox || m.bbox;
    const min0 = Array.isArray(b.min) ? b.min[0] : 0;
    const max0 = Array.isArray(b.max) ? b.max[0] : (b.x || 0);
    const dx = kursorX - min0;
    kursorX += (max0 - min0) + ODSTEP;
    itemy.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${r3(dx)} 0 0" printable="1"/>`);
  });

  const model =
`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <metadata name="Application">Przewodnik P2S</metadata>
 <metadata name="Title">${esc3(opcje.nazwa || 'projekt')}</metadata>
 <metadata name="Description">${esc3(opisHintStudio(opcje.spec))}</metadata>
 <resources>
${obiekty.join('\n')}
 </resources>
 <build>${itemy.join('')}</build>
</model>`;

  return zipSync({
    '[Content_Types].xml': strToU8(CT_XML),
    '_rels/.rels': strToU8(RELS_XML),
    '3D/3dmodel.model': strToU8(model)
  }, { level: 6, mtime: opcje.mtime || new Date(2020, 0, 1) });
}

export function nazwa3mf(spec, wersja) {
  const n = String((spec && spec.nazwa) || 'czesc').replace(/[^\w\-]+/g, '_');
  return `${n}_v${wersja || 1}.3mf`;
}

const TYP_PODPORY_PL = {
  brak: 'nie',
  tylko_na_plycie: 'tak — tylko na płycie (on build plate only)',
  organiczne: 'tak — organiczne',
  drzewiaste: 'tak — drzewiaste (tree)',
  normalne: 'tak — normalne'
};

function planZSpec(spec) {
  if (!spec) return null;
  if (spec.podpory && spec.brim && spec.orientacja_druku) return spec;
  const cz = (spec.czesci || []).find(c => c && c.podpory && c.brim && c.orientacja_druku);
  return cz || spec;
}

export function nazwaFilamentuKalibrowane(material) {
  const m = String(material || '').toUpperCase();
  if (m === 'PETG') return 'KALIBROWANE PETG';
  if (m === 'PLA') return 'KALIBROWANE PLA+ albo KALIBROWANE SUNLU PLA Classic Słoneczny';
  if (m === 'ABS') return 'KALIBROWANE ABS (albo zapas nowe)';
  if (m === 'TPU') return 'TPU z zewnętrznej szpuli (nie profil AMS 95A HF)';
  return 'KALIBROWANE (Twój profil w Studio)';
}

function opisHintStudio(spec) {
  const fil = nazwaFilamentuKalibrowane(spec && spec.material);
  return 'Wskazówka, nie ustawienie slicera: proces 0.20 mm Standard @BBL P2S; filament '
    + fil + '. 3MF to geometria — profil KALIBROWANE wybierasz w Studio. Bez project_settings.';
}

/**
 * Checklista dla człowieka w Studio. 3MF z tej aplikacji to sama geometria —
 * Bambu nie dostaje tu project_settings (nadpisałby profil; brim i tak bywa
 * gubiony przy wczytaniu). To nie jest fałszywy preset slicera.
 */
export function checklistaDruku(spec, werdykt) {
  const s = planZSpec(spec) || {};
  const o = s.orientacja_druku || {};
  const p = s.podpory || {};
  const b = s.brim || {};
  const nw = werdykt && werdykt.nawisy;
  const linie = [];
  linie.push('WYŚLIJ DO STUDIO — skopiuj i odhacz przy cięciu');
  linie.push('3MF to geometria. Studio NIE wczyta stąd procesu ani filamentu (celowo: Twój profil KALIBROWANE zostaje).');
  linie.push('Filament: ' + nazwaFilamentuKalibrowane(spec && spec.material) + '.');
  linie.push('');
  linie.push('Gotowe do druku — sprawdź w Studio przed cięciem:');
  linie.push('');
  linie.push('Orientacja: na płycie leży ' + (o.sciana_na_plycie || '—') + '. ' + (o.uzasadnienie || '').trim());
  if (nw) {
    linie.push(nw.krytyczny
      ? ('Bramka: styk ' + Number(nw.poleNaStole).toFixed(0) + ' mm²; jest spójny nawis '
        + Number(nw.najwiekszySpojny).toFixed(1) + ' mm² — nie oznaczaj pliku jako bez podpór.')
      : ('Bramka: styk ' + Number(nw.poleNaStole).toFixed(0)
        + ' mm²; brak spójnego krytycznego nawisu.'));
  }
  linie.push('');
  if (p.wymagane) {
    linie.push('Podpory: ' + (TYP_PODPORY_PL[p.typ] || 'tak') + '. ' + (p.uzasadnienie || '').trim());
    linie.push('W Studio włącz ten typ i sprawdź podgląd cięcia — 3MF nie zapisuje podpór. Slicer sam je dorysowuje.');
  } else {
    linie.push('Podpory: nie. ' + (p.uzasadnienie || '').trim());
    linie.push('W podglądzie Studio i tak sprawdź, czy slicer nie dorysował podpór.');
  }
  linie.push('');
  if (b.wymagany) {
    linie.push('Brim: tak. ' + (b.uzasadnienie || '').trim());
    linie.push('Po pocięciu sprawdź, czy na liście jest pozycja Brim (Studio bywa, że nadpisuje brim profilem procesu).');
  } else {
    linie.push('Brim: nie. ' + (b.uzasadnienie || 'Płaska podstawa — na PEI/Frostbite zwykle bez brimu.').trim());
  }
  linie.push('');
  linie.push('Co bym poprawił (rada, nie zmiana siatki):');
  const u = String((spec && spec.uwagi_do_druku) || '').trim();
  linie.push(u || 'Po próbnym wydruku: czy ścianka i styk wystarczą; czy da się bez podpór inną orientacją.');
  linie.push('');
  linie.push('Checklista w Studio (3MF to sama geometria):');
  linie.push('1. Podgląd cięcia: styk z płytą, podpory, brim, pierwsza warstwa.');
  linie.push('2. Proces: 0.20 mm Standard @BBL P2S (rozdział 5.18). Detal 0.16 HQ, test 0.24.');
  linie.push('3. Wysyłka: dynamika przepływu Auto, jeśli szpula już skalibrowana — nie Wł. na co dzień (6.8).');
  const extra = (werdykt && werdykt.wpisy || []).filter(w =>
    w && (w.kod === 'PODPORY' || w.kod === 'NAWIS_SPOJNY' || w.kod === 'STOL' || w.kod === 'ORIENTACJA_DRUKU'));
  if (extra.length) {
    linie.push('');
    extra.forEach(w => linie.push('Uwaga bramki: ' + w.tekst));
  }
  return linie.join('\n');
}

export function tekstDeklaracji(spec, dekl, werdykt) {
  const linie = [];
  linie.push(`Deklaracja wymiarów — ${(spec && spec.nazwa) || 'część'}`);
  linie.push(`Materiał: ${(spec && spec.material) || '—'}`);
  linie.push('');
  if (dekl && dekl.bbox) {
    linie.push(`Gabaryt X: ${dekl.bbox.x.toFixed(2)} mm`);
    linie.push(`Gabaryt Y: ${dekl.bbox.y.toFixed(2)} mm`);
    linie.push(`Gabaryt Z: ${dekl.bbox.z.toFixed(2)} mm`);
    linie.push(`Tolerancja: ${dekl.tolerance_mm != null ? dekl.tolerance_mm : 0.2} mm`);
  }
  if (dekl && dekl.objetosc_mm3 != null) linie.push(`Objętość: ${dekl.objetosc_mm3.toFixed(1)} mm³`);
  if (dekl && dekl.odksztalcenie_zatrzasku_proc != null) {
    linie.push(`Odkształcenie zatrzasku: ${dekl.odksztalcenie_zatrzasku_proc.toFixed(2)}%`);
  }
  linie.push('');
  linie.push('Wymiary krytyczne (miejsce pomiaru suwmiarką):');
  const wk = (dekl && dekl.wymiary_krytyczne) || [];
  if (!wk.length) linie.push('(brak — gabaryt z siatki)');
  for (const w of wk) {
    linie.push(`- ${w.nazwa}: ${Number(w.wartosc_mm).toFixed(3)} mm — ${w.miejsce_pomiaru || ''}`);
  }
  if (werdykt && werdykt.wpisy && werdykt.wpisy.length) {
    linie.push('');
    linie.push('Bramka:');
    for (const w of werdykt.wpisy) linie.push(`- [${w.poziom}] ${w.kod}: ${w.tekst}`);
  }
  if (spec && ((spec.podpory && spec.brim && spec.orientacja_druku)
    || (spec.czesci || []).some(c => c && c.podpory && c.brim && c.orientacja_druku))) {
    linie.push('');
    linie.push(checklistaDruku(spec, werdykt));
  }
  linie.push('');
  linie.push('Weź tę kartkę do stołu razem z suwmiarką po wydruku.');
  return linie.join('\n');
}
