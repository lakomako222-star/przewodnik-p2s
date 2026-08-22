/**
 * Zapis 3MF — trzy wpisy ZIP, unit=millimeter.
 * mtime: 0 rzuca „date not in range 1980-2099” — zawsze podawaj datę.
 */
async function fflateApi() {
  if (globalThis.fflate && typeof globalThis.fflate.zipSync === 'function') return globalThis.fflate;
  return import('fflate');
}

export async function mesh3MF(mesh, opcje = {}) {
  const { zipSync, strToU8 } = await fflateApi();
  const nazwa = opcje.nazwa || 'czesc';
  const np = mesh.numProp, vp = mesh.vertProperties, tv = mesh.triVerts;
  const nv = vp.length / np;
  const r = n => { const s = Math.round(n * 1e6) / 1e6; return Object.is(s, -0) ? 0 : s; };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const V = new Array(nv);
  for (let i = 0; i < nv; i++)
    V[i] = `<vertex x="${r(vp[i * np])}" y="${r(vp[i * np + 1])}" z="${r(vp[i * np + 2])}"/>`;
  const T = new Array(tv.length / 3);
  for (let i = 0; i < tv.length; i += 3)
    T[i / 3] = `<triangle v1="${tv[i]}" v2="${tv[i + 1]}" v3="${tv[i + 2]}"/>`;

  const model =
`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <metadata name="Application">Przewodnik P2S</metadata>
 <metadata name="Title">${esc(nazwa)}</metadata>
 <resources>
  <object id="1" type="model" name="${esc(nazwa)}">
   <mesh>
    <vertices>${V.join('')}</vertices>
    <triangles>${T.join('')}</triangles>
   </mesh>
  </object>
 </resources>
 <build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></build>
</model>`;

  const ct =
`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

  const rels =
`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rel0" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

  return zipSync({
    '[Content_Types].xml': strToU8(ct),
    '_rels/.rels': strToU8(rels),
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
