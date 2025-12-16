// sw.js - Service Worker (Cache Buster)
const CACHE_NAME = 'tablet-inventory-v3.1'; // ¡Versión actualizada!
const RUNTIME_CACHE = 'runtime-cache-v3.1';

// Detectar base path dinámicamente
const BASE_PATH = self.serviceWorker.scriptURL.replace(/\/sw\.js$/, '/');

// Lista de archivos a cachear
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/supabase-client.js',
  './js/auth.js',
  './js/ocr.js',
  './js/camera.js',
  './js/sync.js',
  './js/export.js',
  './manifest.json'
].map(path => new URL(path, BASE_PATH).href);

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Forzar activación inmediata
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando nueva versión:', CACHE_NAME);
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.map((name) => {
          if (name !== CACHE_NAME && name !== RUNTIME_CACHE) {
            console.log('[SW] Borrando caché antigua:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Ahora controlando clientes');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // Supabase / API: Network Only (para evitar datos viejos)
  if (url.origin.includes('supabase')) {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({ offline: true }))));
    return;
  }

  // App Assets: Stale-While-Revalidate (Usa caché pero busca nuevo en fondo)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => cachedResponse); // Si falla red, devuelve caché

      return cachedResponse || fetchPromise;
    })
  );
});
