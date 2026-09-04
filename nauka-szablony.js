/**
 * Szablony parametryczne z pamięci katalogu → kod CSG (builder.js).
 * Każdy szablon: nazwa PL, tagi katalogu, funkcja zwracająca SPEC bryły[].
 * Zero zależności poza formatem SPEC. Silnik: Manifold Apache-2.0 (istniejący).
 */
'use strict';

/**
 * Rurowe kolanko (elbow) — dwa walce rury połączone pod kątem.
 * @param {number} fi  — średnica zewnętrzna [mm]
 * @param {number} kat — kąt zagięcia [°], domyślnie 90
 * @param {number} grub — grubość ścianki [mm], domyślnie 2
 * @param {number} dl  — długość ramion [mm], domyślnie 2×fi
 */
export function rurKolanko(fi, kat, grub, dl) {
  const k = kat || 90;
  const g = grub || 2;
  const L = dl || Math.max(fi * 2, 30);
  const R = fi * 1.5;
  const katRad = k * Math.PI / 180;
  const fiWewn = fi - 2 * g;
  // Kolanko = dwa odcinki rury + łuk z segmentów
  // Uproszczenie CSG: dwa prostopadłe odcinki rury + walec łączący
  const bryly = [
    {
      id: 'ramie_a', operacja: 'dodaj',
      ksztalt: { typ: 'rura', wysokosc_mm: L, srednica_zewn_mm: fi, srednica_wewn_mm: fiWewn },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'ramie_b', operacja: 'dodaj',
      ksztalt: { typ: 'rura', wysokosc_mm: L, srednica_zewn_mm: fi, srednica_wewn_mm: fiWewn },
      pozycja_mm: [0, 0, L],
      obrot_deg: [0, -(180 - k), 0],
      srodkowanie: 'brak'
    },
    {
      id: 'lacznik', operacja: 'dodaj',
      ksztalt: { typ: 'kula', srednica_mm: fi },
      pozycja_mm: [0, 0, L], obrot_deg: [0, 0, 0], srodkowanie: 'xyz'
    },
    {
      id: 'droz_lacznik', operacja: 'odejmij',
      ksztalt: { typ: 'kula', srednica_mm: fiWewn },
      pozycja_mm: [0, 0, L], obrot_deg: [0, 0, 0], srodkowanie: 'xyz'
    }
  ];
  return {
    nazwa: 'Kolanko rura Fi' + fi + ' ' + k + '°',
    material: 'PETG',
    bryly,
    cechy: [],
    uwagi_do_druku: 'Kolanko z szablonu rurKolanko. Ścianka ' + g + ' mm. Drukuj pionowo (ramię A na płycie), podpory organiczne na łuku.'
  };
}

/**
 * Adapter / płyta montażowa z otworami.
 * @param {number} w — szerokość [mm]
 * @param {number} h — wysokość [mm]
 * @param {number} grub — grubość [mm], domyślnie 4
 * @param {Array} otwory — [{x,y,d}] pozycje i średnice otworów
 */
export function adapterPlyta(w, h, grub, otwory) {
  const g = grub || 4;
  const bryly = [{
    id: 'plyta', operacja: 'dodaj',
    ksztalt: { typ: 'prostopadloscian', x_mm: w, y_mm: h, z_mm: g },
    pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
  }];
  const cechy = [];
  if (Array.isArray(otwory)) {
    otwory.forEach((o, i) => {
      cechy.push({
        typ: 'otwor', punkt_mm: [o.x, o.y, 0], os: 'z',
        srednica_mm: o.d || 4, przez: true
      });
    });
  }
  return {
    nazwa: 'Adapter ' + w + '×' + h + ' mm',
    material: 'PETG',
    bryly, cechy,
    uwagi_do_druku: 'Płyta adaptera z szablonu adapterPlyta. Drukuj płasko na płycie.'
  };
}

/**
 * Uchwyt / holder cylindryczny (tuleja z uszkiem montażowym).
 * @param {number} fi — średnica wewnętrzna [mm] (na co trzyma)
 * @param {number} h — wysokość tulei [mm]
 * @param {number} grub — ścianka [mm], domyślnie 3
 */
