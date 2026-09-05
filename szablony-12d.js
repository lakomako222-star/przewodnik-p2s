/**
 * Szablony 12D — łazienka/kuchnia, warsztat/biurko, dom/rodzina.
 * Kontrakt jak szablony-12b/12c. Zasada BRYLY=1: mostki (nakładające się bryły).
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

function num(v, d) {
  if (v == null || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function otworyWDnie(bryly, x, y, g, nn, d) {
  const nx = Math.max(1, Math.floor(Number(nn)));
  const ny = Math.max(2, Math.floor(y / 18));
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const px = g + (i + 0.5) * (x / nx) - d / 2;
      const py = g + (j + 0.5) * (y / ny) - d / 2;
      bryly.push(walec('otwor_' + i + '_' + j, 'odejmij', d, g + 2, [px, py, -1]));
    }
  }
}

/**
 * Mydelniczka — tacka z otworami w dnie.
 * @param {number} x @param {number} y @param {number} z
 * @param {number} [otwory] — kolumny otworów, domyślnie 4
 */
export function mydelniczka(x, y, z, otwory) {
  const g = 2.4;
  const nn = Math.max(1, Math.floor(num(otwory, 4)));
  const baz = pudelko(x, y, z, g);
  const bryly = (baz.bryly || []).slice();
  otworyWDnie(bryly, x, y, g, nn, 6);
  return {
    nazwa: 'Mydelniczka ' + x + '×' + y + '×' + z,
    material: 'PETG',
    bryly, cechy: baz.cechy || [],
    uwagi_do_druku: 'Mydelniczka z szablonu mydelniczka. ' + nn + ' kolumn otworów Ø6. Drukuj dnem na płycie.'
  };
}

/**
 * Uchwyt gąbki — otwarta wannka.
 * @param {number} x @param {number} y @param {number} z
 */
export function uchwytGabki(x, y, z) {
  const g = 2.4;
  const baz = pudelko(x, y, z, g);
  return {
    nazwa: 'Uchwyt gabki ' + x + '×' + y + '×' + z,
    material: 'PETG',
    bryly: baz.bryly || [],
    cechy: baz.cechy || [],
    uwagi_do_druku: 'Uchwyt gąbki z szablonu uchwytGabki. Drukuj dnem na płycie.'
  };
}

/**
 * Uchwyt szczoteczek — kubek + N studzienek w dnie.
 * @param {number} fi @param {number} h @param {number} [n] — domyślnie 4
 */
export function uchwytSzczoteczek(fi, h, n) {
  const g = 2.4;
  const dno = 6;
  const nn = Math.max(1, Math.floor(num(n, 4)));
  const fiW = Math.max(fi - 2 * g, 8);
  const d = Math.min(14, Math.max(8, fiW / (nn + 1)));
  const bryly = [
    walec('zewn', 'dodaj', fi, h, [0, 0, 0]),
    walec('wnetrze', 'odejmij', fiW, Math.max(h - dno + 1, 1), [g, g, dno])
  ];
  const R = Math.max((fiW - d) / 2 - 1, 0);
  for (let i = 0; i < nn; i++) {
    const a = (2 * Math.PI * i) / nn;
    const cx = fi / 2 + R * Math.cos(a) - d / 2;
    const cy = fi / 2 + R * Math.sin(a) - d / 2;
    bryly.push(walec('studnia_' + (i + 1), 'odejmij', d, dno + 2, [cx, cy, -1]));
  }
  return {
    nazwa: 'Uchwyt szczoteczek Fi' + fi + ' H' + h,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Uchwyt szczoteczek z szablonu uchwytSzczoteczek. ' + nn + ' studzienek. Drukuj dnem na płycie.'
  };
}

/**
 * Uchwyt prysznicowy — płytka + pierścień pod kątem.
 * @param {number} fi @param {number} kat
 */
