const CACHE = 'cmanager-offline-v4';
const ASSETS = ['./', './index.html', './style.css?v=20261017-4', './app.js?v=20261017-4', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('cmanager-offline-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const response = await fetch(e.request, {cache:'no-store'});
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(e.request, response.clone());
      }
      return response;
    } catch (_) {
      return (await caches.match(e.request)) || Response.error();
    }
  })());
});
