import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {initial} from '../lib/travel.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const {outputFiles}=await build({absWorkingDir:root,entryPoints:['standalone/worker.ts'],tsconfigRaw:{compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'Bundler'}},bundle:true,write:false,format:'esm',platform:'neutral',external:['node:crypto'],target:'es2022'});
const setupToken=randomBytes(32).toString('base64url'),password=randomBytes(24).toString('base64url');
const mf=new Miniflare({workers:[
  {name:'root',modules:true,script:outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'standalone-test-db'},bindings:{SETUP_TOKEN:setupToken},serviceBindings:{ASSETS:'assets'}},
  {name:'assets',modules:true,script:`export default {fetch(request){return new Response('<!doctype html><title>Public app shell</title>',{headers:{'content-type':'text/html'}})}}`},
]});
try {
  const db=await mf.getD1Database('DB','root');
  for(const file of ['0000_daffy_bushwacker.sql','0001_standalone_auth.sql','0002_map_limits.sql']) {
    const sql=(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).replace(/--[^\n]*/g,'').replace(/\s+/g,' ');
    await db.exec(sql);
  }
  const send=async(path,{body,cookie,headers={}}={})=>{
    const response=await mf.dispatchFetch('https://standalone.example'+path,{method:body===undefined?'GET':'POST',headers:{origin:'https://standalone.example','content-type':'application/json','CF-Connecting-IP':'192.0.2.55',...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const type=response.headers.get('content-type')||'';
    const data=type.includes('json')?await response.json():await response.text();
    if(path.startsWith('/api/'))assert.equal(response.headers.get('cache-control'),'no-store');
    return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
  };
  const oai={'oai-authenticated-user-id':'spoofed-user','oai-authenticated-user-email':'spoof@example.invalid'};
  for(const path of ['/api/state','/api/maps?action=config','/_AMapService/v3/place/text?q=test']) {
    assert.equal((await send(path)).status,401,'sensitive endpoint requires independent session');
    assert.equal((await send(path,{headers:oai})).status,401,'legacy platform headers cannot authenticate');
  }
  assert.equal((await send('/')).status,200,'public shell is available before login');
  assert.equal((await send('/api/auth/session')).data.setupRequired,true);
  const setup=await send('/api/auth/setup',{body:{token:setupToken,username:'owner',password,name:'集成测试'}});
  assert.equal(setup.status,200);assert.equal(typeof setup.data.recoveryCode,'string');
  const deviceA=setup.cookie,userId=setup.data.user.id;
  const second=await send('/api/auth/login',{body:{username:'owner',password}});
  assert.equal(second.status,200);assert.equal(second.data.user.id,userId);
  const deviceB=second.cookie;
  assert.equal((await send('/api/auth/setup',{body:{token:setupToken,username:'another',password}})).status,409,'public signup is closed after first account');
  const empty=await send('/api/state',{cookie:deviceA});
  assert.equal(empty.status,200);assert.deepEqual(empty.data.data,initial);assert.equal(empty.data.revision,0);
  // The former site's export format is {data:<v2 state>,...}; import preserves IDs and content.
  const legacyBackup={data:{...structuredClone(initial),places:[{id:'legacy-place',name:'旧站收藏地点',originalName:'原地名',lng:119.97,lat:31.81,category:'sight',tags:'测试',note:'历史备注',url:'',visited:false}],folders:[{id:'legacy-folder',name:'常州',placeIds:['legacy-place'],routes:[{id:'legacy-route',name:'历史路线',date:'',stops:['legacy-place'],modes:{},note:''}]}]}};
  const saved=await send('/api/state',{cookie:deviceA,body:{data:legacyBackup.data,revision:0}});
  assert.equal(saved.status,200);assert.equal(saved.data.revision,1);
  const loaded=await send('/api/state',{cookie:deviceB});
  assert.deepEqual(loaded.data.data,legacyBackup.data);assert.equal(loaded.data.revision,1);
  assert.equal((await send('/api/state',{cookie:deviceA,body:{data:initial,revision:0}})).status,409,'stale CAS cannot overwrite imported state');
  assert.equal((await send('/api/state',{cookie:deviceA,body:{data:initial,revision:1},headers:{origin:'https://evil.example'}})).status,403);
  assert.equal((await send('/api/state',{cookie:deviceA,body:{data:{schemaVersion:1},revision:1}})).status,400);
  assert.equal((await send('/api/state',{cookie:deviceA,body:{data:initial,revision:-1}})).status,400);
  const updateA=structuredClone(legacyBackup.data);updateA.folders[0].name='设备 A';
  const updateB=structuredClone(legacyBackup.data);updateB.folders[0].name='设备 B';
  const competing=await Promise.all([send('/api/state',{cookie:deviceA,body:{data:updateA,revision:1}}),send('/api/state',{cookie:deviceB,body:{data:updateB,revision:1}})]);
  assert.deepEqual(competing.map(v=>v.status).sort(),[200,409],'concurrent devices cannot both replace one revision');
  assert.equal((await send('/api/maps?action=config',{cookie:deviceA})).status,200,'map config supports logged-in session without external fetch');
  assert.equal((await send('/api/auth/logout',{cookie:deviceA,body:{}})).status,200);
  assert.equal((await send('/api/state',{cookie:deviceA})).status,401,'logout revokes that device token');
  assert.equal((await send('/api/state',{cookie:deviceB})).status,200,'other device remains signed in');
  assert.equal((await send('/api/state',{headers:oai})).status,401,'public asset access does not expose cloud data');
  const rows=await db.prepare('SELECT user_id,revision FROM travel_states').all();
  assert.equal(rows.results.length,1);assert.equal(rows.results[0].user_id,userId);assert.equal(rows.results[0].revision,2);
  console.log('PASS: real standalone Worker/workerd/D1, migrations, protected state/maps/proxy, spoofed-header rejection, closed signup, two-device identity, legacy export import, concurrent CAS, CSRF, schema validation, logout, public assets/private data. No external map calls or credentials printed.');
} finally {await mf.dispose()}