export function uchwyt(fi, h, grub) {
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
      pozycja_mm: [-(uszkoW / 2), fiZ / 2, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  const cechy = [{
    typ: 'otwor', punkt_mm: [0, fiZ / 2 + uszkoH / 2, h / 2],
    os: 'z', srednica_mm: 4, przez: true
  }];
  return {
    nazwa: 'Uchwyt tuleja Fi' + fi,
    material: 'PETG',
    bryly, cechy,
    uwagi_do_druku: 'Uchwyt cylindryczny z szablonu. Uszko na śrubę M4.'
  };
}

/**
 * Bracket / kątownik L.
 * @param {number} a — ramię A [mm]
 * @param {number} b — ramię B [mm]
 * @param {number} w — szerokość [mm]
 * @param {number} grub — grubość [mm], domyślnie 4
 */
export function katownik(a, b, w, grub) {
  const g = grub || 4;
  const bryly = [
    {
      id: 'ramie_a', operacja: 'dodaj',
      ksztalt: { typ: 'prostopadloscian', x_mm: w, y_mm: g, z_mm: a },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'ramie_b', operacja: 'dodaj',
      ksztalt: { typ: 'prostopadloscian', x_mm: w, y_mm: b, z_mm: g },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  const cechy = [
    { typ: 'otwor', punkt_mm: [w / 2, g / 2, a * 0.7], os: 'y', srednica_mm: 4, przez: true },
    { typ: 'otwor', punkt_mm: [w / 2, b * 0.7, g / 2], os: 'z', srednica_mm: 4, przez: true }
  ];
  return {
    nazwa: 'Kątownik ' + a + '×' + b + ' mm',
    material: 'PETG',
    bryly, cechy,
    uwagi_do_druku: 'Kątownik L z szablonu. Otwory M4 na każdym ramieniu.'
  };
}

/**
 * Pudełko / box z opcjonalną pokrywką.
 * @param {number} x — wewnętrzna szerokość [mm]
 * @param {number} y — wewnętrzna głębokość [mm]
 * @param {number} z — wewnętrzna wysokość [mm]
 * @param {number} grub — ścianka [mm], domyślnie 2
 */
export function pudelko(x, y, z, grub) {
  const g = grub || 2;
  const bryly = [
    {
      id: 'skorupa', operacja: 'dodaj',
      ksztalt: { typ: 'prostopadloscian', x_mm: x + 2 * g, y_mm: y + 2 * g, z_mm: z + g },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'wnetrze', operacja: 'odejmij',
      ksztalt: { typ: 'prostopadloscian', x_mm: x, y_mm: y, z_mm: z + 1 },
      pozycja_mm: [g, g, g], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  return {
    nazwa: 'Pudełko ' + x + '×' + y + '×' + z + ' mm',
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Pudełko otwarte z szablonu. Ścianka ' + g + ' mm.'
  };
}

/**
 * Złączka / connector — tuleja redukcyjna.
 * @param {number} fi1 — średnica strony A [mm]
 * @param {number} fi2 — średnica strony B [mm]
 * @param {number} dl — długość [mm], domyślnie max(fi1,fi2)*1.5
 * @param {number} grub — ścianka [mm], domyślnie 2
 */
export function zlaczka(fi1, fi2, dl, grub) {
  const g = grub || 2;
  const L = dl || Math.max(fi1, fi2) * 1.5;
  const bryly = [
    {
      id: 'zewn', operacja: 'dodaj',
      ksztalt: { typ: 'walec', wysokosc_mm: L, srednica_dolna_mm: fi1 + 2 * g, srednica_gorna_mm: fi2 + 2 * g },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'wewn', operacja: 'odejmij',
      ksztalt: { typ: 'walec', wysokosc_mm: L + 2, srednica_dolna_mm: fi1, srednica_gorna_mm: fi2 },
      pozycja_mm: [0, 0, -1], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }
  ];
  return {
    nazwa: 'Złączka redukcyjna Fi' + fi1 + '→Fi' + fi2,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Złączka redukcyjna z szablonu. Ścianka ' + g + ' mm.'
  };
}

/**
 * Trójnik T — rura + odgałęzienie prostopadłe.
 * @param {number} fi — średnica zewnętrzna [mm]
 * @param {number} grub — ścianka [mm], domyślnie 2
 * @param {number} dl — długość [mm], domyślnie 3×fi
 */
export function trojnik(fi, grub, dl) {
  const g = grub || 2;
  const L = dl || fi * 3;
  const fiW = fi - 2 * g;
  const odgal = fi * 1.5;
  const bryly = [
    {
      id: 'rura_glowna', operacja: 'dodaj',
      ksztalt: { typ: 'rura', wysokosc_mm: L, srednica_zewn_mm: fi, srednica_wewn_mm: fiW },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'odgalezienie', operacja: 'dodaj',
      ksztalt: { typ: 'rura', wysokosc_mm: odgal, srednica_zewn_mm: fi, srednica_wewn_mm: fiW },
      pozycja_mm: [0, 0, L / 2], obrot_deg: [90, 0, 0], srodkowanie: 'brak'
    },
    {
      id: 'lacznik', operacja: 'dodaj',
      ksztalt: { typ: 'kula', srednica_mm: fi },
      pozycja_mm: [0, 0, L / 2], obrot_deg: [0, 0, 0], srodkowanie: 'xyz'
    },
    {
      id: 'droz_lacznik', operacja: 'odejmij',
      ksztalt: { typ: 'kula', srednica_mm: fiW },
      pozycja_mm: [0, 0, L / 2], obrot_deg: [0, 0, 0], srodkowanie: 'xyz'
    }
  ];
  return {
    nazwa: 'Trójnik T Fi' + fi,
    material: 'PETG',
    bryly, cechy: [],
    uwagi_do_druku: 'Trójnik T z szablonu. Ścianka ' + g + ' mm. Podpory organiczne na łączeniu.'
  };
}

/**
 * Prosta rura / pipe.
 * @param {number} fi — średnica zewnętrzna [mm]
 * @param {number} dl — długość [mm]
 * @param {number} grub — ścianka [mm], domyślnie 2
 */
export function ruraProsta(fi, dl, grub) {
  const g = grub || 2;
  return {
    nazwa: 'Rura prosta Fi' + fi + ' L' + dl,
    material: 'PETG',
    bryly: [{
      id: 'rura', operacja: 'dodaj',
      ksztalt: { typ: 'rura', wysokosc_mm: dl, srednica_zewn_mm: fi, srednica_wewn_mm: fi - 2 * g },
      pozycja_mm: [0, 0, 0], obrot_deg: [0, 0, 0], srodkowanie: 'brak'
    }],
    cechy: [],
    uwagi_do_druku: 'Rura prosta z szablonu. Ścianka ' + g + ' mm.'
  };
}

// ─── Rejestr szablonów: tag katalogu → szablon ───

export const SZABLONY = [
  {
    id: 'rurKolanko',
    nazwa: 'Kolanko rurowe (elbow)',
    tagi: ['kolanko', 'elbow', 'rura', 'pipe', '90', '45'],
    parametry: 'fi, kat, grub, dl',
    fn: rurKolanko,
    przyklad: 'rurKolanko(80, 90, 2) → kolanko Fi80 90°',
    regex: /\b(kolanko|elbow|rur[ay].*kat|rur[ay].*stopn|pipe.*angle|pipe.*elbow|kolano)\b/i
  },
  {
    id: 'adapterPlyta',
    nazwa: 'Adapter / płyta montażowa',
    tagi: ['adapter', 'mount', 'plyta', 'mounting'],
    parametry: 'w, h, grub, otwory',
    fn: adapterPlyta,
    przyklad: 'adapterPlyta(60, 40, 4, [{x:15,y:15,d:4}])',
    regex: /\b(adapter|plyt[ay].*montaz|mount.*plate)\b/i
  },
  {
    id: 'uchwyt',
    nazwa: 'Uchwyt cylindryczny (holder)',
    tagi: ['holder', 'uchwyt', 'tuleja', 'bushing', 'sleeve', 'mount'],
    parametry: 'fi, h, grub',
    fn: uchwyt,
    przyklad: 'uchwyt(25, 30, 3) → tuleja na Ø25',
    regex: /\b(uchwyt|holder|tulej[ay]|bushing|sleeve|obejm[ay])\b/i
  },
  {
    id: 'katownik',
    nazwa: 'Kątownik L (bracket)',
    tagi: ['bracket', 'katownik', 'klamra', 'angle'],
    parametry: 'a, b, w, grub',
    fn: katownik,
    przyklad: 'katownik(40, 30, 20, 4)',
    regex: /\b(katownik|bracket|l-bracket|kat[oa]w)\b/i
  },
  {
    id: 'pudelko',
    nazwa: 'Pudełko (box)',
    tagi: ['box', 'pudelko', 'organizer', 'tray'],
    parametry: 'x, y, z, grub',
    fn: pudelko,
    przyklad: 'pudelko(80, 60, 40, 2)',
    regex: /\b(pude[lł]ko|box|organizer|pojemnik|szkatulk)\b/i
  },
  {
    id: 'zlaczka',
    nazwa: 'Złączka redukcyjna (reducer)',
    tagi: ['redukcja', 'zlaczka', 'reducer', 'connector', 'rura', 'pipe'],
    parametry: 'fi1, fi2, dl, grub',
    fn: zlaczka,
    przyklad: 'zlaczka(40, 32, 60, 2)',
    regex: /\b(zlaczk[ai]|redukc[jy]|reducer|connector|przejsci[eo]wk)\b/i
  },
  {
    id: 'trojnik',
    nazwa: 'Trójnik T (tee)',
    tagi: ['trojnik', 'tee', 'rura', 'pipe'],
    parametry: 'fi, grub, dl',
    fn: trojnik,
    przyklad: 'trojnik(40, 2, 120)',
    regex: /\b(trojnik|tee|t-piece|odgalezien)\b/i
  },
  {
    id: 'ruraProsta',
    nazwa: 'Rura prosta (pipe)',
    tagi: ['rura', 'pipe', 'tube'],
    parametry: 'fi, dl, grub',
    fn: ruraProsta,
    przyklad: 'ruraProsta(50, 100, 2)',
    regex: /\b(rur[ay]\s+prost|straight\s+pipe|tube\b)/i
  }
];

/**
 * Znajdź pasujące szablony na podstawie zapytania użytkownika + tagów RAG.
 * @param {string} query — tekst użytkownika
 * @param {string[]} ragTagi — tagi z trafień RAG
 * @returns {Array} pasujące szablony posortowane wg trafności
 */
export function dopasujSzablony(query, ragTagi) {
  const qLow = String(query || '').toLowerCase();
  const tagSet = new Set((ragTagi || []).map(t => t.toLowerCase()));
  const wyniki = [];

  for (const sz of SZABLONY) {
    let score = 0;
    // Regex match on query
    if (sz.regex && sz.regex.test(qLow)) score += 3;
    // Tag overlap
    for (const t of sz.tagi) {
      if (tagSet.has(t)) score += 1;
      if (qLow.includes(t)) score += 0.5;
    }
    if (score > 0) wyniki.push({ szablon: sz, score });
  }

  wyniki.sort((a, b) => b.score - a.score);
  return wyniki.map(w => w.szablon);
}

/**
 * Tekst kontekstu szablonu do wstrzyknięcia w prompt.
 * @param {Array} szablony — wynik dopasujSzablony()
 * @returns {string}
 */
export function tekstSzablonow(szablony) {
  if (!szablony || !szablony.length) return '';
  const lines = [
    '======== SZABLONY PARAMETRYCZNE (gotowe funkcje CSG) ========',
    'Masz do dyspozycji gotowe szablony. Gdy pasują do prośby użytkownika, UŻYJ ICH — podaj nazwę i parametry w [[RYSUJ]].',
    'Szablon generuje bryły SPEC automatycznie. Ty podajesz parametry z prośby użytkownika.'
  ];
  for (const sz of szablony.slice(0, 3)) {
    lines.push('SZABLON: ' + sz.id + '(' + sz.parametry + ') — ' + sz.nazwa);
    lines.push('  Przykład: ' + sz.przyklad);
    lines.push('  Pasuje do tagów: ' + sz.tagi.join(', '));
  }
  lines.push('Użyj znacznika: [[SZABLON:id(parametry)]] np. [[SZABLON:rurKolanko(80,90,2)]]');
  lines.push('================================================================');
  return lines.join('\n');
}
