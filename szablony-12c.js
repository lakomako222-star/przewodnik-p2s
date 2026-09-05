/**
 * Szablony 12C — warsztat / drukarka + gridfinityBin (CC BY 4.0, Zack Freedman).
 * Własna geometria na Manifoldzie — nie vendorować generatorów AGPL/GPL.
 * Zasada BRYLY=1: mostki.
 */
'use strict';

import { pudelko } from './nauka-szablony.js';

function walec(id, operacja, fi, h, pos, rot) {
  return {
    id: id, operacja: operacja,
    ksztalt: { typ: 'walec', wysokosc_mm: h, srednica_dolna_mm: fi, srednica_gorna_mm: fi },
    pozycja_mm: pos || [0, 0, 0], obrot_deg: rot || [0, 0, 0], srodkowanie: 'brak'
  };
}

function box(id, operacja, x, y, z, pos, rot) {
  return {
    id: id, operacja: operacja,
    ksztalt: { typ: 'prostopadloscian', x_mm: x, y_mm: y, z_mm: z },
    pozycja_mm: pos || [0, 0, 0], obrot_deg: rot || [0, 0, 0], srodkowanie: 'brak'
  };
}

const WENT_OTW = { 40: 32, 80: 71.5, 120: 105 };

/**
 * Mocowanie wentylatora 40/80/120 — płytka + 4 otwory.
 * @param {number} fi — rozmiar wentylatora 40, 80 albo 120 [mm]
 */
export function mocowanieWentylatora(fi) {
  const size = Number(fi);
  const pitch = WENT_OTW[size] || Math.max(size - 8, 20);
  const g = 3;
  const d = 4.5;
  const off = (size - pitch) / 2;
  const bryly = [box('plytka', 'dodaj', size, size, g, [0, 0, 0])];
  const pts = [[0, 0], [pitch, 0], [0, pitch], [pitch, pitch]];
  for (let i = 0; i < pts.length; i++) {
    bryly.push(walec('otwor_' + (i + 1), 'odejmij', d, g + 2, [off + pts[i][0] - d / 2, off + pts[i][1] - d / 2, -1]));
  }
  bryly.push(walec('przelot', 'odejmij', size - 12, g + 2, [6, 6, -1]));
  return {
    nazwa: 'Mocowanie wentylatora ' + size,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Mocowanie wentylatora z szablonu mocowanieWentylatora. Siatka ' + pitch + ' mm. Drukuj płytką na płycie.'
  };
}

/**
 * Uchwyt dysku 2,5″ / 3,5″ — wannka (w, dl = gabaryt wnęki).
 * @param {number} w — szerokość wewn. [mm]
 * @param {number} dl — długość wewn. [mm]
 */
export function uchwytDysku(w, dl) {
  const g = 2.4;
  const h = 14;
  const bryly = [
    box('skorupa', 'dodaj', w + 2 * g, dl + 2 * g, h + g, [0, 0, 0]),
    box('wnetrze', 'odejmij', w, dl, h + 1, [g, g, g])
  ];
  return {
    nazwa: 'Uchwyt dysku ' + w + '×' + dl,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Uchwyt dysku z szablonu uchwytDysku. 2,5″ ≈ 70×100, 3,5″ ≈ 102×147. Drukuj dnem na płycie.'
  };
}

/**
 * Prowadnica — profil C.
 * @param {number} dl — długość [mm]
 * @param {number} w — szerokość [mm]
 * @param {number} h — wysokość [mm]
 */
export function prowadnica(dl, w, h) {
  const g = 2.4;
  const bryly = [
    box('grzbiet', 'dodaj', dl, g, h, [0, 0, 0]),
    box('polka_d', 'dodaj', dl, w, g, [0, 0, 0]),
    box('polka_g', 'dodaj', dl, w, g, [0, 0, h - g])
  ];
  return {
    nazwa: 'Prowadnica L' + dl,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Prowadnica C z szablonu prowadnica. Drukuj grzbietem na płycie albo na boku.'
  };
}

/**
 * Kanał / korytko U.
 * @param {number} dl — długość [mm]
 * @param {number} w — szerokość wewn. [mm]
 * @param {number} h — wysokość [mm]
 */
export function kanal(dl, w, h) {
  const g = 2.4;
  const bryly = [
    box('dno', 'dodaj', dl, w + 2 * g, g, [0, 0, 0]),
    box('sciana_l', 'dodaj', dl, g, h, [0, 0, 0]),
    box('sciana_p', 'dodaj', dl, g, h, [0, w + g, 0])
  ];
  return {
    nazwa: 'Kanal U L' + dl,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Kanał U z szablonu kanal. Drukuj dnem na płycie.'
  };
}

/**
 * Obudowa — pudełko + pokrywa połączone mostkiem (jedna bryła).
 * @param {number} x — długość wewn. [mm]
 * @param {number} y — szerokość wewn. [mm]
 * @param {number} z — wysokość wewn. [mm]
 */
export function obudowa(x, y, z) {
  const g = 2;
  const baz = pudelko(x, y, z, g);
  const bryly = (baz.bryly || []).slice();
  const ox = x + 2 * g;
  const oy = y + 2 * g;
  bryly.push(box('pokrywa', 'dodaj', ox, oy, g, [ox + 2, 0, 0]));
  bryly.push(box('mostek', 'dodaj', 4, Math.min(oy, 20), g, [ox - 1, (oy - Math.min(oy, 20)) / 2, 0]));
  return {
    nazwa: 'Obudowa ' + x + '×' + y + '×' + z,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Obudowa z szablonu obudowa. Pudełko + pokrywa, mostek do odłamania. Drukuj dnem na płycie.'
  };
}

