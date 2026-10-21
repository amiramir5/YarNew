/* YarNew offline shell service worker
 * Strategy:
 *  - App navigation (index.html): network-first, falls back to cache → the app
 *    opens even with no internet (مثلاً قطعی کامل نت).
 *  - Same-origin static assets (JS/CSS/fonts): cache-first + runtime cache.
 *  - API calls (Supabase REST/auth/functions): NEVER cached — the app already
 *    queues writes in the outbox and flushes them when connectivity returns.
 */
const SHELL_CACHE = 'yarnew-shell-v1';
const RUNTIME_CACHE = 'yarnew-runtime-v1';
const SHELL_URLS = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // writes go straight to network/outbox logic
  const url = new URL(req.url);

  // Never intercept the data API / auth / functions
  const isDataApi =
    url.hostname.endsWith('.supabase.co') ||
    url.hostname.endsWith('.supabase.in') ||
    url.pathname.includes('/rest/v1') ||
    url.pathname.includes('/auth/v1') ||
    url.pathname.includes('/functions/v1') ||
    url.pathname.includes('/storage/v1');
  if (isDataApi) return;

  if (url.origin !== self.location.origin) return;

  // App documents: network-first with offline cache fallback
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match('./index.html') || caches.match('./'))
        )
    );
    return;
  }

  // Static assets: cache-first, refresh in background
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
