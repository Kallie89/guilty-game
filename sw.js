/* GUILTY — offline service worker
   Upload this file to the ROOT of the guilty-game repo (next to index.html),
   commit, and the game becomes fully playable offline after its first
   online launch.

   Strategy:
   - Navigations (the game page): network-first, falling back to the cached
     copy when offline — players always get the newest version when online,
     and the last good version when not.
   - Everything else same-origin + Google Fonts: cache-first with background
     refresh, so fonts and icons work offline after first use.               */

const CACHE_VERSION = 'guilty-v1';
const PRECACHE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // Add each precache entry individually so one missing file
    // (e.g. a path that doesn't exist in this repo) can't break install.
    await Promise.all(PRECACHE.map(async (url) => {
      try { await cache.add(url); } catch (e) { /* ignore */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_VERSION) ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // The game page itself: network-first, cache fallback.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        const fresh = await fetch(req);
        cache.put('./', fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await cache.match('./') || await cache.match('./index.html');
        if (cached) return cached;
        throw e;
      }
    })());
    return;
  }

  // Same-origin assets + Google Fonts: cache-first, refresh in background.
  const url = new URL(req.url);
  const cacheable = url.origin === self.location.origin ||
                    url.hostname === 'fonts.googleapis.com' ||
                    url.hostname === 'fonts.gstatic.com';
  if (!cacheable) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req);
    const fetchAndPut = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await fetchAndPut) || Response.error();
  })());
});
