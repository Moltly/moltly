/* Moltly Service Worker: offline shell + runtime caching */

const SW_VERSION = 'v2';
const PREFIX = 'moltly';
const SHELL_CACHE = `${PREFIX}-shell-${SW_VERSION}`;
const RUNTIME_CACHE = `${PREFIX}-rt-${SW_VERSION}`;

// Minimal app shell to make navigations work offline
const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(PRECACHE_URLS);
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(PREFIX) && ![SHELL_CACHE, RUNTIME_CACHE].includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isHTMLRequest(request) {
  const accept = request.headers.get('accept') || '';
  return request.mode === 'navigate' || accept.includes('text/html');
}

function staleWhileRevalidate(cacheName, request) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          try { if (response && response.ok) cache.put(request, response.clone()); } catch {}
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || networkFetch;
    })
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // let non-GET pass
  const url = new URL(request.url);

  // Ignore non-http(s) schemes (e.g., chrome-extension)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // HTML navigations: network-first with offline fallback
  if (isHTMLRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          try { cache.put(request, fresh.clone()); } catch {}
          return fresh;
        } catch (_) {
          const cache = await caches.open(SHELL_CACHE);
          const cached = await cache.match(request);
          return cached || cache.match('/offline.html');
        }
      })()
    );
    return;
  }

  // Runtime cache for images, scripts, styles
  if (['image', 'script', 'style', 'font'].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(RUNTIME_CACHE, request).catch(() => fetch(request)));
    return;
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
