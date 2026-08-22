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
      if (odPionu > 45) poleZle += pole;
    }
  }
  return {
    najgorszy: +najgorszy.toFixed(1),
    procentZlych: poleRazem > 0 ? +(100 * poleZle / poleRazem).toFixed(1) : 0,
    poleNaStole: +polePodparte.toFixed(1)
  };
}

function wpis(poziom, kod, tekst, liczba) {
  const o = { poziom, kod, tekst };
  if (liczba != null) o.liczba = liczba;
  return o;
}

/**
 * @param {*} part Manifold
 * @param {object} dekl deklaracja (bbox z pomiaru po budowie)
 * @param {object} spec znormalizowany SPEC
 * @param {{ wmin?: number }} opts wmin 0.8 (nośna) albo 0.42
 */
export function sprawdzBramke(part, dekl, spec, opts = {}) {
  const out = [];
  const blad = (kod, tekst, n) => out.push(wpis('blad', kod, tekst, n));
  const ostrz = (kod, tekst, n) => out.push(wpis('ostrzezenie', kod, tekst, n));

  if (part.isEmpty()) blad('PUSTA', 'Bryła jest pusta — operacje się wyzerowały.');
  const vol = part.volume();
  if (vol <= 0) blad('OBJETOSC', 'Objętość zero lub ujemna.');

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
  if (nw.poleNaStole < 100 && g.z > 40) {
    ostrz('STOL',
      `Styk ze stołem ${nw.poleNaStole} mm² przy wysokości ${g.z.toFixed(1)} mm — ryzyko odklejenia, rozważ brim.`,
      nw.poleNaStole);
  }

  const mat = spec && spec.material;
  const cechy = (spec && spec.cechy) || [];
  for (const c of cechy) {
    if (c.typ === 'otwor' || c.typ === 'otwor_pod_wkladke' || c.typ === 'poglebienie' || c.typ === 'poglebienie_stozkowe') {
      const d = c.srednica_mm || c.srednica_otworu_mm;
      if (d && (d < 1.5 || d > 30)) {
        ostrz('OTWOR', `Średnica otworu ${d.toFixed(2)} mm poza zakresem 1,5–30 mm.`);
      }
      if (d && c.punkt_mm) {
        const r = d / 2, p = c.punkt_mm;
        const margs = [
          p[0] - r - g.min[0], g.max[0] - (p[0] + r),
          p[1] - r - g.min[1], g.max[1] - (p[1] + r)
        ];
        if (Math.min.apply(null, margs) < 2 - 1e-6) {
          blad('SCIENKA_OTWOR', `Mniej niż 2 mm materiału wokół otworu Ø${d.toFixed(2)} mm w punkcie [${p.map(n => n.toFixed(1)).join(', ')}].`);
        }
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
