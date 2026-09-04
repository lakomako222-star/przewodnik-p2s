/**
 * Szablony obrotowe (podkładka, tuleja, kołnierz, zaślepka).
 * nauka-szablony.js jest zamrożony — ten plik ma ten sam kontrakt SPEC.
 * Zero imputacji wymiarów definiujących; grubość ścianki / luz mają jawną domyślną.
 */
'use strict';

/**
 * Podkładka / washer — krótka rura (wysokość = grubość tarczy).
 * @param {number} fi  — średnica otworu [mm]
 * @param {number} fiZ — średnica zewnętrzna [mm]
 * @param {number} grub — grubość tarczy [mm], domyślnie 2
 */
export function podkladka(fi, fiZ, grub) {
  const g = grub || 2;
  return {
    nazwa: 'Podkładka Fi' + fi + '/' + fiZ,
    material: 'PETG',
    bryly: [{
      id: 'tarcza', operacja: 'dodaj',
      ksztalt: { typ: 'rura', wysokosc_mm: g, srednica_zewn_mm: fiZ, srednica_wewn_mm: fi },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }],
    cechy: [],
    uwagi_do_druku: 'Podkładka z szablonu podkladka. Grubość ' + g + ' mm. Drukuj płasko na płycie.'
  };
}

/**
 * Tuleja / bushing — rura, fi = średnica wewnętrzna.
 * @param {number} fi — średnica wewnętrzna [mm]
 * @param {number} dl — długość [mm]
 * @param {number} grub — ścianka [mm], domyślnie 2
 */
export function tuleja(fi, dl, grub) {
  const g = grub || 2;
  const fiZ = fi + 2 * g;
  return {
    nazwa: 'Tuleja Fi' + fi + ' L' + dl,
    material: 'PETG',
    bryly: [{
      id: 'tuleja', operacja: 'dodaj',
      ksztalt: { typ: 'rura', wysokosc_mm: dl, srednica_zewn_mm: fiZ, srednica_wewn_mm: fi },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }],
    cechy: [],
    uwagi_do_druku: 'Tuleja z szablonu tuleja. Ścianka ' + g + ' mm.'
  };
}

/**
 * Kołnierz / flange — szyjka rura + tarcza rura + otwory walec odejmij.
 * @param {number} fi — średnica wewnętrzna [mm]
 * @param {number} fiZ — średnica tarczy [mm]
 * @param {number} grub — grubość tarczy [mm], domyślnie 4
 * @param {number} h — wysokość szyjki [mm], domyślnie max(fi, 12)
 * @param {Array} otwory — [{x,y,d}] pozycje i średnice otworów w tarczy
 */
