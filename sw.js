/* Simulasi Kredit PWA — scoped to /simulasi-kredit/.
   Only public app files are cached. User-entered values are not stored here.
   Bump APP_CACHE_VERSION when updating the UI/logic. */
const APP_CACHE_VERSION = 'simkredit-6produk-admin-users-fixed-v30-20261015';
const APP_URL = new URL('./', self.registration.scope).href;
const ASSET_PATHS = ['./', './index.html', './manifest.webmanifest','./firebase-monitor.js', './pegawai-plus.html',
  './report-export.js','./online-funding-admin.js', './user-management.js', './theme.css', './theme.js', './deposito.html', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE_VERSION);
    await cache.addAll(ASSET_PATHS.map(path => new URL(path, APP_URL).href));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if ((name.startsWith('simkredit-shell-') || name.startsWith('simkredit-monitor-') || name.startsWith('simkredit-5produk-') || name.startsWith('simkredit-6produk-')) && name !== APP_CACHE_VERSION) {
        await caches.delete(name);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(APP_URL).pathname)) return;
  // Network-first for pages: online updates should be fetched whenever possible.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(APP_CACHE_VERSION);
          // Cache each page under its own URL: never overwrite the loan homepage
          // with the separately navigable Deposito ME page.
          await cache.put(req, fresh.clone());
          if (url.pathname === new URL('./', APP_URL).pathname ||
              url.pathname === new URL('./index.html', APP_URL).pathname) {
            await cache.put(new URL('./index.html', APP_URL).href, fresh.clone());
          }
        }
        return fresh;
      } catch (_) {
        return (await caches.match(req)) ||
          ((url.pathname === new URL('./', APP_URL).pathname ||
            url.pathname === new URL('./index.html', APP_URL).pathname)
           ? await caches.match(new URL('./index.html', APP_URL).href) : null) ||
          Response.error();
      }
    })());
    return;
  }
  // Cache-first for static assets; they update on cache-version change.
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try { return await fetch(req); }
    catch (_) { return Response.error(); }
  })());
});