export function uchwytPrysznicowy(fi, kat) {
  const k = Number(kat);
  const g = 4;
  const ply = 70;
  const od = fi + 10;
  const arm = 28;
  const bryly = [
    box('plytka', 'dodaj', ply, ply, g, [0, 0, 0]),
    box('mostek', 'dodaj', 16, arm + 8, g, [(ply - 16) / 2, ply - 8, 0]),
    walec('pierscien', 'dodaj', od, 16, [(ply - od) / 2, ply + arm - od / 2, 0], [k, 0, 0]),
    walec('otwor', 'odejmij', fi, 20, [(ply - fi) / 2, ply + arm - fi / 2, -2], [k, 0, 0])
  ];
  return {
    nazwa: 'Uchwyt prysznicowy Fi' + fi,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Uchwyt prysznicowy z szablonu uchwytPrysznicowy. Kąt ' + k + '°. Drukuj płytką na płycie.'
  };
}

/**
 * Uchwyt papieru — belka + dwa ramiona + trzpień.
 * @param {number} dl — szerokość rolki [mm]
 * @param {number} fi — średnica trzpienia [mm]
 */
export function uchwytPapieru(dl, fi) {
  const g = 4;
  const ramie = Math.max(Number(fi) + 20, 36);
  const belkaX = Number(dl) + 2 * g;
  const H = Math.max(Number(fi) + 8, 24);
  const rodY = ramie - Number(fi) - 2;
  const rodZ = (H - Number(fi)) / 2;
  const bryly = [
    box('belka', 'dodaj', belkaX, g, H, [0, 0, 0]),
    box('ramie_l', 'dodaj', g, ramie, H, [0, 0, 0]),
    box('ramie_p', 'dodaj', g, ramie, H, [belkaX - g, 0, 0]),
    walec('trzpien', 'dodaj', fi, belkaX, [0, rodY, rodZ], [0, 90, 0])
  ];
  return {
    nazwa: 'Uchwyt papieru ' + dl + ' Fi' + fi,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Uchwyt papieru z szablonu uchwytPapieru. Drukuj belką na płycie.'
  };
}

/**
 * Uchwyt łyżek — płytka z rynną.
 * @param {number} x @param {number} y
 */
export function uchwytLyzek(x, y) {
  const g = 8;
  const fi = Math.min(y * 0.6, 28);
  const bryly = [
    box('plytka', 'dodaj', x, y, g, [0, 0, 0]),
    walec('rynna', 'odejmij', fi, x + 2, [-1, (y - fi) / 2, g - fi / 3], [0, 90, 0])
  ];
  return {
    nazwa: 'Uchwyt lyzek ' + x + '×' + y,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Uchwyt łyżek z szablonu uchwytLyzek. Drukuj płytką na płycie.'
  };
}

/**
 * Stojak desek — baza + N szczelin.
 * @param {number} w @param {number} n @param {number} szczelina
 */
export function stojakDesek(w, n, szczelina) {
  const nn = Math.max(1, Math.floor(Number(n)));
  const s = Number(szczelina);
  const g = 4;
  const pitch = s + 10;
  const y = nn * pitch + 16;
  const h = 40;
  const bryly = [box('baza', 'dodaj', w, y, h, [0, 0, 0])];
  for (let i = 0; i < nn; i++) {
    const py = 8 + i * pitch;
    bryly.push(box('szczelina_' + (i + 1), 'odejmij', w - 8, s, h, [4, py, g]));
  }
  return {
    nazwa: 'Stojak desek ' + nn + '×' + s,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Stojak desek z szablonu stojakDesek. ' + nn + ' szczelin ' + s + ' mm. Drukuj bazą na płycie.'
  };
}

/**
 * Miarka — kubek miarowy (objętość tylko w nazwie).
 * @param {number} fi @param {number} h @param {number} [ml]
 */
export function miarka(fi, h, ml) {
  const g = 2.4;
  const dno = 3;
  const fiW = Math.max(fi - 2 * g, 4);
  const v = num(ml, 0);
  const bryly = [
    walec('zewn', 'dodaj', fi, h, [0, 0, 0]),
    walec('wnetrze', 'odejmij', fiW, Math.max(h - dno + 1, 1), [g, g, dno])
  ];
  return {
    nazwa: v ? ('Miarka ' + v + ' ml') : ('Miarka Fi' + fi + ' H' + h),
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Miarka z szablonu miarka. Drukuj dnem na płycie.'
  };
}

