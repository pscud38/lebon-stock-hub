/**
 * Lebon Toy Stock Management System - Service Worker v4.0.8 (Hardened Production Release)
 * Architecture: Strict Separation of Static App Shell and Dynamic REST APIs
 * Features & Remediations:
 *   - Network-First for Application Scripts (.js, .css) to prevent stale code lock
 *   - Immediate cache eviction for all outdated versions
 *   - Storage quota immunity and graceful fallback
 *   - Comprehensive Supabase & Auth API bypass (Network-Only)
 */

const CACHE_NAME = 'lebon-stock-v4.0.8';

const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './auth.js',
  './api.js',
  './store.js',
  './optimistic.js',
  './scanner.js',
  './reports.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/html5-qrcode',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// 1. Install Event: Pre-cache Static App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some static assets failed to pre-cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: Evict Old Caches Immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('[SW] Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Message Event: Support immediate skipWaiting requests
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.action === 'skipWaiting')) {
    self.skipWaiting();
  }
});

// 4. Fetch Event: Strict Routing Rules
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // RULE A: Dynamic Data & Database APIs -> NEVER CACHE (Pass through directly to network)
  const isDynamicApi =
    url.includes('supabase.co') ||
    url.includes('/rest/v1/') ||
    url.includes('/auth/v1/') ||
    url.includes('/storage/v1/') ||
    url.includes('/realtime/v1/') ||
    url.includes('script.google.com') ||
    event.request.headers.has('apikey') ||
    event.request.headers.has('Authorization');

  if (isDynamicApi) {
    return; // Pass through to browser network layer
  }

  // RULE B: HTML Navigation -> Network-First with cache: 'no-cache' and Async Offline Fallback
  if (event.request.mode === 'navigate' || url.endsWith('index.html') || url.endsWith('/')) {
    event.respondWith(
      fetch(new Request(event.request, { cache: 'no-cache' }))
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request, { ignoreSearch: true });
          return cached || (await caches.match('./index.html')) || (await caches.match('./'));
        })
    );
    return;
  }

  // RULE C: Application Scripts & Styles -> Network-First (Never stale while online, offline fallback)
  const isAppAsset = (url.endsWith('.js') || url.endsWith('.css') || url.includes('.js?') || url.includes('.css?')) &&
                     !url.includes('cdn.') && !url.includes('unpkg.com');
  if (isAppAsset) {
    event.respondWith(
      fetch(new Request(event.request, { cache: 'no-cache' }))
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || (await caches.match(event.request, { ignoreSearch: true }));
        })
    );
    return;
  }

  // RULE D: Third-Party Libraries & Static Images -> Stale-While-Revalidate with { ignoreSearch: true }
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
