/**
 * Szablony 12B — płytowe / gaming / biurko. Kontrakt jak szablony-home.js.
 * Zasada BRYLY=1: mostki (nakładające się bryły).
 */
'use strict';

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

/**
 * Podstawka laptopa — baza + pochylony blat (mostek przy krawędzi).
 * @param {number} w — szerokość [mm]
 * @param {number} gl — głębokość blatu [mm]
 * @param {number} kat — kąt od poziomu [deg]
 */
export function podstawkaLaptopa(w, gl, kat) {
  const k = Number(kat);
  const g = 4;
  const bryly = [
    box('baza', 'dodaj', w, gl, g, [0, 0, 0]),
    box('mostek', 'dodaj', w, 20, 10, [0, 0, 0]),
    box('blat', 'dodaj', w, gl, g, [0, 0, g], [k, 0, 0])
  ];
  return {
    nazwa: 'Podstawka laptopa ' + w + '×' + gl,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Podstawka laptopa z szablonu podstawkaLaptopa. Kąt ' + k + '°. Drukuj bazą na płycie.'
  };
}

/**
 * Stojak monitora — pełny cokół.
 * @param {number} x — szerokość [mm]
 * @param {number} y — głębokość [mm]
 * @param {number} z — wysokość [mm]
 */
export function stojakMonitora(x, y, z) {
  return {
    nazwa: 'Stojak monitora ' + x + '×' + y + '×' + z,
    material: 'PETG',
    bryly: [box('cokol', 'dodaj', x, y, z, [0, 0, 0])],
    cechy: [],
    uwagi_do_druku: 'Stojak monitora z szablonu stojakMonitora. Drukuj podstawą na płycie.'
  };
}

/**
 * Stojak pada — baza + rant + gniazdo (szerokość szczeliny).
 * @param {number} w — szerokość [mm]
 * @param {number} kat — kąt oparcia [deg]
 * @param {number} gniazdo — szerokość szczeliny [mm]
 */
export function stojakPada(w, kat, gniazdo) {
  const k = Number(kat);
  const slot = Number(gniazdo);
  const g = 4;
  const bazaY = 70;
  const tilt = 90 - k;
  const bryly = [
    box('baza', 'dodaj', w, bazaY, g, [0, 0, 0]),
    box('rant', 'dodaj', w, 10, 10, [0, 0, g]),
    box('mostek', 'dodaj', w, 16, 12, [0, bazaY - 16, 0]),
    box('oparcie', 'dodaj', w, g, 80, [0, bazaY - g - 4, 0], [tilt, 0, 0]),
    box('szczelina', 'odejmij', slot, 14, 16, [(w - slot) / 2, 8, g - 1])
  ];
  return {
    nazwa: 'Stojak pada ' + w + ' mm',
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Stojak pada z szablonu stojakPada. Szczelina ' + slot + ' mm. Drukuj bazą na płycie.'
  };
}

/**
 * Uchwyt słuchawek — tarcza + słupek + hak (mostki).
 * @param {number} h — wysokość słupka [mm]
 * @param {number} dl — wysięg haka [mm]
 */
export function uchwytSluchawek(h, dl) {
  const fiB = 48;
  const fiP = 12;
  const g = 4;
  const bryly = [
    walec('baza', 'dodaj', fiB, g, [0, 0, 0]),
    walec('slup', 'dodaj', fiP, h + g, [0, 0, 0]),
    box('hak', 'dodaj', dl + fiP, g, g, [0, (fiP - g) / 2, h])
  ];
  return {
    nazwa: 'Uchwyt sluchawek H' + h,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Uchwyt słuchawek z szablonu uchwytSluchawek. Drukuj tarczą na płycie.'
  };
}

/**
 * Uchwyt ręcznika — pręt + wsporniki ścienne (mostek: pręt w płytkach).
 * @param {number} dl — długość pręta [mm]
 * @param {number} fi — średnica pręta [mm]
 * @param {number} wsporniki — liczba wsporników, domyślnie 2
 */
export function uchwytRecznika(dl, fi, wsporniki) {
  const nn = (wsporniki == null || wsporniki === '') ? 2 : Math.max(2, Math.floor(Number(wsporniki)));
  const g = 4;
  const plyZ = 36;
  const pretZ = 16;
  const bryly = [
    box('pret', 'dodaj', dl, fi, fi, [0, 0, pretZ])
  ];
  for (let i = 0; i < nn; i++) {
    const x = (i * (dl - 16)) / (nn - 1);
    bryly.push(box('plytka_' + (i + 1), 'dodaj', 16, g, plyZ, [x, 0, 0]));
  }
  return {
    nazwa: 'Uchwyt recznika L' + dl,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Uchwyt ręcznika z szablonu uchwytRecznika. ' + nn + ' wsporniki. Drukuj płytkami na płycie.'
  };
}

/**
 * Uchwyt ładowarki — kieszeń + otwór na kabel.
 * @param {number} x — szerokość wewn. [mm]
 * @param {number} y — głębokość wewn. [mm]
 * @param {number} z — wysokość wewn. [mm]
 * @param {number} otwor — średnica otworu na kabel [mm]
 */
