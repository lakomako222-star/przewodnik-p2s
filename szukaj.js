/**
 * Szukanie sieciowe bez klucza API. Wikipedia (CORS) + DuckDuckGo Instant Answer.
 * Hosty poza listą są odrzucane. Porażka nie jest błędem — agent ma dopytać.
 */
export const SZUKAJ_HOSTS = [
  'wikipedia.org',
  'wikimedia.org',
  'api.duckduckgo.com',
  'duckduckgo.com',
  'wiki.bambulab.com',
  'bambulab.com',
  'github.com',
  'makerworld.com',
  'printables.com',
  'thingiverse.com',
  'reddit.com'
];

export function hostDozwolony(href) {
  let h = '';
  try { h = new URL(href).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return false; }
  if (!h) return false;
  return SZUKAJ_HOSTS.some(function (a) { return h === a || h.endsWith('.' + a); });
}

export function wyciagnijSzukaj(talk) {
  const m = String(talk || '').match(/\[\[\s*SZUKAJ\s*\]\]\s*([^\n\[]{1,160})/i);
  return m ? m[1].trim() : '';
}

function clip(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : s.slice(0, n) + '…';
}

async function getJson(fetchFn, url, ms) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 8000) : null;
  try {
    const r = await fetchFn(url, ctrl ? { signal: ctrl.signal } : {});
    if (!r || !r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  } finally {
    if (t) clearTimeout(t);
  }
}

export async function szukajSieci(query, fetchFn, timeoutMs) {
  const f = fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  const q = String(query || '').trim().slice(0, 160);
  if (!q) return { ok: false, powod: 'puste', tekst: '' };
  if (!f) return { ok: false, powod: 'brak fetch', tekst: '' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, powod: 'offline', tekst: '' };
  }

  const asUrl = /^https?:\/\//i.test(q) ? q : '';
  if (asUrl && !hostDozwolony(asUrl)) {
    return { ok: false, powod: 'host poza listą', tekst: '' };
  }

  const linie = [];
  const search = asUrl && /wikipedia\.org/i.test(asUrl)
    ? decodeURIComponent((asUrl.split('/').pop() || '').replace(/_/g, ' '))
    : q;

  const wiki = await getJson(
    f,
    'https://en.wikipedia.org/w/api.php?origin=*&action=opensearch&limit=3&namespace=0&format=json&search='
      + encodeURIComponent(search),
    timeoutMs
  );
  if (Array.isArray(wiki)) {
    const titles = wiki[1] || [];
    const descs = wiki[2] || [];
    const urls = wiki[3] || [];
    for (let i = 0; i < titles.length; i++) {
      if (urls[i] && !hostDozwolony(urls[i])) continue;
      linie.push('- Wikipedia: ' + titles[i]
        + (descs[i] ? ' — ' + clip(descs[i], 280) : '')
        + (urls[i] ? ' ' + urls[i] : ''));
    }
  }

  const ddg = await getJson(
    f,
    'https://api.duckduckgo.com/?q=' + encodeURIComponent(search) + '&format=json&no_html=1&skip_disambig=1',
    timeoutMs
  );
  if (ddg && typeof ddg === 'object') {
    if (ddg.AbstractText) {
      const u = ddg.AbstractURL && hostDozwolony(ddg.AbstractURL) ? ' ' + ddg.AbstractURL : '';
      linie.push('- DuckDuckGo: ' + clip(ddg.AbstractText, 400) + u);
    }
    const rel = Array.isArray(ddg.RelatedTopics) ? ddg.RelatedTopics : [];
    for (let i = 0; i < rel.length && i < 3; i++) {
      const t = rel[i] || {};
      const nested = t.Topics && t.Topics[0];
      const txt = t.Text || (nested && nested.Text);
      const u = t.FirstURL || (nested && nested.FirstURL);
      if (txt) linie.push('- ' + clip(txt, 220) + (u && hostDozwolony(u) ? ' ' + u : ''));
    }
  }

  if (!linie.length) return { ok: false, powod: 'brak wyników', tekst: '' };
  return { ok: true, powod: '', tekst: linie.join('\n') };
}

export function tekstWynikowSzukania(pack) {
  if (pack && pack.ok && pack.tekst) {
    return 'WYNIKI SZUKANIA (Wikipedia/DuckDuckGo, niepełne, nie katalog sklepu):\n' + pack.tekst
      + '\n\nNie zgaduj mm z tego. Jeśli nie ma gerbera/PCB — powiedz to wprost (prototyp, NIE drop-in) albo [[CZEKAM]]. Dopytaj człowieka. Jeden znacznik na końcu — nie [[RYSUJ]] dopóki nie ma sposobu i mm.';
  }
  const powod = (pack && pack.powod) || 'sieć';
  return 'SZUKANIE NIEUDANE (' + powod + '). Kontynuuj pytaniami. Przy obciążeniu, dzieciach, wyjściu ewakuacyjnym lub ogniu napisz wprost: „nie sprawdziłem w sieci, dopytuję Ciebie”. Nie stawiaj [[RYSUJ]].';
}