/**
 * Organizer kabli / cable comb.
 * @param {number} n @param {number} fi
 */
export function organizerKabli(n, fi) {
  const nn = Math.max(1, Math.floor(Number(n)));
  const d = Number(fi);
  const pitch = d + 4;
  const L = nn * pitch + 10;
  const H = d + 10;
  const gl = 14;
  const bryly = [box('belka', 'dodaj', L, gl, H, [0, 0, 0])];
  for (let i = 0; i < nn; i++) {
    const px = 5 + i * pitch;
    bryly.push(walec('slot_' + (i + 1), 'odejmij', d, gl + 2, [px, -1, 8], [90, 0, 0]));
    bryly.push(box('wylot_' + (i + 1), 'odejmij', d * 0.55, gl + 2, H, [px + d * 0.225, -1, 8 + d / 2]));
  }
  return {
    nazwa: 'Organizer kabli ' + nn + '×Fi' + d,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Organizer kabli z szablonu organizerKabli. Drukuj belką na płycie.'
  };
}

/**
 * Uchwyt bitów hex — N gniazd Ø7 w rozstawie.
 * @param {number} n @param {number} rozstaw
 */
export function uchwytBitow(n, rozstaw) {
  const nn = Math.max(1, Math.floor(Number(n)));
  const p = Number(rozstaw);
  const d = 7;
  const x = nn * p + 12;
  const y = 18;
  const z = 16;
  const bryly = [box('blok', 'dodaj', x, y, z, [0, 0, 0])];
  for (let i = 0; i < nn; i++) {
    const px = 6 + i * p + (p - d) / 2;
    bryly.push(walec('gniazdo_' + (i + 1), 'odejmij', d, z + 2, [px, (y - d) / 2, -1]));
  }
  return {
    nazwa: 'Uchwyt bitow ' + nn,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Uchwyt bitów z szablonu uchwytBitow. Gniazda Ø7, rozstaw ' + p + ' mm. Drukuj blokiem na płycie.'
  };
}

/**
 * Uchwyt ścienny tabletu — półka + rant + kąt.
 * @param {number} w @param {number} grub @param {number} kat
 */
export function uchwytSciennyTabletu(w, grub, kat) {
  const k = Number(kat);
  const t = Number(grub);
  const g = 4;
  const gl = 28;
  const bryly = [
    box('plyta', 'dodaj', w, g, 80, [0, 0, 0]),
    box('polka', 'dodaj', w, gl + t, g, [0, 0, 0], [k, 0, 0]),
    box('rant', 'dodaj', w, g, t + 8, [0, gl, g], [k, 0, 0])
  ];
  return {
    nazwa: 'Uchwyt scienny tabletu ' + w,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Uchwyt ścienny tabletu z szablonu uchwytSciennyTabletu. Grubość ' + t + ' mm, kąt ' + k + '°. Drukuj płytą na płycie.'
  };
}

/**
 * Przepust kablowy — kołnierz + tuleja.
 * @param {number} fi @param {number} h
 */
export function przepustKablowy(fi, h) {
  const g = 2.4;
  const ko = fi + 16;
  const bryly = [
    walec('kolnierz', 'dodaj', ko, 3, [0, 0, 0]),
    walec('tuleja', 'dodaj', fi + 2 * g, h + 3, [(ko - fi - 2 * g) / 2, (ko - fi - 2 * g) / 2, 0]),
    walec('otwor', 'odejmij', fi, h + 5, [(ko - fi) / 2, (ko - fi) / 2, -1])
  ];
  return {
    nazwa: 'Przepust kablowy Fi' + fi,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Przepust kablowy z szablonu przepustKablowy. Drukuj kołnierzem na płycie.'
  };
}

/**
 * Klips filamentu — pierścień C.
 * @param {number} fi
 */
