const CACHE_NAME = 'tablet-inventory-v1.0.0';
const RUNTIME_CACHE = 'runtime-cache-v1';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/db.js',
  '/js/supabase-client.js',
  '/js/auth.js',
  '/js/ocr.js',
  '/js/camera.js',
  '/js/sync.js',
  '/js/export.js',
  '/manifest.json',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Supabase API calls (handle them separately)
  if (url.origin.includes('supabase')) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          // Return offline response for API calls
          return new Response(
            JSON.stringify({ error: 'offline', message: 'No network connection' }),
            { 
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }

  // Skip external CDN resources (always try network first)
  if (!url.origin.includes(self.location.origin)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache CDN resources for offline use
          const clonedResponse = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, clonedResponse);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // For app assets: Cache first, network fallback
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version and update in background
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, networkResponse);
                });
              }
            })
            .catch(() => {});
          
          return cachedResponse;
        }

        // Not in cache, try network
        return fetch(request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200) {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(RUNTIME_CACHE)
              .then((cache) => {
                cache.put(request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // Network failed, return offline page
            if (request.destination === 'document') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// Handle background sync
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-tablets') {
    event.waitUntil(syncData());
  }
});

// Sync function
async function syncData() {
  try {
    // Send message to all clients to start sync
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'BACKGROUND_SYNC',
        action: 'start'
      });
    });
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// Handle push notifications (optional for future use)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'Nueva actualización disponible',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Inventario Tablets', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app is already open, focus it
        for (let client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open new window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

// Handle messages from app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(RUNTIME_CACHE)
        .then((cache) => cache.addAll(event.data.urls))
    );
  }
});

