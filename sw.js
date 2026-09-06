// Service worker - HTML najpierw z sieci (online-first).
// CACHE wypełnia build_pwa.py z SHA-256 index.html. Nie wpisuj ręcznie.
// Doradca, diagnostyka i checklisty są w index.html i w cache — działają bez sieci.
const CACHE = 'p2s-guide-v4.2.72-2e1b0ed8';

// addAll jest atomowe: jeden 404 odrzuca całą instalację SW i offline pada po cichu.
// Krytyczne (przewodnik + silnik) muszą być kompletne. Reszta: allSettled.
const CRITICAL = ['./', './index.html',
  './engine/manifold.js', './engine/manifold.wasm', './engine/LICENSE-manifold.txt'];
const OPTIONAL = ['./manifest.webmanifest', './icon-192.png',
  './icon-512.png', './icon-512-maskable.png', './apple-touch-icon.png', './favicon-32.png', './fflate.min.js', './builder.js', './gate.js', './export3mf.js', './preview.js', './projekt-ui.js', './spec-v1.schema.json', './przerobka-web.js', './przerobka-ui.js', './intent.js', './modele_guard.js', './modele-rura.js', './szukaj.js', './nauka-rag.js', './nauka-szablony.js', './nauka-pack.json', './szablony-obrotowe.js', './szablony-home.js', './szablony-12b.js', './szablony-12c.js', './szablony-12d.js', './szablony-12e.js', './rozmiar-slowny.js', './wymiary-zdanie.js', './archetypy.js', './archetypy-rejestr.json', './instancje.js', './klasyfikator.js', './progi-klasyfikatora.json', './nauka-ocena.js', './nitka.js', './spec-validate.js', './font-skrypt.js', './studio.css', './studio.js', './t0-checklista.js', './szpule-kalibrowane.js', './hms-dekoder.js', './analizator-3mf.js', './analizator-profile.js', './analizator-profile.json', './wyszukiwanie.js', './wektory-przewodnik.json', './ocena-zdjecia.js', './ocena-zdjecia.json', './drukarka-status.js', './wizja-projekt.js', './brep-cechy.js', './modele/LICENSE-ocena-zdjecia.txt', './wersja.json', './pliki.json', './sw.js', './vendor/ort/LICENSE-onnxruntime-web.txt'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CRITICAL);
    await Promise.allSettled(OPTIONAL.map(u => c.add(u))).then(function (wyniki) {
      var odpadly = [];
      for (var i = 0; i < wyniki.length; i++) {
        if (wyniki[i].status === 'rejected') {
          var powod = (wyniki[i].reason && (wyniki[i].reason.message || String(wyniki[i].reason))) || 'rejected';
          odpadly.push(OPTIONAL[i] + ' — ' + powod);
        }
      }
      if (!odpadly.length) return;
      console.warn('[P2S SW] OPTIONAL niekompletny:', odpadly);
      try {
        c.put('./sw-optional-odpadly.json', new Response(JSON.stringify({
          when: Date.now(), odpadly: odpadly
        }), { headers: { 'Content-Type': 'application/json' } }));
      } catch (e1) {}
      return self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(function (klienci) {
        for (var k = 0; k < klienci.length; k++) {
          klienci[k].postMessage({ typ: 'sw-optional-odpadly', odpadly: odpadly });
        }
      });
    });
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  let url;
  try { url = new URL(e.request.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isHtml = e.request.mode === 'navigate' ||
    path.endsWith('/') ||
    path.endsWith('/index.html') ||
    path.endsWith('index.html');

  // HTML: najpierw siec, zeby zainstalowana PWA nie zostala na starej wersji.
  if (isHtml) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => {
          c.put(e.request, copy);
          c.put('./index.html', copy.clone()).catch(() => {});
        }).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request)
        .then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // Ikony / manifest: cache, potem siec.
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