export function kolnierz(fi, fiZ, grub, h, otwory) {
  const g = grub || 4;
  const H = h || Math.max(fi, 12);
  const fiSzyjki = fi + 2 * g;
  const bryly = [
    {
      id: 'tarcza', operacja: 'dodaj',
      ksztalt: { typ: 'rura', wysokosc_mm: g, srednica_zewn_mm: fiZ, srednica_wewn_mm: fi },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'szyjka', operacja: 'dodaj',
      ksztalt: { typ: 'rura', wysokosc_mm: H, srednica_zewn_mm: fiSzyjki, srednica_wewn_mm: fi },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  if (Array.isArray(otwory)) {
    otwory.forEach(function (o, i) {
      const d = o.d || 4;
      bryly.push({
        id: 'otwor_' + i, operacja: 'odejmij',
        ksztalt: { typ: 'walec', wysokosc_mm: g + 2, srednica_dolna_mm: d, srednica_gorna_mm: d },
        pozycja_mm: [o.x, o.y, -1], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
      });
    });
  }
  return {
    nazwa: 'Kołnierz Fi' + fi + '/' + fiZ,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Kołnierz z szablonu kolnierz. Tarcza ' + g + ' mm, szyjka ' + H + ' mm. Drukuj tarczą na płycie.'
  };
}

/**
 * Koło w XY: środek (cx, 0), promień r. Manifold.revolve — X = promień, Y = wysokość, oś Y.
 * @param {number} cx
 * @param {number} r
 * @param {number} n
 * @returns {number[][]}
 */
function profilKola(cx, r, n) {
  const pts = [];
  const nn = n || 48;
  for (let i = 0; i < nn; i++) {
    const a = (2 * Math.PI * i) / nn;
    pts.push([cx + r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

/**
 * Uchwyt z uszkiem wpuszczonym w ściankę (jedna bryła). Stary uchwyt() zostaje w nauka-szablony.js.
 * @param {number} fi — średnica wewnętrzna [mm]
 * @param {number} h — wysokość tulei [mm]
 * @param {number} grub — ścianka [mm], domyślnie 3
 */
export function uchwytZLaczem(fi, h, grub) {
  const g = grub || 3;
  const fiZ = fi + 2 * g;
  const uszkoW = fiZ;
  const uszkoH = 12;
  const bryly = [
    {
      id: 'tuleja', operacja: 'dodaj',
      ksztalt: { typ: 'rura', wysokosc_mm: h, srednica_zewn_mm: fiZ, srednica_wewn_mm: fi },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'uszko', operacja: 'dodaj',
      ksztalt: { typ: 'prostopadloscian', x_mm: uszkoW, y_mm: uszkoH, z_mm: h },
      pozycja_mm: [-(uszkoW / 2), fiZ / 2 - g, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  const cechy = [{
    typ: 'otwor', punkt_mm: [0, (fiZ / 2 - g) + uszkoH / 2, h / 2],
    os: 'z', srednica_mm: 4, przez: true
  }];
  return {
    nazwa: 'Uchwyt z łączem Fi' + fi,
    material: 'PETG',
    bryly, cechy,
    uwagi_do_druku: 'Uchwyt z szablonu uchwytZLaczem. Uszko wpuszczone w ściankę, otwór M4.'
  };
}

/**
 * Kolanko toroidalne: łuk = różnica dwóch obrotów, ramiona = rura na końcach.
 * @param {number} fi — średnica zewnętrzna [mm]
 * @param {number} kat — kąt zagięcia [°], domyślnie 90
 * @param {number} grub — ścianka [mm], domyślnie 2
 * @param {number} dl — długość ramion [mm], domyślnie 2×fi
 */
export function kolankoTorus(fi, kat, grub, dl) {
  const k = kat || 90;
  const g = grub || 2;
  const L = dl || Math.max(fi * 2, 30);
  const R = fi * 1.5;
  const fiWewn = fi - 2 * g;
  const rZ = fi / 2;
  const rW = fiWewn / 2;
  const o = 1;
  const th = k * Math.PI / 180;
  const fiWRury = Math.max(fiWewn, 0.4);
  // Manifold.revolve: profil XY wokół Y, potem Y→Z. Łuk leży w XY; oś rury na starcie = Y, na końcu styczna.
  const posA = [R, o, 0];
  const posB = [
    R * Math.cos(th) + o * Math.sin(th),
    R * Math.sin(th) - o * Math.cos(th),
    0
  ];
  const bryly = [
    {
      id: 'luk_zewn', operacja: 'dodaj',
      ksztalt: { typ: 'obrot', profil: profilKola(R, rZ, 48), kat_deg: k },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  if (rW > 0.2) {
    bryly.push({
      id: 'luk_wewn', operacja: 'odejmij',
      ksztalt: { typ: 'obrot', profil: profilKola(R, rW, 48), kat_deg: k },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    });
  }
  bryly.push(
    {
      id: 'ramie_a', operacja: 'dodaj',
      ksztalt: { typ: 'rura', wysokosc_mm: L + o, srednica_zewn_mm: fi, srednica_wewn_mm: fiWRury },
      pozycja_mm: posA, obrot_deg: [90, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'ramie_b', operacja: 'dodaj',
      ksztalt: { typ: 'rura', wysokosc_mm: L + o, srednica_zewn_mm: fi, srednica_wewn_mm: fiWRury },
      pozycja_mm: posB, obrot_deg: [0, -k, 0], srodkowanie: 'brak'
    }
  );
  return {
    nazwa: 'Kolanko torus Fi' + fi + ' ' + k + '°',
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Kolanko z szablonu kolankoTorus. Łuk toroidalny, ścianka ' + g + ' mm. Drukuj ramieniem A na płycie.'
  };
}

/**
 * Zaślepka / cap — denko + czop.
 * @param {number} fi — średnica nominalna otworu, na który wchodzi czop [mm]
 * @param {number} h — wysokość czopa [mm]
 * @param {number} grub — grubość denka [mm], domyślnie 2
 * @param {number} luz — luz czopa względem fi [mm], domyślnie 0,2 (jawny, nie ukryty)
 */
export function zaslepka(fi, h, grub, luz) {
  const g = grub || 2;
  const luzMm = (luz == null || luz === '') ? 0.2 : luz;
  const fiDenka = fi + 2 * g;
  const fiCzopa = fi - luzMm;
  const bryly = [
    {
      id: 'denko', operacja: 'dodaj',
      ksztalt: { typ: 'walec', wysokosc_mm: g, srednica_dolna_mm: fiDenka, srednica_gorna_mm: fiDenka },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'czop', operacja: 'dodaj',
      ksztalt: { typ: 'walec', wysokosc_mm: h, srednica_dolna_mm: fiCzopa, srednica_gorna_mm: fiCzopa },
      pozycja_mm: [0, 0, g - 0.2], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  return {
    nazwa: 'Zaślepka Fi' + fi,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Zaślepka z szablonu zaslepka. Denko ' + g + ' mm, czop ' + h + ' mm, luz ' + luzMm + ' mm. Drukuj denkiem na płycie.'
  };
}

export const SZABLONY_OBROTOWE = [
  {
    id: 'podkladka',
    nazwa: 'Podkładka (washer)',
    tagi: ['podkladka', 'washer', 'pierscien'],
    parametry: 'fi, fiZ, grub',
    fn: podkladka,
    przyklad: 'podkladka(8, 16, 2) → podkładka otwór Ø8 zewn. Ø16',
    opis: 'Wymagane: fi (otwór), fiZ (zewnętrzna). grub domyślnie 2 mm.'
  },
  {
    id: 'tuleja',
    nazwa: 'Tuleja (bushing)',
    tagi: ['tuleja', 'bushing', 'sleeve'],
    parametry: 'fi, dl, grub',
    fn: tuleja,
    przyklad: 'tuleja(10, 20, 2) → tuleja wewn. Ø10 L20',
    opis: 'Wymagane: fi (wewnętrzna), dl. grub ścianki domyślnie 2 mm; zewn. = fi+2·grub.'
  },
  {
    id: 'kolnierz',
    nazwa: 'Kołnierz (flange)',
    tagi: ['kolnierz', 'flange'],
    parametry: 'fi, fiZ, grub, h, otwory',
    fn: kolnierz,
    przyklad: 'kolnierz(20, 50, 4, 15, [{x:18,y:0,d:4}])',
    opis: 'Wymagane: fi, fiZ. grub tarczy domyślnie 4 mm, h szyjki domyślnie max(fi,12). otwory opcjonalne, bez imputacji pozycji.'
  },
  {
    id: 'zaslepka',
    nazwa: 'Zaślepka (cap)',
    tagi: ['zaslepka', 'cap', 'endcap'],
    parametry: 'fi, h, grub, luz',
    fn: zaslepka,
    przyklad: 'zaslepka(20, 10, 2, 0.2) → denko + czop luz 0,2 mm',
    opis: 'Wymagane: fi, h. grub denka domyślnie 2 mm. luz czopa domyślnie 0,2 mm (jawny parametr, nie ukryty).'
  },
  {
    id: 'uchwytZLaczem',
    nazwa: 'Uchwyt z łączem',
    tagi: ['uchwyt', 'holder'],
    parametry: 'fi, h, grub',
    fn: uchwytZLaczem,
    przyklad: 'uchwytZLaczem(20, 61, 3) → tuleja Ø20 H61 z uszkiem M4',
    opis: 'Wymagane: fi (wewnętrzna), h. grub ścianki domyślnie 3 mm. Uszko wpuszczone w ściankę.'
  },
  {
    id: 'kolankoTorus',
    nazwa: 'Kolanko toroidalne',
    tagi: ['kolanko', 'elbow'],
    parametry: 'fi, kat, grub, dl',
    fn: kolankoTorus,
    przyklad: 'kolankoTorus(56, 90, 2) → kolanko Ø56 90°',
    opis: 'Wymagane: fi (zewnętrzna). kat domyślnie 90°, grub 2 mm, dl 2×fi. Łuk = różnica obrotów.'
  }
];
