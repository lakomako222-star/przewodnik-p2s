/**
 * Szablony home (doniczka, haczyk, organizer z przegrodami).
 * nauka-szablony.js jest zamrożony — ten plik ma ten sam kontrakt SPEC.
 * Zero imputacji wymiarów definiujących; grubość / dno / drenaż / przegrody mają jawną domyślną.
 */
'use strict';

import { pudelko } from './nauka-szablony.js';

/**
 * Doniczka — walec albo stożek (gdy zdanie poda dolną średnicę).
 * @param {number} fi — średnica górna zewnętrzna [mm]
 * @param {number} h — wysokość [mm]
 * @param {number} grub — ścianka [mm], domyślnie 2,4
 * @param {number} fiDol — średnica dolna zewnętrzna [mm]; brak = fi (walec)
 * @param {number} drenaz — liczba otworów d 8 w środku dna; domyślnie 1; 0 = bez otworu
 */
export function doniczka(fi, h, grub, fiDol, drenaz) {
  const g = grub || 2.4;
  const dno = 3;
  const dol = (fiDol == null || fiDol === '') ? fi : fiDol;
  const nD = (drenaz == null || drenaz === '') ? 1 : Number(drenaz);
  const fiWGora = Math.max(fi - 2 * g, 1);
  const fiWDol = Math.max(dol - 2 * g, 1);
  const bryly = [
    {
      id: 'zewn', operacja: 'dodaj',
      ksztalt: { typ: 'walec', wysokosc_mm: h, srednica_dolna_mm: dol, srednica_gorna_mm: fi },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'wnetrze', operacja: 'odejmij',
      ksztalt: { typ: 'walec', wysokosc_mm: Math.max(h - dno + 1, 1), srednica_dolna_mm: fiWDol, srednica_gorna_mm: fiWGora },
      pozycja_mm: [0, 0, dno], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  if (nD > 0) {
    bryly.push({
      id: 'drenaz', operacja: 'odejmij',
      ksztalt: { typ: 'walec', wysokosc_mm: dno + 2, srednica_dolna_mm: 8, srednica_gorna_mm: 8 },
      pozycja_mm: [0, 0, -1], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    });
  }
  return {
    nazwa: 'Doniczka Fi' + fi + ' H' + h,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Doniczka z szablonu doniczka. Ścianka ' + g + ' mm, dno ' + dno + ' mm. Drukuj dnem na płycie.'
  };
}

/** Prostokąt w XY: X = promień (oś obrotu = Y). */
function profilProst(rWewn, grub, szer) {
  const x0 = rWewn;
  const x1 = rWewn + grub;
  const y0 = -szer / 2;
  const y1 = szer / 2;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

/**
 * Haczyk ścienny — płytka + ramię + zagięcie 90° + zadzior.
 * @param {number} h — wysokość płytki montażowej [mm]
 * @param {number} dl — wysięg ramienia [mm]
 * @param {number} w — szerokość [mm], domyślnie 15
 * @param {number} grub — grubość [mm], domyślnie 4
 */
export function haczyk(h, dl, w, grub) {
  const W = w || 15;
  const g = grub || 4;
  const zadzior = dl / 2;
  const o = 0.4;
  const bryly = [
    {
      id: 'plytka', operacja: 'dodaj',
      ksztalt: { typ: 'prostopadloscian', x_mm: W, y_mm: g, z_mm: h },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'ramie', operacja: 'dodaj',
      ksztalt: { typ: 'prostopadloscian', x_mm: W, y_mm: dl + o, z_mm: g },
      pozycja_mm: [0, g - o, h - g], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'zagiecie', operacja: 'dodaj',
      ksztalt: { typ: 'obrot', profil: profilProst(0.2, g, W), kat_deg: 90 },
      pozycja_mm: [W / 2, g + dl, h - g], obrot_deg: [0, 0, 90], srodkowanie: 'brak'
    },
    {
      id: 'zadzior', operacja: 'dodaj',
      ksztalt: { typ: 'prostopadloscian', x_mm: W, y_mm: g, z_mm: zadzior + o },
      pozycja_mm: [0, g + dl - 0.2, h - g - zadzior], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'otwor_a', operacja: 'odejmij',
      ksztalt: { typ: 'walec', wysokosc_mm: g + 2, srednica_dolna_mm: 4.5, srednica_gorna_mm: 4.5 },
      pozycja_mm: [W / 2, -1, h * 0.25], obrot_deg: [90, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'otwor_b', operacja: 'odejmij',
      ksztalt: { typ: 'walec', wysokosc_mm: g + 2, srednica_dolna_mm: 4.5, srednica_gorna_mm: 4.5 },
      pozycja_mm: [W / 2, -1, h * 0.75], obrot_deg: [90, 0, 0], srodkowanie: 'brak'
    }
  ];
  return {
    nazwa: 'Haczyk H' + h + ' wysieg ' + dl,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Haczyk z szablonu haczyk. Płytka ' + g + ' mm, dwa otwory Ø4,5. Drukuj płytką na płycie albo na krawędzi.'
  };
}

/**
 * Organizer z przegrodami — pudełko + N ścianek wzdłuż x.
 * @param {number} x — długość wewn. [mm]
 * @param {number} y — szerokość wewn. [mm]
 * @param {number} z — wysokość wewn. [mm]
 * @param {number} grub — ścianka [mm], domyślnie 2
 * @param {number} przegrody — liczba przegród wzdłuż x, domyślnie 2
 */
export function organizerPrzegrody(x, y, z, grub, przegrody) {
  const g = grub || 2;
  const n = (przegrody == null || przegrody === '') ? 2 : Number(przegrody);
  const baz = pudelko(x, y, z, g);
  const bryly = (baz.bryly || []).slice();
  const nn = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 2;
  for (let i = 1; i <= nn; i++) {
    const px = g + (i * x) / (nn + 1) - g / 2;
    bryly.push({
      id: 'przegroda_' + i, operacja: 'dodaj',
      ksztalt: { typ: 'prostopadloscian', x_mm: g, y_mm: y, z_mm: z },
      pozycja_mm: [px, g, g], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    });
  }
  return {
    nazwa: 'Organizer ' + x + '×' + y + '×' + z + ' mm',
    material: baz.material || 'PETG',
    bryly, cechy: baz.cechy || [],
    uwagi_do_druku: 'Organizer z szablonu organizerPrzegrody. ' + nn + ' przegród, ścianka ' + g + ' mm. Drukuj dnem na płycie.'
  };
}

/**
 * Kubek na długopisy / sztućce — walec pusty, dno pełne, bez drenażu.
 * @param {number} fi — średnica zewn. [mm]
 * @param {number} h — wysokość [mm]
 * @param {number} grub — ścianka [mm], domyślnie 2,4
 */
export function kubek(fi, h, grub) {
  const spec = doniczka(fi, h, grub, fi, 0);
  spec.nazwa = 'Kubek Fi' + fi + ' H' + h;
  spec.uwagi_do_druku = 'Kubek z szablonu kubek. Ścianka jak doniczka, bez drenażu. Drukuj dnem na płycie.';
  return spec;
}

/**
 * Pokrywka wcisk — dysk + rant wewnętrzny.
 * @param {number} fi — średnica zewn. [mm]
 * @param {number} grub — grubość dysku [mm], domyślnie 2
 * @param {number} rant — wysokość rantu [mm], domyślnie 8
 */
export function pokrywka(fi, grub, rant) {
  const g = grub || 2;
  const r = rant || 8;
  const luz = 0.4;
  const fiRant = Math.max(fi - 2 * g - luz, 4);
  const fiRantW = Math.max(fiRant - 2 * g, 2);
  const bryly = [
    {
      id: 'dysk', operacja: 'dodaj',
      ksztalt: { typ: 'walec', wysokosc_mm: g, srednica_dolna_mm: fi, srednica_gorna_mm: fi },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'rant', operacja: 'dodaj',
      ksztalt: { typ: 'walec', wysokosc_mm: r, srednica_dolna_mm: fiRant, srednica_gorna_mm: fiRant },
      pozycja_mm: [0, 0, g], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'rant_wnetrze', operacja: 'odejmij',
      ksztalt: { typ: 'walec', wysokosc_mm: r + 2, srednica_dolna_mm: fiRantW, srednica_gorna_mm: fiRantW },
      pozycja_mm: [0, 0, g - 1], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  return {
    nazwa: 'Pokrywka Fi' + fi,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Pokrywka wcisk z szablonu pokrywka. Rant ' + r + ' mm. Drukuj dyskiem na płycie.'
  };
}

/**
 * Lejek — stożek + rurka.
 * @param {number} fi — średnica góry zewn. [mm]
 * @param {number} fiDol — średnica rurki zewn. [mm]
 * @param {number} h — wysokość całkowita [mm]
 * @param {number} grub — ścianka [mm], domyślnie 2
 */
export function lejek(fi, fiDol, h, grub) {
  const g = grub || 2;
  const rurka = Math.min(30, Math.max(h / 3, 10));
  const hStoz = Math.max(h - rurka, 8);
  const fiW = Math.max(fi - 2 * g, 2);
  const dolW = Math.max(fiDol - 2 * g, 1);
  const bryly = [
    {
      id: 'stozek', operacja: 'dodaj',
      ksztalt: { typ: 'walec', wysokosc_mm: hStoz, srednica_dolna_mm: fiDol, srednica_gorna_mm: fi },
      pozycja_mm: [0, 0, rurka], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'stozek_w', operacja: 'odejmij',
      ksztalt: { typ: 'walec', wysokosc_mm: hStoz + 2, srednica_dolna_mm: dolW, srednica_gorna_mm: fiW },
      pozycja_mm: [0, 0, rurka - 1], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'rurka', operacja: 'dodaj',
      ksztalt: { typ: 'walec', wysokosc_mm: rurka + 0.4, srednica_dolna_mm: fiDol, srednica_gorna_mm: fiDol },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'rurka_w', operacja: 'odejmij',
      ksztalt: { typ: 'walec', wysokosc_mm: rurka + 2, srednica_dolna_mm: dolW, srednica_gorna_mm: dolW },
      pozycja_mm: [0, 0, -1], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  return {
    nazwa: 'Lejek Fi' + fi + ' rurka ' + fiDol,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Lejek z szablonu lejek. Drukuj rurką na płycie (stożek do góry).'
  };
}

/**
 * Podstawka / coaster — dysk, opcjonalny rant.
 * @param {number} fi — średnica [mm]
 * @param {number} grub — grubość [mm], domyślnie 3
 * @param {number} rant — wysokość rantu [mm], 0 = płaski; domyślnie 6
 */
export function podstawka(fi, grub, rant) {
  const g = grub || 3;
  const r = (rant == null || rant === '') ? 6 : Number(rant);
  const bryly = [
    {
      id: 'dysk', operacja: 'dodaj',
      ksztalt: { typ: 'walec', wysokosc_mm: g, srednica_dolna_mm: fi, srednica_gorna_mm: fi },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  if (r > 0) {
    const fiW = Math.max(fi - 4, 8);
    bryly.push({
      id: 'rant', operacja: 'dodaj',
      ksztalt: { typ: 'walec', wysokosc_mm: r, srednica_dolna_mm: fi, srednica_gorna_mm: fi },
      pozycja_mm: [0, 0, g], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    });
    bryly.push({
      id: 'rant_w', operacja: 'odejmij',
      ksztalt: { typ: 'walec', wysokosc_mm: r + 2, srednica_dolna_mm: fiW, srednica_gorna_mm: fiW },
      pozycja_mm: [0, 0, g - 1], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    });
  }
  return {
    nazwa: 'Podstawka Fi' + fi,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Podstawka z szablonu podstawka. Drukuj dnem na płycie.'
  };
}

/**
 * Gałka meblowa — walec z otworem Ø4,5 (M4).
 * @param {number} fi — średnica [mm]
 * @param {number} h — wysokość [mm]
 */
export function galka(fi, h) {
  const bryly = [
    {
      id: 'korpus', operacja: 'dodaj',
      ksztalt: { typ: 'walec', wysokosc_mm: h, srednica_dolna_mm: fi, srednica_gorna_mm: fi },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'otwor', operacja: 'odejmij',
      ksztalt: { typ: 'walec', wysokosc_mm: h + 2, srednica_dolna_mm: 4.5, srednica_gorna_mm: 4.5 },
      pozycja_mm: [0, 0, -1], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  return {
    nazwa: 'Galka Fi' + fi + ' H' + h,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Gałka z szablonu galka. Otwór Ø4,5. Drukuj płaską stroną na płycie.'
  };
}

/**
 * Stopka meblowa — walec.
 * @param {number} fi — średnica [mm]
 * @param {number} h — wysokość [mm]
 */
export function stopka(fi, h) {
  const bryly = [
    {
      id: 'korpus', operacja: 'dodaj',
      ksztalt: { typ: 'walec', wysokosc_mm: h, srednica_dolna_mm: fi, srednica_gorna_mm: fi },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  return {
    nazwa: 'Stopka Fi' + fi + ' H' + h,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Stopka z szablonu stopka. Drukuj dnem na płycie.'
  };
}

/**
 * Stojak na telefon — podstawa + rant + oparcie.
 * @param {number} w — szerokość [mm]
 * @param {number} h — wysokość oparcia [mm]
 * @param {number} kat — kąt oparcia od poziomu [deg], domyślnie 65
 */
export function stojak(w, h, kat) {
  const k = (kat == null || kat === '') ? 65 : Number(kat);
  const g = 4;
  const bazaY = 70;
  const lip = 12;
  const tilt = 90 - k;
  const bryly = [
    {
      id: 'baza', operacja: 'dodaj',
      ksztalt: { typ: 'prostopadloscian', x_mm: w, y_mm: bazaY, z_mm: g },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'rant', operacja: 'dodaj',
      ksztalt: { typ: 'prostopadloscian', x_mm: w, y_mm: 8, z_mm: lip },
      pozycja_mm: [0, 0, g], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'mostek', operacja: 'dodaj',
      ksztalt: { typ: 'prostopadloscian', x_mm: w, y_mm: 18, z_mm: 12 },
      pozycja_mm: [0, bazaY - 18, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'oparcie', operacja: 'dodaj',
      ksztalt: { typ: 'prostopadloscian', x_mm: w, y_mm: g, z_mm: h },
      pozycja_mm: [0, bazaY - g - 4, 0], obrot_deg: [tilt, 0, 0], srodkowanie: 'brak'
    }
  ];
  return {
    nazwa: 'Stojak ' + w + ' mm kat ' + k,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Stojak z szablonu stojak. Drukuj bazą na płycie. Kąt oparcia ' + k + '°.'
  };
}

/**
 * Ociekacz / mydelniczka — pudełko + siatka otworów Ø6 w dnie (jak spec T5, parametryzowane).
 * @param {number} x — długość wewn. [mm]
 * @param {number} y — szerokość wewn. [mm]
 * @param {number} z — wysokość wewn. [mm]
 * @param {number} grub — ścianka [mm], domyślnie 2
 * @param {number} n — liczba otworów wzdłuż x, domyślnie 6
 */
export function ociekacz(x, y, z, grub, n) {
  const g = grub || 2;
  const nn = (n == null || n === '') ? 6 : Math.max(1, Math.floor(Number(n)));
  const baz = pudelko(x, y, z, g);
  const bryly = (baz.bryly || []).slice();
  const ny = Math.max(2, Math.floor(y / 18));
  const d = 6;
  for (let i = 0; i < nn; i++) {
    for (let j = 0; j < ny; j++) {
      const px = g + (i + 0.5) * (x / nn);
      const py = g + (j + 0.5) * (y / ny);
      bryly.push({
        id: 'otwor_' + i + '_' + j, operacja: 'odejmij',
        ksztalt: { typ: 'walec', wysokosc_mm: g + 2, srednica_dolna_mm: d, srednica_gorna_mm: d },
        pozycja_mm: [px, py, -1], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
      });
    }
  }
  return {
    nazwa: 'Ociekacz ' + x + '×' + y + '×' + z + ' mm',
    material: baz.material || 'PETG',
    bryly, cechy: baz.cechy || [],
    uwagi_do_druku: 'Ociekacz z szablonu ociekacz. ' + nn + '×' + ny + ' otworów Ø6 w dnie. Drukuj dnem na płycie.'
  };
}

/**
 * Klips kablowy — płytka + pierścień C.
 * @param {number} fi — średnica kabla [mm]
 * @param {number} w — szerokość klipsa [mm], domyślnie 12
 * @param {number} grub — grubość ścianki pierścienia [mm], domyślnie 2,4
 */
export function klipsKabla(fi, w, grub) {
  const W = w || 12;
  const g = grub || 2.4;
  const od = fi + 2 * g;
  const cy = 8 + od / 2 - 2.5;
  const bryly = [
    {
      id: 'plytka', operacja: 'dodaj',
      ksztalt: { typ: 'prostopadloscian', x_mm: W, y_mm: 8, z_mm: 3 },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'pierscien', operacja: 'dodaj',
      ksztalt: { typ: 'walec', wysokosc_mm: W, srednica_dolna_mm: od, srednica_gorna_mm: od },
      pozycja_mm: [0, cy, 1.5], obrot_deg: [0, 90, 0], srodkowanie: 'brak'
    },
    {
      id: 'otwor', operacja: 'odejmij',
      ksztalt: { typ: 'walec', wysokosc_mm: W + 2, srednica_dolna_mm: fi, srednica_gorna_mm: fi },
      pozycja_mm: [-1, cy, 1.5], obrot_deg: [0, 90, 0], srodkowanie: 'brak'
    },
    {
      id: 'szczelina', operacja: 'odejmij',
      ksztalt: { typ: 'prostopadloscian', x_mm: W + 2, y_mm: g + 3, z_mm: fi * 0.7 },
      pozycja_mm: [-1, 8 + od - g - 0.5, 1.5 - (fi * 0.35)], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  return {
    nazwa: 'Klips kabla Fi' + fi,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Klips kablowy z szablonu klipsKabla. Drukuj płytką na płycie.'
  };
}

/**
 * Wieszak-listwa — belka + N haczyków (składa się z geometrii haczyka).
 * @param {number} h — wysokość belki [mm]
 * @param {number} dl — wysięg haczyka [mm]
 * @param {number} n — liczba haczyków, domyślnie 3
 * @param {number} w — szerokość haczyka [mm], domyślnie 15
 * @param {number} grub — grubość [mm], domyślnie 4
 */
export function wieszakListwa(h, dl, n, w, grub) {
  const nn = (n == null || n === '') ? 3 : Math.max(1, Math.floor(Number(n)));
  const W = w || 15;
  const g = grub || 4;
  const rozstaw = 50;
  const L = nn * rozstaw + 20;
  const bryly = [
    {
      id: 'belka', operacja: 'dodaj',
      ksztalt: { typ: 'prostopadloscian', x_mm: L, y_mm: g, z_mm: h },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  for (let i = 0; i < nn; i++) {
    const hx = 10 + i * rozstaw + W / 2;
    const hak = haczyk(h, dl, W, g);
    const lokalne = (hak.bryly || []).filter(b => b.id !== 'plytka' && b.id !== 'otwor_a' && b.id !== 'otwor_b');
    for (let j = 0; j < lokalne.length; j++) {
      const b = lokalne[j];
      const p = (b.pozycja_mm || [0, 0, 0]).slice();
      p[0] = (p[0] || 0) + hx - W / 2;
      bryly.push(Object.assign({}, b, { id: b.id + '_' + (i + 1), pozycja_mm: p }));
    }
  }
  bryly.push({
    id: 'otwor_l', operacja: 'odejmij',
    ksztalt: { typ: 'walec', wysokosc_mm: g + 2, srednica_dolna_mm: 4.5, srednica_gorna_mm: 4.5 },
    pozycja_mm: [10, -1, h / 2], obrot_deg: [90, 0, 0], srodkowanie: 'brak'
  });
  bryly.push({
    id: 'otwor_p', operacja: 'odejmij',
    ksztalt: { typ: 'walec', wysokosc_mm: g + 2, srednica_dolna_mm: 4.5, srednica_gorna_mm: 4.5 },
    pozycja_mm: [L - 10, -1, h / 2], obrot_deg: [90, 0, 0], srodkowanie: 'brak'
  });
  return {
    nazwa: 'Wieszak ' + nn + ' haki L' + L,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Wieszak-listwa z szablonu wieszakListwa. ' + nn + ' haczyków. Drukuj belką na płycie.'
  };
}

export const SZABLONY_HOME = [
  {
    id: 'doniczka',
    nazwa: 'Doniczka (planter)',
    tagi: ['doniczka', 'planter', 'pot'],
    parametry: 'fi, h, grub, fiDol, drenaz',
    fn: doniczka,
    przyklad: 'doniczka(120, 100) → walec Ø120 H100, drenaż Ø8',
    opis: 'Wymagane: fi (górna zewn.), h. grub 2,4 mm, dno 3 mm, fiDol=fi, drenaz=1×Ø8.'
  },
  {
    id: 'haczyk',
    nazwa: 'Haczyk ścienny',
    tagi: ['haczyk', 'hook'],
    parametry: 'h, dl, w, grub',
    fn: haczyk,
    przyklad: 'haczyk(80, 40) → płytka H80, wysięg 40',
    opis: 'Wymagane: h (płytka), dl (wysięg). w 15 mm, grub 4 mm, zadzior=dl/2, 2×Ø4,5.'
  },
  {
    id: 'organizerPrzegrody',
    nazwa: 'Organizer z przegrodami',
    tagi: ['organizer', 'przegrody'],
    parametry: 'x, y, z, grub, przegrody',
    fn: organizerPrzegrody,
    przyklad: 'organizerPrzegrody(120, 80, 40) → tacka 2 przegrody',
    opis: 'Wymagane: x, y, z wewn. grub 2 mm, przegrody=2 wzdłuż x.'
  },
  {
    id: 'kubek',
    nazwa: 'Kubek na długopisy',
    tagi: ['kubek', 'pen cup'],
    parametry: 'fi, h, grub',
    fn: kubek,
    przyklad: 'kubek(80, 100) → walec Ø80 H100, bez drenażu',
    opis: 'Wymagane: fi, h. grub 2,4 mm, dno 3 mm.'
  },
  {
    id: 'pokrywka',
    nazwa: 'Pokrywka wcisk',
    tagi: ['pokrywka', 'lid'],
    parametry: 'fi, grub, rant',
    fn: pokrywka,
    przyklad: 'pokrywka(80) → dysk Ø80, rant 8 mm',
    opis: 'Wymagane: fi. grub 2 mm, rant 8 mm.'
  },
  {
    id: 'lejek',
    nazwa: 'Lejek',
    tagi: ['lejek', 'funnel'],
    parametry: 'fi, fiDol, h, grub',
    fn: lejek,
    przyklad: 'lejek(80, 20, 90) → góra Ø80, rurka Ø20, H90',
    opis: 'Wymagane: fi, fiDol, h. grub 2 mm.'
  },
  {
    id: 'podstawka',
    nazwa: 'Podstawka / coaster',
    tagi: ['podstawka', 'coaster'],
    parametry: 'fi, grub, rant',
    fn: podstawka,
    przyklad: 'podstawka(100) → dysk Ø100, rant 6 mm',
    opis: 'Wymagane: fi. grub 3 mm, rant 6 mm (0 = płaski).'
  },
  {
    id: 'galka',
    nazwa: 'Gałka meblowa',
    tagi: ['galka', 'knob'],
    parametry: 'fi, h',
    fn: galka,
    przyklad: 'galka(30, 20) → Ø30 H20, otwór Ø4,5',
    opis: 'Wymagane: fi, h. Otwór M4.'
  },
  {
    id: 'stopka',
    nazwa: 'Stopka meblowa',
    tagi: ['stopka', 'foot'],
    parametry: 'fi, h',
    fn: stopka,
    przyklad: 'stopka(40, 15) → walec Ø40 H15',
    opis: 'Wymagane: fi, h.'
  },
  {
    id: 'stojak',
    nazwa: 'Stojak na telefon',
    tagi: ['stojak', 'phone stand'],
    parametry: 'w, h, kat',
    fn: stojak,
    przyklad: 'stojak(80, 90, 65) → szer. 80, oparcie 90, kąt 65°',
    opis: 'Wymagane: w, h. kat 65°.'
  },
  {
    id: 'ociekacz',
    nazwa: 'Ociekacz / mydelniczka',
    tagi: ['ociekacz', 'soap'],
    parametry: 'x, y, z, grub, n',
    fn: ociekacz,
    przyklad: 'ociekacz(120, 80, 20) → tacka, otwory Ø6 w dnie',
    opis: 'Wymagane: x, y, z wewn. n=6 otworów wzdłuż x, Ø6 jak spec T5.'
  },
  {
    id: 'klipsKabla',
    nazwa: 'Klips kablowy',
    tagi: ['klips kablowy', 'cable clip'],
    parametry: 'fi, w, grub',
    fn: klipsKabla,
    przyklad: 'klipsKabla(6) → pierścień C na kabel Ø6',
    opis: 'Wymagane: fi (kabel). w 12 mm, grub 2,4 mm.'
  },
  {
    id: 'wieszakListwa',
    nazwa: 'Wieszak-listwa',
    tagi: ['wieszak', 'hook rail'],
    parametry: 'h, dl, n, w, grub',
    fn: wieszakListwa,
    przyklad: 'wieszakListwa(60, 35, 3) → belka, 3 haczyki',
    opis: 'Wymagane: h (belka), dl (wysięg). n=3, rozstaw 50 mm.'
  }
];
