/* The PWA build replaces this version; never cache accounts, API responses or tiles. */
const BUILD_ID = '__SUIXING_BUILD_ID__';
const PREFIX = 'suixing-pwa-shell-';
const CACHE = PREFIX + BUILD_ID;
const REQUIRED = ['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png', '/vendor/leaflet.js', '/vendor/leaflet.css'];
const forbidden = path => /^\/(?:api(?:\/|$)|_AMapService(?:\/|$)|auth(?:\/|$)|(?:signin|signout|login|logout)(?:[-/]|$))/.test(path);
const allowedAsset = path => REQUIRED.includes(path) || /^\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css|woff2?|ttf|otf)$/.test(path) || path === '/favicon.svg';
const isShell = async response => response.ok && (response.headers.get('content-type') || '').includes('text/html') && (await response.clone().text()).includes(`name="suixing-build" content="${BUILD_ID}"`);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch('/precache.json', { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error('Precache manifest unavailable');
    const manifest = await response.json();
    if (manifest.version !== BUILD_ID || !Array.isArray(manifest.assets) || manifest.assets.length > 200 || !REQUIRED.every(path => manifest.assets.includes(path))) throw new Error('Invalid precache manifest');
    const paths = [...new Set(manifest.assets)];
    if (!paths.every(path => typeof path === 'string' && allowedAsset(path) && !path.includes('..') && !forbidden(path))) throw new Error('Unsafe precache URL');
    try {
      // Buffer all required chunks first: an incomplete release cannot replace a working shell.
      const entries = await Promise.all(paths.map(async path => {
        const item = await fetch(path, { cache: 'reload', credentials: 'omit' });
        if (!item.ok || item.redirected || item.type === 'opaque' || (path === '/' && !(await isShell(item)))) throw new Error('Incomplete app shell: ' + path);
        return [path, item];
      }));
      const cache = await caches.open(CACHE);
      await Promise.all(entries.map(([path, item]) => cache.put(path, item)));
    } catch (error) { await caches.delete(CACHE); throw error; }
  })());
  // No skipWaiting here: the page enables updates only after pending edits are safe.
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => (name.startsWith(PREFIX) || /^suixing-shell-v\d+$/.test(name)) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || forbidden(url.pathname)) return;
  if (request.mode === 'navigate') {
    if (url.pathname !== '/' && url.pathname !== '/index.html') return;
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) {
          if (!response.redirected && await isShell(response)) await cache.put('/', response.clone());
          return response;
        }
        return (await cache.match('/')) || response;
      } catch {
        return (await cache.match('/')) || (await cache.match('/offline.html')) || new Response('请联网完成首次安装。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }
  if (url.search || !allowedAsset(url.pathname) || url.pathname === '/') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(url.pathname)) || fetch(request);
  })());
});
