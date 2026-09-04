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
  }
];
