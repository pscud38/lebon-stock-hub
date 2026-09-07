/**
 * Lebon Toy Stock Management System - Service Worker v4.0.0 (Hardened Production Release)
 * Architecture: Strict Separation of Static App Shell and Dynamic REST APIs
 * Remediations:
 *   - Async/Await Promise evaluation in navigation fallback (Fixes offline blank screen)
 *   - ignoreSearch: true option in caches.match (Fixes PWA offline query string miss)
 *   - { cache: 'no-cache' } on HTML fetch (Defeats GitHub Pages max-age=600 stale cache)
 *   - Comprehensive Supabase & Auth API bypass (Network-Only)
 */

const CACHE_NAME = 'lebon-stock-v4.0.0';

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
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch Event: Strict Routing Rules
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

  // RULE C: Static Assets -> Stale-While-Revalidate with { ignoreSearch: true }
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
