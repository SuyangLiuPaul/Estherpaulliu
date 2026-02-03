/**
 * Two As One - Wedding App Service Worker
 * Provides offline functionality for wedding guests
 */

const CACHE_NAME = 'two-as-one-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/program.pdf'
];

// Data cache for guest list (separate from static assets)
const DATA_CACHE_NAME = 'two-as-one-data-v1';

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Install complete');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Install failed:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== DATA_CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Google Apps Script API calls (don't cache dynamic data)
  if (url.hostname.includes('script.google.com')) {
    // Network only for API calls - let the app handle caching via localStorage
    return;
  }

  // Strategy: Cache First for static assets, Network First for data
  if (isStaticAsset(url)) {
    // Cache First strategy for static assets
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            // Return cached version and update in background
            fetch(request)
              .then((networkResponse) => {
                if (networkResponse.ok) {
                  caches.open(CACHE_NAME)
                    .then((cache) => cache.put(request, networkResponse));
                }
              })
              .catch(() => {}); // Ignore network errors for background update
            return cachedResponse;
          }
          // Not in cache, fetch from network
          return fetch(request)
            .then((networkResponse) => {
              if (networkResponse.ok) {
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => cache.put(request, clone));
              }
              return networkResponse;
            })
            .catch(() => {
              // Network failed, no cache - return offline fallback
              if (request.mode === 'navigate') {
                return caches.match('/index.html');
              }
              return new Response('Offline', { status: 503 });
            });
        })
    );
  } else {
    // Network First strategy for other requests
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(DATA_CACHE_NAME)
              .then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // No cache available
              return new Response('Offline', { status: 503 });
            });
        })
    );
  }
});

// Helper function to check if URL is a static asset
function isStaticAsset(url) {
  const staticExtensions = [
    '.html', '.css', '.js', '.json', '.pdf',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
    '.woff', '.woff2', '.ttf', '.eot'
  ];
  return staticExtensions.some((ext) => url.pathname.endsWith(ext)) ||
         url.pathname === '/';
}

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