export function klipsFilamentu(fi) {
  const g = 2.4;
  const od = fi + 2 * g;
  const w = 10;
  const bryly = [
    walec('pierscien', 'dodaj', od, w, [0, 0, 0]),
    walec('otwor', 'odejmij', fi, w + 2, [g, g, -1]),
    box('szczelina', 'odejmij', g + 2, od, w + 2, [od / 2 - 1, -1, -1])
  ];
  return {
    nazwa: 'Klips filamentu Fi' + fi,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Klips filamentu z szablonu klipsFilamentu. Drukuj płasko na płycie.'
  };
}

/**
 * Stojak dysz — płytka z N otworami M6.
 * @param {number} n
 */
export function stojakDysz(n) {
  const nn = Math.max(1, Math.floor(Number(n)));
  const p = 14;
  const d = 6;
  const x = nn * p + 10;
  const y = 22;
  const z = 10;
  const bryly = [box('plytka', 'dodaj', x, y, z, [0, 0, 0])];
  for (let i = 0; i < nn; i++) {
    const px = 5 + i * p + (p - d) / 2;
    bryly.push(walec('dysz_' + (i + 1), 'odejmij', d, z + 2, [px, (y - d) / 2, -1]));
  }
  return {
    nazwa: 'Stojak dysz ' + nn,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Stojak dysz z szablonu stojakDysz. Otwory Ø6. Drukuj płytką na płycie.'
  };
}

/**
 * Pojemnik desykantu — pudełko z otworami w dnie.
 * @param {number} x @param {number} y @param {number} z @param {number} [otwory]
 */
export function pojemnikDesykantu(x, y, z, otwory) {
  const g = 2.4;
  const nn = Math.max(1, Math.floor(num(otwory, 5)));
  const baz = pudelko(x, y, z, g);
  const bryly = (baz.bryly || []).slice();
  otworyWDnie(bryly, x, y, g, nn, 5);
  return {
    nazwa: 'Pojemnik desykantu ' + x + '×' + y + '×' + z,
    material: 'PETG',
    bryly, cechy: baz.cechy || [],
    uwagi_do_druku: 'Pojemnik desykantu z szablonu pojemnikDesykantu. Drukuj dnem na płycie.'
  };
}

/**
 * Stojak wkrętaków — płytka z N otworami fi.
 * @param {number} n @param {number} fi
 */
export function stojakWkretakow(n, fi) {
  const nn = Math.max(1, Math.floor(Number(n)));
  const d = Number(fi);
  const p = d + 8;
  const x = nn * p + 10;
  const y = d + 16;
  const z = 14;
  const bryly = [box('plytka', 'dodaj', x, y, z, [0, 0, 0])];
  for (let i = 0; i < nn; i++) {
    const px = 5 + i * p + (p - d) / 2;
    bryly.push(walec('gniazdo_' + (i + 1), 'odejmij', d, z + 2, [px, (y - d) / 2, -1]));
  }
  return {
    nazwa: 'Stojak wkretakow ' + nn + '×Fi' + d,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Stojak wkrętaków z szablonu stojakWkretakow. Drukuj płytką na płycie.'
  };
}

/**
 * Zawias prosty — jedno skrzydło + N tulejek (nie print-in-place).
 * @param {number} dl @param {number} fiOsi @param {number} [n]
 */
export function zawiasProsty(dl, fiOsi, n) {
  const nn = Math.max(1, Math.floor(num(n, 3)));
  const d = Number(fiOsi);
  const g = 3;
  const w = 28;
  const bead = d + 2 * g;
  const bryly = [
    box('skrzydlo', 'dodaj', dl, w, g, [0, 0, 0]),
    box('krawedz', 'dodaj', dl, bead, bead, [0, 0, 0])
  ];
  const pitch = dl / (nn + 1);
  for (let i = 0; i < nn; i++) {
    const px = pitch * (i + 1) - d / 2;
    bryly.push(walec('os_' + (i + 1), 'odejmij', d, bead + 2, [px, (bead - d) / 2, -1]));
  }
  return {
    nazwa: 'Zawias prosty ' + dl,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Zawias prosty z szablonu zawiasProsty. Jedno skrzydło, oś Ø' + d + '. Drukuj skrzydłem na płycie.'
  };
}

/**
 * Klips torebki — U ze sprężyną (grzbiet).
 * @param {number} dl @param {number} w
 */
