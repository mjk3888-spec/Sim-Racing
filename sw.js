/* ============================================================================
   LUMINARY ENDURANCE MANAGER — service worker
   ----------------------------------------------------------------------------
   Goals:
   1. Offline launch: the app shell (index.html + manifest + icons) is precached
      so the installed app opens with no network.
   2. Instant launch: navigations are answered from cache immediately, then
      revalidated against the server in the background.
   3. A new deploy actually reaches devices: when the background revalidation
      sees a changed index.html (ETag / Last-Modified differ — GitHub Pages
      sends both), the cache is refreshed and every open page is told to show
      its "UPDATE READY" toast. Worst case, the next launch serves the new copy.

   DEPLOY RULE: bump CACHE_VERSION on every release. A changed sw.js byte-for-
   byte is what makes the browser install the new worker; the new version name
   is what makes activate() below delete the previous caches. Editing only
   index.html still propagates via revalidation, but bumping the version is the
   guaranteed path and also refreshes icons/manifest.

   All URLs are relative to this file's location, so everything works when
   GitHub Pages serves the site from a project subpath (user.github.io/repo/).
   ========================================================================== */

const CACHE_VERSION = '2026-08-15.1';
const SHELL_CACHE = 'luminary-shell-' + CACHE_VERSION;
const RUNTIME_CACHE = 'luminary-runtime-' + CACHE_VERSION;

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/logo.svg',
  './styles/tokens.css',
  './styles/base.css',
  './styles/components.css',
  './styles/pages.css',
  './js/data.js',
  './js/state.js',
  './js/config.js',
  './js/schedule.js',
  './js/dashboard.js',
  './js/strategy.js',
  './js/drivers.js',
  './js/goals.js',
  './js/optimizer.js',
  './js/nav.js',
  './js/sync.js',
  './js/actions.js',
  './js/main.js',
  './js/pwa.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

/* CDN assets the app shell links to (fonts, flag CSS). Cached best-effort so the
   installed app keeps its typography and flags offline. Only these hosts are
   ever runtime-cached; every other cross-origin request — including the Google
   Apps Script live-sync endpoint — passes straight through to the network so
   sync data is never served stale from cache. */
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];
const CDN_PRECACHE = [
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Share+Tech+Mono&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/flag-icons/6.11.0/css/flag-icons.min.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL);
    // Best-effort CDN warmup — never fail install over a CDN hiccup.
    const runtime = await caches.open(RUNTIME_CACHE);
    await Promise.all(CDN_PRECACHE.map((url) =>
      runtime.add(new Request(url, { mode: 'cors' })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('luminary-') && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

async function notifyClientsOfUpdate() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((c) => c.postMessage({ type: 'APP_UPDATE_READY' }));
}

/* Navigations: cached shell first (instant, offline-capable), network
   revalidation in the background with change detection. */
async function handleNavigation(event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match('./index.html');

  const revalidate = (async () => {
    try {
      const fresh = await fetch(event.request);
      if (fresh && fresh.ok) {
        const freshTag = fresh.headers.get('etag') || fresh.headers.get('last-modified') || '';
        const cachedTag = cached
          ? (cached.headers.get('etag') || cached.headers.get('last-modified') || '')
          : '';
        await cache.put('./index.html', fresh.clone());
        if (cached && freshTag && freshTag !== cachedTag) {
          await notifyClientsOfUpdate();
        }
      }
      return fresh;
    } catch (e) {
      return null;
    }
  })();

  if (cached) {
    event.waitUntil(revalidate); // keep the SW alive until revalidation finishes
    return cached;
  }
  const fresh = await revalidate;
  if (fresh) return fresh;
  return new Response('Offline — Luminary has not been cached yet. Open once while online.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' }
  });
}

/* Same-origin static assets: cache-first, populate on miss. */
async function handleSameOriginAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

/* Allowlisted CDN assets: stale-while-revalidate. */
async function handleRuntimeAsset(event) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(event.request);
  const network = fetch(event.request)
    .then((response) => {
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(event.request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const response = await network;
  return response || new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // sync POSTs etc. always hit the network

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(handleSameOriginAsset(request));
    return;
  }
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(handleRuntimeAsset(event));
    return;
  }
  // Everything else (e.g. script.google.com live sync reads) goes straight to
  // the network — deliberately never cached.
});
