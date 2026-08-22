// Service worker - HTML najpierw z sieci (online-first).
// CACHE wypełnia build_pwa.py z SHA-256 index.html. Nie wpisuj ręcznie.
// Doradca, diagnostyka i checklisty są w index.html i w cache — działają bez sieci.
const CACHE = 'p2s-guide-v4.0.17-37cfa9a9';
const FILES = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-512-maskable.png',
  './apple-touch-icon.png', './favicon-32.png', './fflate.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
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