export function klipsTorebki(dl, w) {
  const g = 2.4;
  const h = 14;
  const bryly = [
    box('grzbiet', 'dodaj', dl, g, h, [0, 0, 0]),
    box('szczeka_a', 'dodaj', dl, w, g, [0, 0, 0]),
    box('szczeka_b', 'dodaj', dl, w, g, [0, 0, h - g])
  ];
  return {
    nazwa: 'Klips torebki ' + dl + '×' + w,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Klips torebki z szablonu klipsTorebki. Drukuj szczęką na płycie.'
  };
}

/**
 * Stojak kredek — siatka nx×ny otworów fi.
 * @param {number} nx @param {number} ny @param {number} fi
 */
export function stojakKredek(nx, ny, fi) {
  const nX = Math.max(1, Math.floor(Number(nx)));
  const nY = Math.max(1, Math.floor(Number(ny)));
  const d = Number(fi);
  const p = d + 6;
  const x = nX * p + 10;
  const y = nY * p + 10;
  const z = 30;
  const bryly = [box('blok', 'dodaj', x, y, z, [0, 0, 0])];
  for (let i = 0; i < nX; i++) {
    for (let j = 0; j < nY; j++) {
      const px = 5 + i * p + (p - d) / 2;
      const py = 5 + j * p + (p - d) / 2;
      bryly.push(walec('kredka_' + i + '_' + j, 'odejmij', d, z + 2, [px, py, 4]));
    }
  }
  return {
    nazwa: 'Stojak kredek ' + nX + '×' + nY,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Stojak kredek z szablonu stojakKredek. Drukuj blokiem na płycie.'
  };
}

/**
 * Zaślepka gniazdka — płytka + dwa otwory montażowe.
 * @param {number} x @param {number} y
 */
export function zaslepkaGniazdka(x, y) {
  const g = 3;
  const d = 4;
  const bryly = [
    box('plytka', 'dodaj', x, y, g, [0, 0, 0]),
    walec('sruba_1', 'odejmij', d, g + 2, [8, (y - d) / 2, -1]),
    walec('sruba_2', 'odejmij', d, g + 2, [x - 8 - d, (y - d) / 2, -1])
  ];
  return {
    nazwa: 'Zaslepka gniazdka ' + x + '×' + y,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Zaślepka gniazdka z szablonu zaslepkaGniazdka. Drukuj płytką na płycie.'
  };
}

/**
 * Ochraniacz narożnika — profil L.
 * @param {number} a @param {number} h @param {number} grub
 */
export function ochraniaczNaroznika(a, h, grub) {
  const g = Number(grub);
  const bryly = [
    box('ramie_x', 'dodaj', a, g, h, [0, 0, 0]),
    box('ramie_y', 'dodaj', g, a, h, [0, 0, 0])
  ];
  return {
    nazwa: 'Ochraniacz naroznika ' + a + '×' + h,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Ochraniacz narożnika z szablonu ochraniaczNaroznika. Drukuj ramieniem na płycie.'
  };
}

/**
 * Uchwyt kart — N szczelin.
 * @param {number} n @param {number} szczelina
 */
export function uchwytKart(n, szczelina) {
  const nn = Math.max(1, Math.floor(Number(n)));
  const s = Number(szczelina);
  const g = 3;
  const w = 58;
  const pitch = s + 4;
  const y = nn * pitch + 10;
  const z = 40;
  const bryly = [box('blok', 'dodaj', w, y, z, [0, 0, 0])];
  for (let i = 0; i < nn; i++) {
    const py = 5 + i * pitch;
    bryly.push(box('karta_' + (i + 1), 'odejmij', w - 6, s, z, [3, py, g]));
  }
  return {
    nazwa: 'Uchwyt kart ' + nn,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Uchwyt kart z szablonu uchwytKart. Szczelina ' + s + ' mm. Drukuj blokiem na płycie.'
  };
}

/**
 * Wieszak pada — płyta + dwa ramiona.
 * @param {number} w @param {number} h
 */
