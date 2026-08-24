const CACHE_NAME = 'biterstore-ui-v11';
const UI_ASSETS = [
  '/assets/paper-bg.webp',
  '/assets/avatar-jian.webp', '/assets/avatar-lin.webp', '/assets/avatar-zhou.webp',
  '/assets/tobby-cheer.webp', '/assets/tobby-guide-publish.webp', '/assets/tobby-guide-search.webp',
  '/assets/tobby-guide-trade.webp', '/assets/tobby-heart.webp', '/assets/tobby-hello.webp',
  '/assets/tobby-maintenance.webp', '/assets/tobby-master-transparent.webp', '/assets/tobby-news.webp',
  '/assets/tobby-question.webp', '/assets/tobby-sad.webp', '/assets/tobby-search.webp',
  '/assets/tobby-unavailable.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(UI_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('biterstore-ui-') && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/assets/')) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
