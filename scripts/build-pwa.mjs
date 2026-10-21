import {build} from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

await build({configFile:'vite.pwa.config.ts'});
const out=path.resolve('dist/pwa');
const files=[];
async function walk(dir,prefix='') {
  for(const f of await fs.readdir(dir,{withFileTypes:true})) {
    if(f.isDirectory())await walk(path.join(dir,f.name),prefix+f.name+'/');
    else files.push(prefix+f.name);
  }
}
await walk(out);
const assets=files.filter(f=>f.startsWith('assets/')).sort();
const hash=createHash('sha256');
for(const f of files.filter(f=>f!=='precache.json').sort())hash.update(f).update(await fs.readFile(path.join(out,f)));
const version=hash.digest('hex').slice(0,16);
const html=await fs.readFile(path.join(out,'index.html'),'utf8');
await fs.writeFile(path.join(out,'index.html'),html.replace('</head>',`<meta name="suixing-build" content="${version}" /></head>`));
const sw=await fs.readFile(path.join(out,'sw.js'),'utf8');
await fs.writeFile(path.join(out,'sw.js'),sw.replaceAll('__SUIXING_BUILD_ID__',version));
await fs.writeFile(path.join(out,'precache.json'),JSON.stringify({version,assets:[
  '/',...assets.map(f=>'/'+f),'/favicon.svg','/offline.html','/manifest.webmanifest',
  '/vendor/leaflet.js','/vendor/leaflet.css',
  '/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png','/icons/apple-touch-icon.png',
]}));
console.log(JSON.stringify({build:version,assets:assets.length,output:'dist/pwa'}));
