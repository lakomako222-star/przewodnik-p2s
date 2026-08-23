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

function siatkaXml(mesh) {
  const np = mesh.numProp, vp = mesh.vertProperties, tv = mesh.triVerts;
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
  const { V, T } = siatkaXml(mesh);

  const model =
`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <metadata name="Application">Przewodnik P2S</metadata>
 <metadata name="Title">${esc3(nazwa)}</metadata>
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

export async function mesh3MFWiele(czesci, opcje = {}) {
  const { zipSync, strToU8 } = await fflateApi();
  const obiekty = [], itemy = [];
  let kursorX = 0;
  const ODSTEP = opcje.odstep_mm ?? 8;

  czesci.forEach((cz, i) => {
    const id = i + 1;
    const m = cz.mesh || cz;
    const { V, T } = siatkaXml(m);
    obiekty.push(
`  <object id="${id}" type="model" name="${esc3(cz.nazwa || 'czesc' + id)}">
   <mesh>
    <vertices>${V.join('')}</vertices>
    <triangles>${T.join('')}</triangles>
   </mesh>
  </object>`);
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
  linie.push('');
  linie.push('Weź tę kartkę do stołu razem z suwmiarką po wydruku.');
  return linie.join('\n');
}