export function wieszakPada(w, h) {
  const g = 4;
  const ramie = 28;
  const bryly = [
    box('plyta', 'dodaj', w, g, h, [0, 0, 0]),
    box('ramie_l', 'dodaj', 12, ramie, g, [8, 0, 8]),
    box('ramie_p', 'dodaj', 12, ramie, g, [w - 20, 0, 8]),
    box('stop_l', 'dodaj', 12, g, 10, [8, ramie - g, 8]),
    box('stop_p', 'dodaj', 12, g, 10, [w - 20, ramie - g, 8])
  ];
  return {
    nazwa: 'Wieszak pada ' + w + '×' + h,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Wieszak pada z szablonu wieszakPada. Drukuj płytą na płycie.'
  };
}

/**
 * Uchwyt butelek — płyta + N pierścieni.
 * @param {number} fi @param {number} n
 */
export function uchwytButelek(fi, n) {
  const nn = Math.max(1, Math.floor(Number(n)));
  const d = Number(fi);
  const g = 4;
  const p = d + 8;
  const x = nn * p + 10;
  const y = d + 16;
  const z = 12;
  const bryly = [box('plyta', 'dodaj', x, y, z, [0, 0, 0])];
  for (let i = 0; i < nn; i++) {
    const px = 5 + i * p + (p - d) / 2;
    bryly.push(walec('otwor_' + (i + 1), 'odejmij', d, z + 2, [px, (y - d) / 2, -1]));
  }
  return {
    nazwa: 'Uchwyt butelek ' + nn + '×Fi' + d,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Uchwyt butelek z szablonu uchwytButelek. Drukuj płytą na płycie.'
  };
}

