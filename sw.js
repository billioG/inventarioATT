// sw.js - Service Worker Robusto y Dinámico
const CACHE_NAME = 'tablet-inventory-v2.0'; // Incrementamos versión
const RUNTIME_CACHE = 'runtime-cache-v2';

// Detectar base path dinámicamente para soportar carpetas anidadas
const BASE_PATH = self.serviceWorker.scriptURL.replace(/\/sw\.js$/, '/');

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
      console.log('[SW] Cacheando assets en:', BASE_PATH);
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
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Estrategia: Network First para API/Supabase, Cache First para assets
  const url = new URL(event.request.url);

  // 1. Ignorar peticiones que no sean GET o sean de extensiones de navegador
  if (event.request.method !== 'GET' || url.protocol.startsWith('chrome-extension')) return;

  // 2. Supabase / API: Intentar red, fallback a offline msg
  if (url.origin.includes('supabase')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: true, offline: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 3. Assets de la App: Cache First (Más rápido)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((response) => {
        // Cachear dinámicamente nuevos recursos válidos
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(() => {
        // Fallback a index.html si navegan offline
        if (event.request.mode === 'navigate') {
          return caches.match(new URL('./index.html', BASE_PATH).href);
        }
      });
    })
  );
});