/**
 * Ramka — otwór x×y, rant na zewnątrz.
 * @param {number} x — szerokość otworu [mm]
 * @param {number} y — wysokość otworu [mm]
 * @param {number} grub — grubość ramki [mm]
 * @param {number} rant — szerokość rantu [mm]
 */
export function ramka(x, y, grub, rant) {
  const g = grub || 3;
  const r = rant || 12;
  const bryly = [
    box('rama', 'dodaj', x + 2 * r, y + 2 * r, g, [0, 0, 0]),
    box('otwor', 'odejmij', x, y, g + 2, [r, r, -1])
  ];
  return {
    nazwa: 'Ramka ' + x + '×' + y,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Ramka z szablonu ramka. Rant ' + r + ' mm. Drukuj płasko na płycie.'
  };
}

/**
 * Krzyż rurowy — 4 ramiona jak trójnik + kula mostka.
 * @param {number} fi — średnica zewn. [mm]
 */
export function krzyz(fi) {
  const L = fi * 3;
  const bryly = [
    box('ramie_x', 'dodaj', L, fi, fi, [0, 0, 0]),
    box('ramie_y', 'dodaj', fi, L, fi, [(L - fi) / 2, 0, 0])
  ];
  return {
    nazwa: 'Krzyz Fi' + fi,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Krzyż z szablonu krzyz. Ramiona pełne (mostek w środku), długość ' + L + ' mm. Drukuj płasko na płycie.'
  };
}

/**
 * Klips / spinka U.
 * @param {number} w — szerokość otwarcia [mm]
 * @param {number} h — wysokość ramion [mm]
 */
export function klipsU(w, h) {
  const g = 2.4;
  const gl = 12;
  const bryly = [
    box('grzbiet', 'dodaj', w + 2 * g, gl, g, [0, 0, 0]),
    box('ramie_l', 'dodaj', g, gl, h, [0, 0, 0]),
    box('ramie_p', 'dodaj', g, gl, h, [w + g, 0, 0])
  ];
  return {
    nazwa: 'Klips U ' + w + '×' + h,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Klips U z szablonu klipsU. Drukuj grzbietem na płycie.'
  };
}

/**
 * Gridfinity bin — siatka 42 mm, wysokość w jednostkach U (7 mm).
 * Specyfikacja Zack Freedman, CC BY 4.0. Własna implementacja CSG (nie AGPL).
 * @param {number} nx — liczba jednostek X
 * @param {number} ny — liczba jednostek Y
 * @param {number} hU — wysokość w U
 */
export function gridfinityBin(nx, ny, hU) {
  const nX = Math.max(1, Math.floor(Number(nx)));
  const nY = Math.max(1, Math.floor(Number(ny)));
  const u = Math.max(1, Math.floor(Number(hU)));
  const grid = 42;
  const g = 1.6;
  const magnetZ = 2.4;
  const x = nX * grid;
  const y = nY * grid;
  const z = u * 7;
  const bryly = [
    box('skorupa', 'dodaj', x, y, z, [0, 0, 0]),
    box('wnetrze', 'odejmij', x - 2 * g, y - 2 * g, z, [g, g, magnetZ])
  ];
  return {
    nazwa: 'Gridfinity bin ' + nX + '×' + nY + '×' + u + 'U',
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Gridfinity bin z szablonu gridfinityBin. Siatka 42 mm, ' + u + 'U. Specyfikacja Zack Freedman, CC BY 4.0. Drukuj dnem na płycie.'
  };
}

export const SZABLONY_12C = [
  { id: 'mocowanieWentylatora', nazwa: 'Mocowanie wentylatora', tagi: ['wentylator'], parametry: 'fi', fn: mocowanieWentylatora, przyklad: 'mocowanieWentylatora(80)', opis: 'Wymagane: fi (40/80/120).' },
  { id: 'uchwytDysku', nazwa: 'Uchwyt dysku', tagi: ['dysk'], parametry: 'w, dl', fn: uchwytDysku, przyklad: 'uchwytDysku(70, 100)', opis: 'Wymagane: w, dl (wnęka).' },
  { id: 'prowadnica', nazwa: 'Prowadnica C', tagi: ['prowadnica'], parametry: 'dl, w, h', fn: prowadnica, przyklad: 'prowadnica(120, 20, 16)', opis: 'Wymagane: dl, w, h.' },
  { id: 'kanal', nazwa: 'Kanał U', tagi: ['kanal'], parametry: 'dl, w, h', fn: kanal, przyklad: 'kanal(100, 20, 16)', opis: 'Wymagane: dl, w, h.' },
  { id: 'obudowa', nazwa: 'Obudowa', tagi: ['obudowa'], parametry: 'x, y, z', fn: obudowa, przyklad: 'obudowa(80, 50, 30)', opis: 'Wymagane: x, y, z wewn.' },
  { id: 'ramka', nazwa: 'Ramka', tagi: ['ramka'], parametry: 'x, y, grub, rant', fn: ramka, przyklad: 'ramka(80, 50, 3, 12)', opis: 'Wymagane: x, y. grub 3, rant 12.' },
  { id: 'krzyz', nazwa: 'Krzyż rurowy', tagi: ['krzyz'], parametry: 'fi', fn: krzyz, przyklad: 'krzyz(20)', opis: 'Wymagane: fi.' },
  { id: 'klipsU', nazwa: 'Klips U', tagi: ['klips'], parametry: 'w, h', fn: klipsU, przyklad: 'klipsU(10, 16)', opis: 'Wymagane: w, h.' },
  { id: 'gridfinityBin', nazwa: 'Gridfinity bin', tagi: ['gridfinity'], parametry: 'nx, ny, hU', fn: gridfinityBin, przyklad: 'gridfinityBin(1, 1, 3)', opis: 'Wymagane: nx, ny, hU. CC BY 4.0 Zack Freedman.' }
];
