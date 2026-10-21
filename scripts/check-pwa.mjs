import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = (await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')).replaceAll('__SUIXING_BUILD_ID__', 'test-build');
const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
assert.equal(manifest.display, 'standalone'); assert.equal(manifest.id, '/'); assert.equal(manifest.scope, '/');
for (const [file, size] of [['icon-192.png',192],['icon-512.png',512],['maskable-512.png',512],['apple-touch-icon.png',180]]) {
  const image = await readFile(new URL('../public/icons/' + file, import.meta.url));
  assert.equal(image.subarray(1,4).toString(), 'PNG'); assert.equal(image.readUInt32BE(16), size); assert.equal(image.readUInt32BE(20), size);
}
const origin = 'https://suixing.test';
const shell = '<!doctype html><meta name="suixing-build" content="test-build"><main>public shell</main>';
const files = ['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png', '/vendor/leaflet.js', '/vendor/leaflet.css', '/assets/app-abc123.js', '/assets/app-def456.css'];
function harness(options={}) {
  const handlers = {}, storage = new Map(), calls = [];
  let skipped = 0, claimed = 0, offline = false, navigationBody = shell;
  const keyOf = key => typeof key === 'string' ? key : new URL(key.url).pathname;
  const cacheApi = { async open(name) {
    if (!storage.has(name)) storage.set(name,new Map());
    const data=storage.get(name);
    return { async put(key,response) {data.set(keyOf(key),response.clone());}, async match(key) {return data.get(keyOf(key))?.clone();} };
  }, async keys(){return [...storage.keys()];}, async delete(name){return storage.delete(name);} };
  const fetchMock = async request => {
    const path = typeof request === 'string' ? request : new URL(request.url).pathname;
    calls.push(path);
    if (offline || path===options.fail) throw new Error('Network unavailable');
    if(path==='/precache.json') return Response.json({version:options.version||'test-build',assets:options.assets||files});
    return new Response(path==='/' ? navigationBody : path, {headers:{'content-type':path==='/'?'text/html':'text/plain'}});
  };
  const self = {location:{origin}, clients:{async claim(){claimed++;}}, async skipWaiting(){skipped++;}, addEventListener(type,fn){handlers[type]=fn;}};
  vm.runInNewContext(source, {self,caches:cacheApi,fetch:fetchMock,URL,Response,Set,Promise,Error});
  async function lifecycle(type,data) { let pending; handlers[type]({data,waitUntil(value){pending=value;}}); await pending; }
  async function request(path,{mode='cors',method='GET',external=false}={}) {
    let response;
    handlers.fetch({request:{url:(external?'https://tiles.other.test':origin)+path,mode,method},respondWith(value){response=value;}});
    return response ? await response : undefined;
  }
  return {storage,calls,lifecycle,request,cacheApi,setOffline(value){offline=value;},setShell(value){navigationBody=value;},get skipped(){return skipped;},get claimed(){return claimed;}};
}
const app = harness();
await app.lifecycle('install'); assert.equal(app.skipped,0,'install never forces an update');
const appCache = app.storage.get('suixing-pwa-shell-test-build');
assert.equal(appCache.size,files.length);
await app.cacheApi.open('other-product-cache'); await app.cacheApi.open('suixing-pwa-shell-old'); await app.cacheApi.open('suixing-shell-v2');
await app.lifecycle('activate'); assert.ok(app.storage.has('other-product-cache')); assert.ok(!app.storage.has('suixing-pwa-shell-old')); assert.ok(!app.storage.has('suixing-shell-v2')); assert.equal(app.claimed,1);
app.setOffline(true);
assert.equal(await (await app.request('/',{mode:'navigate'})).text(),shell,'offline navigation boots the real SPA');
assert.equal(await (await app.request('/assets/app-abc123.js')).text(),'/assets/app-abc123.js');
for (const path of ['/vendor/leaflet.js', '/vendor/leaflet.css']) assert.equal(await (await app.request(path)).text(),path,'bundled Leaflet works offline');
assert.equal(await app.request('/vendor/tiles/1.png'),undefined,'vendor tile paths are not cacheable');
for(const path of ['/api/state','/api/auth/login','/signin-with-chatgpt','/signout','/auth/reset','/_AMapService/v3/place']) assert.equal(await app.request(path,{mode:'navigate'}),undefined,'never intercept '+path);
assert.equal(await app.request('/assets/tile.png'),undefined); assert.equal(await app.request('/tile.png',{external:true}),undefined); assert.equal(await app.request('/',{method:'POST'}),undefined);
app.setOffline(false); app.setShell('<meta name="suixing-build" content="new-build">new shell');
await app.request('/',{mode:'navigate'}); app.setOffline(true);
assert.equal(await (await app.request('/',{mode:'navigate'})).text(),shell,'old shell cannot be overwritten by a different release');
await app.lifecycle('message',{type:'UNRELATED'}); assert.equal(app.skipped,0);
await app.lifecycle('message',{type:'SKIP_WAITING'}); assert.equal(app.skipped,1);
for(const options of [{fail:'/assets/app-abc123.js'},{fail:'/vendor/leaflet.js'},{assets:files.filter(path=>path!=='/vendor/leaflet.css')},{version:'different'},{assets:files.filter(path=>path!=='/')},{assets:[...files,'/api/state']}]) {
  const bad=harness(options); await bad.cacheApi.open('suixing-pwa-shell-working');
  await assert.rejects(bad.lifecycle('install'));
  assert.ok(bad.storage.has('suixing-pwa-shell-working'),'failed installation preserves previous release');
  assert.ok(!bad.storage.has('suixing-pwa-shell-test-build'),'failed installation leaves no partial new shell');
  assert.equal(bad.skipped,0);
}
console.log('PWA checks passed: manifest/icons, complete precache, offline shell/chunks, auth/API exclusion, release isolation, safe activation.');
