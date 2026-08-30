/**
 * Router intencji — czysta funkcja.
 * Zero DOM, zero localStorage, zero show().
 * 0 albo ≥2 dopasowania → odmowa (nie nawiguj).
 */

export const ZAKLADKI = {
  guide: { id: 'guide', etykieta: 'Przewodnik' },
  advisor: { id: 'advisor', etykieta: 'Doradca' },
  tools: { id: 'tools', etykieta: 'Narzędzia' },
  projekt: { id: 'projekt', etykieta: 'Projekt' },
  przerobka: { id: 'przerobka', etykieta: 'Przerób' },
  ai: { id: 'ai', etykieta: 'Asystent' },
  sync: { id: 'sync', etykieta: 'Aktualizuj' }
};

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[øØ]/g, 'o')
    .replace(/,/g, '.')
    .trim();
}

function dodaj(hits, id, powod) {
  if (!ZAKLADKI[id]) return;
  if (hits.some((h) => h.zakladka === id)) return;
  hits.push({ zakladka: id, etykieta: ZAKLADKI[id].etykieta, powod });
}

export function dopasowania(zdanie) {
  const t = norm(zdanie);
  const hits = [];
  if (!t) return hits;

  if (/(powieksz|poszerz|zwez|zmien)\s+(otwor|gniazd)|przerob|reform/.test(t))
    dodaj(hits, 'przerobka', 'zmiana istniejącego otworu');

  if (/\bzrob\b|\bnarysuj\b|\bzaprojektuj\b|\bnowy model\b/.test(t))
    dodaj(hits, 'projekt', 'nowa rzecz od opisu');

  if (/\bzrob\b/.test(t) && /(otwor|gniazd|\bo\s*\d)/.test(t))
    dodaj(hits, 'przerobka', 'otwór w opisie nowej rzeczy');

  if (/\bnitk|\bpajeczyn|stringing|warstwy pekaj|nie trzyma sie plyt|niedotlok/.test(t))
    dodaj(hits, 'advisor', 'objaw druku');

  if (/\bhms\b|kod bledu|rozdzial 16/.test(t))
    dodaj(hits, 'guide', 'kod HMS / wiedza');

  if (/\bkalkulator\b|\bile wazy\b|\bluz\b.*pasow/.test(t))
    dodaj(hits, 'tools', 'narzędzie');

  if (/\basystent\b|\bdopytaj ai\b|\bdopytaj\b/.test(t) && !/\bprzewodnik\b/.test(t))
    dodaj(hits, 'ai', 'rozmowa');

  if (/\baktualizuj\b|\bnowa wersja aplikacji\b/.test(t))
    dodaj(hits, 'sync', 'aktualizacja');

  return hits;
}

export function rozpoznaIntent(zdanie) {
  const d = dopasowania(zdanie);
  if (d.length === 1) {
    return { zakladka: d[0].zakladka, etykieta: d[0].etykieta };
  }
  return {
    odmowa: d.length === 0 ? 'NIC' : 'WIELE',
    dopasowania: d,
    zrozumiane: String(zdanie || '').trim()
  };
}

if (typeof window !== 'undefined') {
  window.P2S_intent = { rozpoznaIntent, dopasowania, ZAKLADKI };
}
