const CACHE_NAME = 'labbayk-static-v2';
const APP_SHELL = new URL('/', self.location.origin).href;
const STATIC_DESTINATIONS = new Set(['script', 'style', 'font', 'image', 'manifest']);
const SUPABASE_PATH = /^\/(?:auth|rest|storage|functions|realtime)\/v1(?:\/|$)/;

async function cacheSameOriginAsset(cache, value) {
  const url = new URL(value, APP_SHELL);
  if (url.origin !== self.location.origin || SUPABASE_PATH.test(url.pathname)) return;
  try {
    const response = await fetch(url.href, { credentials: 'omit' });
    if (response.ok && response.type === 'basic') await cache.put(url.href, response);
  } catch {
    // The app shell can still install if an optional asset is unavailable.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(APP_SHELL, { cache: 'reload', credentials: 'omit' });
    if (!response.ok) throw new Error('Could not cache the LABBAYK app shell.');
    const html = await response.clone().text();
    await cache.put(APP_SHELL, response);

    const assets = new Set([...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]));
    await Promise.all([...assets].map((asset) => cacheSameOriginAsset(cache, asset)));

    const manifestUrl = [...assets].find((asset) => new URL(asset, APP_SHELL).pathname.endsWith('/manifest.json'));
    if (manifestUrl) {
      const manifestResponse = await cache.match(new URL(manifestUrl, APP_SHELL).href);
      if (manifestResponse) {
        try {
          const manifest = await manifestResponse.json();
          await Promise.all((manifest.icons ?? []).map((icon) => cacheSameOriginAsset(cache, icon.src)));
        } catch {
          // A malformed optional manifest does not prevent the app from opening.
        }
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('labbayk-static-') && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || SUPABASE_PATH.test(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && url.origin === self.location.origin && url.pathname === '/') {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(APP_SHELL, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(APP_SHELL)) ?? new Response('لَبّيك يحتاج اتصالاً أولياً لتحميل التطبيق.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
    return;
  }

  if (!STATIC_DESTINATIONS.has(request.destination)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
