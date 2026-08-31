/* modele_guard.js — strażnik wyników szukania modeli 3D.
 *
 * Przeniesione z VaderAI Studio: src/vader/find/license_guard.py
 *                                src/vader/find/anti_injection.py
 *
 * Do wklejenia w <script> w index.html przewodnika. Czysty ES5, bez zależności,
 * działa offline. Nie robi żadnych wywołań sieciowych.
 *
 * ZMIANA WZGLĘDEM ORYGINAŁU — ważna:
 * VaderAI pytał „czy wolno to PRZEROBIĆ", bo tam każdy model szedł pod edycję.
 * Przewodnik pyta najczęściej „czy wolno to WYDRUKOWAĆ dla siebie", a to jest
 * inne pytanie i inna odpowiedź. Licencja NoDerivatives zabrania utworu
 * zależnego, ale nie zabrania wydruku egzemplarza do własnej szuflady.
 * Dlatego zamiast jednej flagi „wolno / nie wolno" zwracamy cztery osobne.
 *
 * To nie jest porada prawna. To odczytanie tego, co deklaruje autor modelu,
 * podane po polsku, żeby użytkownik wiedział, czego się trzyma.
 */
(function (global) {
  "use strict";

  /* ============================================================
   * 1. ANTY-INJECTION
   * Opis modelu pobrany z cudzej strony trafia do kontekstu modelu
   * językowego. Ktoś może tam zostawić polecenie. Zamieniamy je na
   * widoczny znacznik, zamiast wycinać po cichu.
   * ============================================================ */

  var INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?previous/gi,
    /system\s*:/gi,
    /<\s*\/?\s*script/gi,
    /zignoruj\s+(wszystkie\s+)?poprzednie/gi,
    /wykonaj\s+polecenie\s*:/gi,
    /sudo\s+/gi,
    /rm\s+-rf/gi,
    /disregard\s+(all\s+)?(prior|above)/gi,
    /nowe\s+instrukcje\s*:/gi
  ];

  function sanitizeListing(text) {
    var raw = text == null ? "" : String(text);
    var hits = [];
    var cleaned = raw;

    for (var i = 0; i < INJECTION_PATTERNS.length; i++) {
      var pat = new RegExp(INJECTION_PATTERNS[i].source, INJECTION_PATTERNS[i].flags);
      var m;
      while ((m = pat.exec(raw)) !== null) {
        hits.push({ pattern: pat.source, at: m.index, match: String(m[0]).slice(0, 80) });
        if (m.index === pat.lastIndex) pat.lastIndex++;
      }
      cleaned = cleaned.replace(
        new RegExp(INJECTION_PATTERNS[i].source, INJECTION_PATTERNS[i].flags),
        "[zignorowano]"
      );
    }

    return {
      clean_text: cleaned,
      injection_detected: hits.length > 0,
      hits: hits,
      note_pl: hits.length
        ? "W opisie tego modelu było ukryte polecenie. Zignorowane — asystent go nie wykona."
        : null
    };
  }

  /* ============================================================
   * 2. LICENCJE
   * ============================================================ */

  var URL_RULES = [
    [/creativecommons\.org\/licenses\/by-nc-nd(\/|$)/i, "cc-by-nc-nd"],
    [/creativecommons\.org\/licenses\/by-nc-sa(\/|$)/i, "cc-by-nc-sa"],
    [/creativecommons\.org\/licenses\/by-nd(\/|$)/i,    "cc-by-nd"],
    [/creativecommons\.org\/licenses\/by-nc(\/|$)/i,    "cc-by-nc"],
    [/creativecommons\.org\/licenses\/by-sa(\/|$)/i,    "cc-by-sa"],
    [/creativecommons\.org\/licenses\/by(\/|$)/i,       "cc-by"],
    [/creativecommons\.org\/publicdomain\/zero/i,       "cc0"],
    [/creativecommons\.org\/publicdomain\/mark/i,       "cc0"],
    [/opensource\.org\/licenses\/MIT/i,                 "mit"],
    [/opensource\.org\/licenses\/Apache-2\.0/i,         "apache-2.0"],
    [/gnu\.org\/licenses\/gpl-3/i,                      "gpl-3.0"],
    [/gnu\.org\/licenses\/lgpl-3/i,                     "lgpl-3.0"]
  ];

  var TEXT_RULES = [
    [/\bcc0\b|public\s*domain|domena\s*publiczna/i,           "cc0"],
    [/by[\s-]*nc[\s-]*nd|attribution.*noncommercial.*noderiv/i, "cc-by-nc-nd"],
    [/by[\s-]*nc[\s-]*sa/i,                                    "cc-by-nc-sa"],
    [/by[\s-]*nd|noderiv/i,                                    "cc-by-nd"],
    [/by[\s-]*nc|noncommercial|niekomercyjn/i,                 "cc-by-nc"],
    [/by[\s-]*sa|sharealike/i,                                 "cc-by-sa"],
    [/\bcc[\s-]*by\b|attribution/i,                            "cc-by"],
    [/\bmit\b/i,                                               "mit"],
    [/apache[\s-]*2/i,                                         "apache-2.0"],
    [/\blgpl[\s-]*3/i,                                         "lgpl-3.0"],
    [/\bgpl[\s-]*3/i,                                          "gpl-3.0"],
    [/\bbsd\b/i,                                               "bsd"],
    [/all\s*rights\s*reserved|wszelkie\s*prawa/i,              "all-rights-reserved"],
    [/standard\s*digital\s*file\s*license/i,                   "all-rights-reserved"]
  ];

  function normalizeLicense(raw) {
    if (raw == null) return "unknown";
    var s = String(raw).trim();
    if (!s) return "unknown";
    var i;
    for (i = 0; i < URL_RULES.length; i++) if (URL_RULES[i][0].test(s)) return URL_RULES[i][1];
    for (i = 0; i < TEXT_RULES.length; i++) if (TEXT_RULES[i][0].test(s)) return TEXT_RULES[i][1];
    return "unknown";
  }

  /* Cztery osobne pytania zamiast jednego.
   *   pobrac        — czy wolno ściągnąć plik
   *   drukowac      — czy wolno wydrukować dla siebie
   *   przerobic     — czy wolno zmienić geometrię
   *   udostepnic    — czy wolno opublikować przeróbkę
   *   sprzedac      — czy wolno sprzedać wydruk
   */
  var TABLE = {
    "cc0":         { pobrac:1, drukowac:1, przerobic:1, udostepnic:1, sprzedac:1,
                     label:"CC0 — domena publiczna",
                     pl:"Bez ograniczeń. Autor zrzekł się praw." },
    "cc-by":       { pobrac:1, drukowac:1, przerobic:1, udostepnic:1, sprzedac:1,
                     label:"CC BY — uznanie autorstwa",
                     pl:"Wolno wszystko, ale musisz podać autora." },
    "cc-by-sa":    { pobrac:1, drukowac:1, przerobic:1, udostepnic:1, sprzedac:1,
                     label:"CC BY-SA — na tych samych warunkach",
                     pl:"Wolno wszystko z podaniem autora. Przeróbkę musisz udostępnić na tej samej licencji." },
    "mit":         { pobrac:1, drukowac:1, przerobic:1, udostepnic:1, sprzedac:1,
                     label:"MIT", pl:"Wolno wszystko z zachowaniem noty licencyjnej." },
    "bsd":         { pobrac:1, drukowac:1, przerobic:1, udostepnic:1, sprzedac:1,
                     label:"BSD", pl:"Wolno wszystko z zachowaniem noty licencyjnej." },
    "apache-2.0":  { pobrac:1, drukowac:1, przerobic:1, udostepnic:1, sprzedac:1,
                     label:"Apache 2.0", pl:"Wolno wszystko z zachowaniem noty i informacji o zmianach." },
    "gpl-3.0":     { pobrac:1, drukowac:1, przerobic:1, udostepnic:1, sprzedac:1,
                     label:"GPL 3.0", pl:"Wolno wszystko. Przeróbkę musisz udostępnić na GPL." },
    "lgpl-3.0":    { pobrac:1, drukowac:1, przerobic:1, udostepnic:1, sprzedac:1,
                     label:"LGPL 3.0", pl:"Wolno wszystko. Przeróbkę musisz udostępnić na LGPL." },

    "cc-by-nc":    { pobrac:1, drukowac:1, przerobic:1, udostepnic:1, sprzedac:0,
                     label:"CC BY-NC — tylko niekomercyjnie",
                     pl:"Do własnego użytku tak, z podaniem autora. Sprzedaż wydruków — nie." },
    "cc-by-nc-sa": { pobrac:1, drukowac:1, przerobic:1, udostepnic:1, sprzedac:0,
                     label:"CC BY-NC-SA — niekomercyjnie, tak samo",
                     pl:"Do własnego użytku tak. Sprzedaż — nie. Przeróbkę udostępniasz na tej samej licencji." },

    "cc-by-nd":    { pobrac:1, drukowac:1, przerobic:0, udostepnic:0, sprzedac:1,
                     label:"CC BY-ND — bez utworów zależnych",
                     pl:"Wydrukować dla siebie wolno. Zmieniać geometrii — nie." },
    "cc-by-nc-nd": { pobrac:1, drukowac:1, przerobic:0, udostepnic:0, sprzedac:0,
                     label:"CC BY-NC-ND — najostrzejsza z CC",
                     pl:"Wydrukować dla siebie wolno. Zmieniać ani sprzedawać — nie." },

    "all-rights-reserved": { pobrac:1, drukowac:1, przerobic:0, udostepnic:0, sprzedac:0,
                     label:"Wszelkie prawa zastrzeżone",
                     pl:"Warunki ustala autor na stronie modelu. Zakładaj: wydruk dla siebie tak, reszta nie." },

    "unknown":     { pobrac:0, drukowac:0, przerobic:0, udostepnic:0, sprzedac:0,
                     label:"Licencja niepotwierdzona",
                     pl:"Nie znalazłem licencji na stronie modelu. Sprawdź ją sam, zanim pobierzesz." }
  };

  function licenseInfo(raw) {
    var id = normalizeLicense(raw);
    var t = TABLE[id] || TABLE["unknown"];
    return {
      id: id,
      label_pl: t.label,
      restrictions_pl: t.pl,
      pobrac: !!t.pobrac,
      drukowac: !!t.drukowac,
      przerobic: !!t.przerobic,
      udostepnic: !!t.udostepnic,
      sprzedac: !!t.sprzedac,
      potwierdzona: id !== "unknown",
      raw: raw == null ? null : String(raw)
    };
  }

  /* ============================================================
   * 3. PEŁNY PRZEBIEG NA JEDNYM WYNIKU
   * ============================================================ */

  function guardModel(m) {
    m = m || {};
    var desc = sanitizeListing(m.opis || m.description || "");
    var lic = licenseInfo(m.licencja || m.license || null);

    var ostrzezenia = [];
    if (!lic.potwierdzona) {
      ostrzezenia.push("Licencja niepotwierdzona — sprawdź na stronie modelu przed pobraniem.");
    }
    if (desc.injection_detected) {
      ostrzezenia.push(desc.note_pl);
    }
    if (!m.autor && !m.author) {
      ostrzezenia.push("Brak autora w wynikach — przy licencjach CC podanie autora jest obowiązkiem.");
    }

    return {
      tytul: m.tytul || m.title || "bez tytułu",
      autor: m.autor || m.author || null,
      url: m.url || null,
      miniatura: m.miniatura || m.thumbnail || null,
      zrodlo: m.zrodlo || m.source || null,
      opis_bezpieczny: desc.clean_text,
      licencja: lic,
      ostrzezenia: ostrzezenia,
      /* Zasada z VaderAI: nie zgadujemy. Czego nie ma, tego nie wpisujemy. */
      pokazac: lic.pobrac || !lic.potwierdzona
    };
  }

  function guardAll(list) {
    if (!list || !list.length) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(guardModel(list[i]));
    return out;
  }

  global.ModeleGuard = {
    sanitizeListing: sanitizeListing,
    normalizeLicense: normalizeLicense,
    licenseInfo: licenseInfo,
    guardModel: guardModel,
    guardAll: guardAll,
    TABLE: TABLE
  };
})(typeof window !== "undefined" ? window : this);