export function uchwytLadowarki(x, y, z, otwor) {
  const g = 2.4;
  const d = Number(otwor);
  const bryly = [
    box('skorupa', 'dodaj', x + 2 * g, y + 2 * g, z + g, [0, 0, 0]),
    box('wnetrze', 'odejmij', x, y, z + 1, [g, g, g]),
    walec('kabel', 'odejmij', d, g + 4, [(x + 2 * g - d) / 2, y + g - 1, g + 4], [90, 0, 0])
  ];
  return {
    nazwa: 'Uchwyt ladowarki ' + x + '×' + y + '×' + z,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Uchwyt ładowarki z szablonu uchwytLadowarki. Otwór kabla Ø' + d + '. Drukuj dnem na płycie.'
  };
}

/**
 * Uchwyt pamięci USB — n szczelin.
 * @param {number} n — liczba szczelin
 * @param {number} szczelina — szerokość szczeliny [mm]
 */
export function uchwytPamieci(n, szczelina) {
  const nn = Math.max(1, Math.floor(Number(n)));
  const s = Number(szczelina);
  const g = 2;
  const gl = 14;
  const h = 18;
  const pitch = s + g;
  const x = nn * pitch + g;
  const bryly = [box('baza', 'dodaj', x, gl, h, [0, 0, 0])];
  for (let i = 0; i < nn; i++) {
    bryly.push(box('szczelina_' + (i + 1), 'odejmij', s, gl - g, h, [g + i * pitch, g, g]));
  }
  return {
    nazwa: 'Uchwyt pamieci n' + nn,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Uchwyt pamięci z szablonu uchwytPamieci. ' + nn + ' szczelin ' + s + ' mm. Drukuj bazą na płycie.'
  };
}

/**
 * Wspornik GPU — tarcza + kolumna (mostek).
 * @param {number} h — wysokość kolumny [mm]
 * @param {number} podstawa — średnica tarczy [mm]
 */
export function wspornikGpu(h, podstawa) {
  const fiB = Number(podstawa);
  const fiP = Math.min(16, fiB * 0.4);
  const g = 4;
  const bryly = [
    walec('baza', 'dodaj', fiB, g, [0, 0, 0]),
    walec('kolumna', 'dodaj', fiP, h + g, [0, 0, 0]),
    walec('pad', 'dodaj', Math.min(fiB * 0.6, 28), 3, [0, 0, h + g - 1])
  ];
  return {
    nazwa: 'Wspornik GPU H' + h,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Wspornik GPU z szablonu wspornikGpu. Drukuj tarczą na płycie.'
  };
}

export const SZABLONY_12B = [
  { id: 'podstawkaLaptopa', nazwa: 'Podstawka laptopa', tagi: ['laptop'], parametry: 'w, gl, kat', fn: podstawkaLaptopa, przyklad: 'podstawkaLaptopa(260, 180, 15)', opis: 'Wymagane: w, gl, kat.' },
  { id: 'stojakMonitora', nazwa: 'Stojak monitora', tagi: ['monitor'], parametry: 'x, y, z', fn: stojakMonitora, przyklad: 'stojakMonitora(120, 120, 80)', opis: 'Wymagane: x, y, z.' },
  { id: 'stojakPada', nazwa: 'Stojak pada', tagi: ['pad'], parametry: 'w, kat, gniazdo', fn: stojakPada, przyklad: 'stojakPada(80, 65, 22)', opis: 'Wymagane: w, kat, gniazdo.' },
  { id: 'uchwytSluchawek', nazwa: 'Uchwyt słuchawek', tagi: ['sluchawki'], parametry: 'h, dl', fn: uchwytSluchawek, przyklad: 'uchwytSluchawek(140, 40)', opis: 'Wymagane: h, dl.' },
  { id: 'uchwytRecznika', nazwa: 'Uchwyt ręcznika', tagi: ['recznik'], parametry: 'dl, fi, wsporniki', fn: uchwytRecznika, przyklad: 'uchwytRecznika(250, 16, 2)', opis: 'Wymagane: dl, fi. wsporniki=2.' },
  { id: 'uchwytLadowarki', nazwa: 'Uchwyt ładowarki', tagi: ['ladowarka'], parametry: 'x, y, z, otwor', fn: uchwytLadowarki, przyklad: 'uchwytLadowarki(70, 40, 30, 8)', opis: 'Wymagane: x, y, z, otwor.' },
  { id: 'uchwytPamieci', nazwa: 'Uchwyt pamięci', tagi: ['usb'], parametry: 'n, szczelina', fn: uchwytPamieci, przyklad: 'uchwytPamieci(4, 2.4)', opis: 'Wymagane: n, szczelina.' },
  { id: 'wspornikGpu', nazwa: 'Wspornik GPU', tagi: ['gpu'], parametry: 'h, podstawa', fn: wspornikGpu, przyklad: 'wspornikGpu(50, 40)', opis: 'Wymagane: h, podstawa.' }
];