export const SZABLONY_12D = [
  { id: 'mydelniczka', nazwa: 'Mydelniczka', tagi: ['mydlo'], parametry: 'x, y, z, otwory', fn: mydelniczka, przyklad: 'mydelniczka(100, 60, 15, 4)', opis: 'Wymagane: x, y, z. otwory=4.' },
  { id: 'uchwytGabki', nazwa: 'Uchwyt gąbki', tagi: ['gabka'], parametry: 'x, y, z', fn: uchwytGabki, przyklad: 'uchwytGabki(110, 70, 20)', opis: 'Wymagane: x, y, z.' },
  { id: 'uchwytSzczoteczek', nazwa: 'Uchwyt szczoteczek', tagi: ['szczoteczka'], parametry: 'fi, h, n', fn: uchwytSzczoteczek, przyklad: 'uchwytSzczoteczek(80, 90, 4)', opis: 'Wymagane: fi, h. n=4.' },
  { id: 'uchwytPrysznicowy', nazwa: 'Uchwyt prysznicowy', tagi: ['prysznic'], parametry: 'fi, kat', fn: uchwytPrysznicowy, przyklad: 'uchwytPrysznicowy(25, 15)', opis: 'Wymagane: fi, kat.' },
  { id: 'uchwytPapieru', nazwa: 'Uchwyt papieru', tagi: ['papier'], parametry: 'dl, fi', fn: uchwytPapieru, przyklad: 'uchwytPapieru(110, 22)', opis: 'Wymagane: dl, fi.' },
  { id: 'uchwytLyzek', nazwa: 'Uchwyt łyżek', tagi: ['lyzka'], parametry: 'x, y', fn: uchwytLyzek, przyklad: 'uchwytLyzek(120, 40)', opis: 'Wymagane: x, y.' },
  { id: 'stojakDesek', nazwa: 'Stojak desek', tagi: ['deska'], parametry: 'w, n, szczelina', fn: stojakDesek, przyklad: 'stojakDesek(80, 4, 8)', opis: 'Wymagane: w, n, szczelina.' },
  { id: 'miarka', nazwa: 'Miarka', tagi: ['miarka'], parametry: 'fi, h, ml', fn: miarka, przyklad: 'miarka(60, 80, 250)', opis: 'Wymagane: fi, h. ml opcjonalne.' },
  { id: 'organizerKabli', nazwa: 'Organizer kabli', tagi: ['kabel'], parametry: 'n, fi', fn: organizerKabli, przyklad: 'organizerKabli(6, 6)', opis: 'Wymagane: n, fi.' },
  { id: 'uchwytBitow', nazwa: 'Uchwyt bitów', tagi: ['bit'], parametry: 'n, rozstaw', fn: uchwytBitow, przyklad: 'uchwytBitow(6, 14)', opis: 'Wymagane: n, rozstaw.' },
  { id: 'uchwytSciennyTabletu', nazwa: 'Uchwyt ścienny tabletu', tagi: ['tablet'], parametry: 'w, grub, kat', fn: uchwytSciennyTabletu, przyklad: 'uchwytSciennyTabletu(180, 10, 15)', opis: 'Wymagane: w, grub, kat.' },
  { id: 'przepustKablowy', nazwa: 'Przepust kablowy', tagi: ['przepust'], parametry: 'fi, h', fn: przepustKablowy, przyklad: 'przepustKablowy(12, 16)', opis: 'Wymagane: fi, h.' },
  { id: 'klipsFilamentu', nazwa: 'Klips filamentu', tagi: ['filament'], parametry: 'fi', fn: klipsFilamentu, przyklad: 'klipsFilamentu(1.75)', opis: 'Wymagane: fi.' },
  { id: 'stojakDysz', nazwa: 'Stojak dysz', tagi: ['dysza'], parametry: 'n', fn: stojakDysz, przyklad: 'stojakDysz(6)', opis: 'Wymagane: n.' },
  { id: 'pojemnikDesykantu', nazwa: 'Pojemnik desykantu', tagi: ['desykant'], parametry: 'x, y, z, otwory', fn: pojemnikDesykantu, przyklad: 'pojemnikDesykantu(80, 50, 40, 5)', opis: 'Wymagane: x, y, z. otwory=5.' },
  { id: 'stojakWkretakow', nazwa: 'Stojak wkrętaków', tagi: ['wkretak'], parametry: 'n, fi', fn: stojakWkretakow, przyklad: 'stojakWkretakow(6, 8)', opis: 'Wymagane: n, fi.' },
  { id: 'zawiasProsty', nazwa: 'Zawias prosty', tagi: ['zawias'], parametry: 'dl, fiOsi, n', fn: zawiasProsty, przyklad: 'zawiasProsty(60, 4, 3)', opis: 'Wymagane: dl, fiOsi. n=3.' },
  { id: 'klipsTorebki', nazwa: 'Klips torebki', tagi: ['torebka'], parametry: 'dl, w', fn: klipsTorebki, przyklad: 'klipsTorebki(80, 18)', opis: 'Wymagane: dl, w.' },
  { id: 'stojakKredek', nazwa: 'Stojak kredek', tagi: ['kredka'], parametry: 'nx, ny, fi', fn: stojakKredek, przyklad: 'stojakKredek(4, 3, 8)', opis: 'Wymagane: nx, ny, fi.' },
  { id: 'zaslepkaGniazdka', nazwa: 'Zaślepka gniazdka', tagi: ['gniazdko'], parametry: 'x, y', fn: zaslepkaGniazdka, przyklad: 'zaslepkaGniazdka(80, 80)', opis: 'Wymagane: x, y.' },
  { id: 'ochraniaczNaroznika', nazwa: 'Ochraniacz narożnika', tagi: ['naroznik'], parametry: 'a, h, grub', fn: ochraniaczNaroznika, przyklad: 'ochraniaczNaroznika(40, 60, 4)', opis: 'Wymagane: a, h, grub.' },
  { id: 'uchwytKart', nazwa: 'Uchwyt kart', tagi: ['karta'], parametry: 'n, szczelina', fn: uchwytKart, przyklad: 'uchwytKart(5, 2.2)', opis: 'Wymagane: n, szczelina.' },
  { id: 'wieszakPada', nazwa: 'Wieszak pada', tagi: ['pad'], parametry: 'w, h', fn: wieszakPada, przyklad: 'wieszakPada(90, 70)', opis: 'Wymagane: w, h.' },
  { id: 'uchwytButelek', nazwa: 'Uchwyt butelek', tagi: ['butelka'], parametry: 'fi, n', fn: uchwytButelek, przyklad: 'uchwytButelek(70, 3)', opis: 'Wymagane: fi, n.' }
];
