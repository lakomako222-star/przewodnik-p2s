/**
 * Szablony 12E — donice faliste/ażurowe, klamra/obejma, napis, deszczownica, zaczepy tablic.
 * Kontrakt jak 12d: fragment SPEC { nazwa, material, bryly, cechy, uwagi_do_druku }.
 * Zasada BRYLY=1: mostki (nakładające się dodaj). Szyk = pętla JS (brak array w silniku).
 */
'use strict';

function num(v, d) {
  if (v == null || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

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

function konturFali(r, nFal, amp, styl, nPts) {
  const n = Math.max(24, Math.floor(num(nPts, 72)));
  const nf = Math.max(4, Math.floor(num(nFal, 10)));
  const a = Math.max(0.6, num(amp, 2.4));
  const ribbed = String(styl || 'wave').toLowerCase() === 'ribbed';
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    const s = Math.sin(nf * t);
    const d = ribbed ? (s >= 0 ? a : -a * 0.35) : a * s;
    const rr = Math.max(4, r + d);
    pts.push([rr * Math.cos(t), rr * Math.sin(t)]);
  }
  return pts;
}

/**
 * Doniczka falista / żebrowana — wyciągnięcie konturu sinus/ząb ze skrętem i zwężeniem.
 * @param {number} fi @param {number} h
 * @param {string} [styl] wave|ribbed
 * @param {number} [amplituda] @param {number} [n_fal] @param {number} [skret_deg]
 * @param {number} [zwezenie] skala górna 0.5–1 @param {number} [drenaz] 0|1
 */
export function doniczkaFalista(fi, h, styl, amplituda, n_fal, skret_deg, zwezenie, drenaz) {
  const R = Number(fi) / 2;
  const H = Number(h);
  const g = 2.4;
  const dno = 3;
  const zwn = Math.min(1, Math.max(0.55, num(zwezenie, 0.88)));
  const skret = num(skret_deg, 25);
  const amp = num(amplituda, Math.max(1.6, R * 0.06));
  const zew = konturFali(R, n_fal, amp, styl, 80);
  const wew = konturFali(Math.max(R - g, 5), n_fal, amp * 0.85, styl, 80);
  const bryly = [
    {
      id: 'zewn', operacja: 'dodaj',
      ksztalt: { typ: 'wyciagniecie', kontur: zew, wysokosc_mm: H, skret_deg: skret, zwezenie_gora: [zwn, zwn] },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'wnetrze', operacja: 'odejmij',
      ksztalt: { typ: 'wyciagniecie', kontur: wew, wysokosc_mm: Math.max(H - dno + 1, 4), skret_deg: skret, zwezenie_gora: [zwn, zwn] },
      pozycja_mm: [0, 0, dno], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  if (num(drenaz, 1) > 0) {
    bryly.push(walec('drenaz', 'odejmij', 8, dno + 2, [0, 0, -1]));
  }
  return {
    nazwa: 'Doniczka falista Fi' + fi + ' H' + h,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Doniczka falista (styl ' + (styl || 'wave') + ', skręt ' + skret + '°). Drukuj dnem na płycie.'
  };
}

/**
 * Doniczka ażurowa — pierścień z N szczelinami, wyciągnięty ze skrętem.
 * @param {number} fi @param {number} h @param {number} [n_listew] @param {number} [skret_deg]
 */
export function doniczkaAzurowa(fi, h, n_listew, skret_deg) {
  const R = Number(fi) / 2;
  const H = Number(h);
  const nn = Math.max(6, Math.floor(num(n_listew, 16)));
  const g = 3.2;
  const dno = 4;
  const skret = num(skret_deg, 40);
  const nPts = nn * 8;
  const zew = [];
  const wew = [];
  const szcz = 0.38;
  for (let i = 0; i < nPts; i++) {
    const t = (2 * Math.PI * i) / nPts;
    const k = (i / 8) % 1;
    const wSzczelinie = k > szcz;
    const rZ = wSzczelinie ? R : R - g * 0.15;
    zew.push([rZ * Math.cos(t), rZ * Math.sin(t)]);
    wew.push([(R - g) * Math.cos(t), (R - g) * Math.sin(t)]);
  }
  const bryly = [
    {
      id: 'kosz', operacja: 'dodaj',
      ksztalt: { typ: 'wyciagniecie', kontur: zew, otwory: [wew], wysokosc_mm: H, skret_deg: skret, zwezenie_gora: [0.92, 0.92] },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    walec('dno', 'dodaj', fi - 2, dno, [0, 0, 0]),
    walec('drenaz', 'odejmij', 8, dno + 2, [0, 0, -1])
  ];
  return {
    nazwa: 'Doniczka azurowa Fi' + fi + ' H' + h,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Doniczka ażurowa, ' + nn + ' listew, skręt ' + skret + '°. Wkład osobno (kubek). Drukuj dnem na płycie.'
  };
}

function uszySruba(bryly, prefix, x, y, z, gwint) {
  const m5 = String(gwint || 'M4').toUpperCase() === 'M5';
  const fiO = m5 ? 5.3 : 4.3;
  const hex = m5 ? 9.2 : 8.1;
  const hN = m5 ? 4.2 : 3.4;
  const ucho = 12;
  bryly.push(box(prefix + '_uchoL', 'dodaj', ucho, 10, z, [x - ucho + 1, y, 0]));
  bryly.push(box(prefix + '_uchoP', 'dodaj', ucho, 10, z, [x + 1, y, 0]));
  bryly.push(walec(prefix + '_otw', 'odejmij', fiO, z + 4, [x - fiO / 2, y + 5 - fiO / 2, -1]));
  bryly.push({
    id: prefix + '_nakr', operacja: 'odejmij',
    ksztalt: { typ: 'graniastoslup', liczba_bokow: 6, srednica_opisana_mm: hex, wysokosc_mm: hN },
    pozycja_mm: [x - hex / 2, y + 5 - hex / 2, 1], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
  });
}

/**
 * Klamra rurowa — C z uszami pod śrubę M4/M5 i kieszenią nakrętki (jedna bryła, mostki).
 * @param {number} fi — Ø rury @param {number} dl — długość wzdłuż rury @param {string} [gwint] M4|M5
 */
export function klamraRurowa(fi, dl, gwint) {
  const d = Number(fi);
  const L = Math.max(12, Number(dl));
  const g = 4;
  const z = L;
  const y = d + 2 * g;
  const x = d + 2 * g + 4;
  const bryly = [
    box('korpus', 'dodaj', x, y, z, [0, 0, 0]),
    walec('rura', 'odejmij', d, z + 4, [(x - d) / 2, (y - d) / 2, -1]),
    box('szczelina', 'odejmij', g + 2, y + 2, z + 2, [x - g - 1, -1, -1])
  ];
  uszySruba(bryly, 's', x - 2, -8, z, gwint);
  return {
    nazwa: 'Klamra rurowa Fi' + fi,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Klamra rurowa, gniazdo ' + (gwint || 'M4') + ' + kieszeń nakrętki. Drukuj uszami na płycie.'
  };
}

/**
 * Obejma — zamknięty pierścień z jednym uchem śruby (nie mylić z klamrą C).
 * @param {number} fi @param {number} dl @param {string} [gwint]
 */
export function obejma(fi, dl, gwint) {
  const d = Number(fi);
  const L = Math.max(10, Number(dl));
  const g = 3.6;
  const zew = d + 2 * g;
  const r = zew / 2;
  const bryly = [
    walec('zewn', 'dodaj', zew, L, [0, 0, 0]),
    walec('wnetrze', 'odejmij', d, L + 4, [0, 0, -1]),
    box('ucho', 'dodaj', 14, 10, L, [r - 4, -5, 0])
  ];
  const m5 = String(gwint || 'M4').toUpperCase() === 'M5';
  const fiO = m5 ? 5.3 : 4.3;
  bryly.push(walec('otw', 'odejmij', fiO, L + 4, [r + 3 - fiO / 2, -fiO / 2, -1]));
  return {
    nazwa: 'Obejma Fi' + fi,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Obejma rurowa (pierścień), ' + (gwint || 'M4') + '. Drukuj osią pionowo.'
  };
}

/**
 * Uchwyt słuchawki prysznicowej — klamra na rurę + pierścień na słuchawkę.
 * @param {number} fiRury @param {number} fiSluchawki @param {number} [kat]
 */
export function uchwytSluchawkiPrysznicowej(fiRury, fiSluchawki, kat) {
  const fr = Number(fiRury);
  const fs = Number(fiSluchawki);
  const k = num(kat, 15);
  const kl = klamraRurowa(fr, 18, 'M4');
  const bryly = (kl.bryly || []).slice();
  const mostekY = fr + 8;
  bryly.push(box('mostek', 'dodaj', 16, 28, 8, [fr / 2, mostekY - 4, 5]));
  bryly.push(walec('pierscien', 'dodaj', fs + 10, 16, [fr / 2, mostekY + 18, 4], [k, 0, 0]));
  bryly.push(walec('otworSl', 'odejmij', fs, 20, [fr / 2, mostekY + 18, 2], [k, 0, 0]));
  return {
    nazwa: 'Uchwyt sluchawki prysznic Fi' + fs,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Klamra na rurę Ø' + fr + ' + pierścień słuchawki Ø' + fs + '. Drukuj klamrą na płycie.'
  };
}

function linieNapis(linie) {
  if (Array.isArray(linie)) return linie.map(function (s) { return String(s); }).filter(Boolean);
  return String(linie || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
}

/**
 * Napis wielolinijkowy. Wiele wierszy = linie[] (\\n w stringu NIE łamie wiersza w silniku).
 * @param {string|string[]} linie @param {number} h — wysokość glifu @param {number} [grub]
 * @param {number} [nogi] @param {number} [ramka] 1|0
 */
export function napisTopper(linie, h, grub, nogi, ramka) {
  const ln = linieNapis(linie);
  const hh = Number(h);
  const g = num(grub, 8);
  const ng = num(nogi, 0);
  const ram = num(ramka, 1) !== 0;
  return {
    nazwa: 'Napis ' + (ln[0] || '').slice(0, 24),
    material: 'PLA',
    bryly: [{
      id: 'glify', operacja: 'dodaj',
      ksztalt: {
        typ: 'napis', tekst: ln.join(' '), linie: ln, wysokosc_mm: hh, grubosc_mm: g,
        ramka: ram, nogi_mm: ng, szerokosc_nogi_mm: 4, liczba_nog: ng > 0 ? 2 : 0
      },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }],
    cechy: [],
    uwagi_do_druku: 'Napis Dancing Script (OFL). Wiersze w linie[], nie przez \\n. Drukuj płasko na płycie.'
  };
}

/**
 * Deszczownica — talerz, komora, siatka dysz (odejmij walec, NIE cecha otwor — OTWOR_MALY nie pali).
 * Szyjka z kieszenią pod adapter G1/2. Źródło gwintu: ISO 228-1 G1/2 Ø≈20,96 mm.
 * @param {number} fi @param {number} nDysz @param {number} [fiDyszy]
 */
export function deszczownica(fi, nDysz, fiDyszy) {
  const D = Number(fi);
  const nn = Math.max(7, Math.floor(num(nDysz, 37)));
  const fd = Math.max(1.2, Math.min(1.8, num(fiDyszy, 1.4)));
  const g = 2.4;
  const talerz = 8;
  const komora = 3;
  const szyjkaH = 12;
  const g12 = 21.2;
  const bryly = [
    walec('talerz', 'dodaj', D, talerz, [0, 0, 0]),
    walec('komora', 'odejmij', D - 2 * g, komora, [0, 0, g]),
    walec('szyjka', 'dodaj', g12 + 6, szyjkaH, [0, 0, talerz - 3]),
    walec('kieszenG', 'odejmij', g12, szyjkaH, [0, 0, talerz])
  ];
  const rMax = D / 2 - 8;
  const pierścienie = Math.max(1, Math.round(Math.sqrt(nn / 3)));
  let k = 0;
  for (let p = 0; p < pierścienie && k < nn; p++) {
    const rp = (p + 1) / (pierścienie + 0.3) * rMax;
    const naP = Math.min(nn - k, Math.max(6, Math.round(2 * Math.PI * rp / 8)));
    for (let i = 0; i < naP && k < nn; i++) {
      const t = (2 * Math.PI * i) / naP;
      bryly.push(walec('dysza_' + k, 'odejmij', fd, talerz + 4, [rp * Math.cos(t), rp * Math.sin(t), -1]));
      k++;
    }
  }
  if (k < nn) bryly.push(walec('dysza_c', 'odejmij', fd, talerz + 4, [0, 0, -1]));
  return {
    nazwa: 'Deszczownica Fi' + fi,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Deszczownica: ' + k + ' dysz Ø' + fd + ' mm jako odejmij (nie cecha otwor — OTWOR_MALY by zablokował 1,2–1,6 mm). Kieszeń G1/2 ISO 228-1. Test na kuponie przed montażem. Drukuj talerzem na płycie.'
  };
}

/** IKEA SKÅDIS: otwór 5 mm, siatka 40×20 mm (offset). Źródło: publikacja IKEA SKÅDIS. */
export function zaczepSkadis(h, w) {
  const H = Number(h);
  const W = num(w, 20);
  const pinFi = 4.8;
  const pinL = 12;
  const bryly = [
    box('plytka', 'dodaj', W, 4, H, [0, 0, 0]),
    box('pin1', 'dodaj', pinFi, pinL, pinFi, [W / 2 - pinFi / 2, 3, H - 10]),
    box('pin2', 'dodaj', pinFi, pinL, pinFi, [W / 2 - pinFi / 2, 3, H - 10 - 40]),
    box('hak', 'dodaj', W, 18, 4, [0, -14, 2])
  ];
  return {
    nazwa: 'Zaczep Skadis H' + h,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Zaczep SKÅDIS (otwór 5 mm, rozstaw 40 mm). Źródło: specyfikacja IKEA SKÅDIS. Drukuj płytką na płycie.'
  };
}

/** Pegboard 1/4″ otwory, 1″ siatka. Źródło: ANSI/common 1/4" pegboard. */
export function zaczepPegboard(h, w) {
  const H = Number(h);
  const W = num(w, 22);
  const pinFi = 6.0;
  const pinL = 14;
  const roz = 25.4;
  const bryly = [
    box('plytka', 'dodaj', W, 4, H, [0, 0, 0]),
    box('pin1', 'dodaj', pinFi, pinL, pinFi, [W / 2 - pinFi / 2, 3, H - 12]),
    box('pin2', 'dodaj', pinFi, pinL, pinFi, [W / 2 - pinFi / 2, 3, H - 12 - roz]),
    box('hak', 'dodaj', W, 20, 4, [0, -16, 2])
  ];
  return {
    nazwa: 'Zaczep Pegboard H' + h,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Zaczep pegboard 1/4″ / 1″ (6,0 / 25,4 mm). Źródło: typowa płyta 1/4″. Drukuj płytką na płycie.'
  };
}

/** Multiboard: siatka 25 mm, kołek ~8 mm. Źródło: Keep Making / Multiboard public wiki. */
export function zaczepMultiboard(h, w) {
  const H = Number(h);
  const W = num(w, 24);
  const pinFi = 7.5;
  const pinL = 8;
  const roz = 25;
  const bryly = [
    box('plytka', 'dodaj', W, 4, H, [0, 0, 0]),
    box('pin1', 'dodaj', pinFi, pinL, pinFi, [W / 2 - pinFi / 2, 3, H - 12]),
    box('pin2', 'dodaj', pinFi, pinL, pinFi, [W / 2 - pinFi / 2, 3, H - 12 - roz]),
    box('hak', 'dodaj', W, 16, 4, [0, -12, 2])
  ];
  return {
    nazwa: 'Zaczep Multiboard H' + h,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Zaczep Multiboard (siatka 25 mm). Źródło: dokumentacja publiczna Multiboard. Drukuj płytką na płycie.'
  };
}

export const SZABLONY_12E = [
  { id: 'doniczkaFalista', nazwa: 'Doniczka falista', tagi: ['doniczka'], parametry: 'fi, h, styl, amplituda, n_fal, skret_deg, zwezenie, drenaz', fn: doniczkaFalista, przyklad: 'doniczkaFalista(90, 100, "wave", 2.4, 10, 25, 0.88, 1)', opis: 'Wymagane: fi, h. styl=wave|ribbed.' },
  { id: 'doniczkaAzurowa', nazwa: 'Doniczka ażurowa', tagi: ['doniczka'], parametry: 'fi, h, n_listew, skret_deg', fn: doniczkaAzurowa, przyklad: 'doniczkaAzurowa(90, 110, 16, 40)', opis: 'Wymagane: fi, h.' },
  { id: 'klamraRurowa', nazwa: 'Klamra rurowa', tagi: ['klamra'], parametry: 'fi, dl, gwint', fn: klamraRurowa, przyklad: 'klamraRurowa(22, 16, "M4")', opis: 'Wymagane: fi, dl.' },
  { id: 'obejma', nazwa: 'Obejma', tagi: ['obejma'], parametry: 'fi, dl, gwint', fn: obejma, przyklad: 'obejma(22, 14, "M4")', opis: 'Wymagane: fi, dl.' },
  { id: 'uchwytSluchawkiPrysznicowej', nazwa: 'Uchwyt słuchawki prysznicowej', tagi: ['prysznic'], parametry: 'fiRury, fiSluchawki, kat', fn: uchwytSluchawkiPrysznicowej, przyklad: 'uchwytSluchawkiPrysznicowej(22, 25, 15)', opis: 'Wymagane: fiRury, fiSluchawki.' },
  { id: 'napisTopper', nazwa: 'Napis', tagi: ['napis'], parametry: 'linie, h, grub, nogi, ramka', fn: napisTopper, przyklad: 'napisTopper(["STO LAT"], 28, 8, 0, 1)', opis: 'Wymagane: linie, h.' },
  { id: 'deszczownica', nazwa: 'Deszczownica', tagi: ['prysznic'], parametry: 'fi, nDysz, fiDyszy', fn: deszczownica, przyklad: 'deszczownica(120, 37, 1.4)', opis: 'Wymagane: fi, nDysz.' },
  { id: 'zaczepSkadis', nazwa: 'Zaczep Skadis', tagi: ['zaczep'], parametry: 'h, w', fn: zaczepSkadis, przyklad: 'zaczepSkadis(60, 20)', opis: 'Wymagane: h.' },
  { id: 'zaczepPegboard', nazwa: 'Zaczep Pegboard', tagi: ['zaczep'], parametry: 'h, w', fn: zaczepPegboard, przyklad: 'zaczepPegboard(60, 22)', opis: 'Wymagane: h.' },
  { id: 'zaczepMultiboard', nazwa: 'Zaczep Multiboard', tagi: ['zaczep'], parametry: 'h, w', fn: zaczepMultiboard, przyklad: 'zaczepMultiboard(60, 24)', opis: 'Wymagane: h.' }
];
