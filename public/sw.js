const CACHE='suixing-shell-v2';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/offline.html','/favicon.svg'])));self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('suixing-shell-')&&k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==location.origin||e.request.method!=='GET')return;if(e.request.mode==='navigate'&&!u.pathname.startsWith('/signin')&&!u.pathname.startsWith('/signout'))e.respondWith(fetch(e.request).catch(()=>caches.match('/offline.html')));else if(u.pathname==='/offline.html')e.respondWith(fetch(e.request).catch(()=>caches.match('/offline.html')))});
