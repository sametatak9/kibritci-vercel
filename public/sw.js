// Simple Service Worker for PWA Installation Requirements
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Üyeliksiz sipariş sayfasını ERP önbelleği / PWA yakalamasın
  if (url.pathname === '/siparis' || url.pathname === '/siparis.html') {
    return;
  }
  // Pass-through everything to network to preserve Firebase realtime
  e.respondWith(fetch(e.request));
});
