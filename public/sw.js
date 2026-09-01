// v2026-09-01-phone-cache-bust — eski PWA sekmelerinin yeni paketi alması için
const SW_VERSION = '2026-09-01-c';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      if (self.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== SW_VERSION).map((k) => caches.delete(k)));
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname === '/siparis' || url.pathname === '/siparis.html') {
    return;
  }
  e.respondWith(fetch(e.request, { cache: 'no-store' }));
});
