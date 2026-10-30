/* Simulasi Kredit PWA — GitHub Pages. Cache V63. */
const APP_CACHE_VERSION = 'simkredit-prk-20261031-v68-mobile';
const APP_URL = new URL('./', self.registration.scope).href;
const ASSET_PATHS = ['./kredit-usaha-prk.html','./kendaraan.html','./vehicle-calc.js','./vehicle-ui.js','./', './index.html', './manifest.webmanifest',
  './firebase-monitor.js','./pegawai-plus.html','./report-export.js',
  './online-funding-admin.js','./user-management.js','./theme.css',
  './theme.js','./deposito.html','./icon-192.png','./icon-512.png',
  './apple-touch-icon.png'];

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
      if (name.startsWith('simkredit-') && name !== APP_CACHE_VERSION) {
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
  if (url.origin !== self.location.origin ||
      !url.pathname.startsWith(new URL(APP_URL).pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(APP_CACHE_VERSION);
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

  // JS modules must prefer fresh network data so Firebase validation isn't stale.
  // The cache remains an offline fallback only for already verified responses.
  if (url.pathname.endsWith('.js')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, {cache:'no-store'});
        if (fresh.ok) {
          const cache = await caches.open(APP_CACHE_VERSION);
          await cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (_) { return (await caches.match(req)) || Response.error(); }
    })());
    return;
  }
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try { return await fetch(req); }
    catch (_) { return Response.error(); }
  })());
});


