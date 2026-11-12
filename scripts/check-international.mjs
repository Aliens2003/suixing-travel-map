import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {hashPassword} from '../lib/password.ts';
import {geoapify} from '../lib/geoapify.ts';
const bundle=await build({entryPoints:['standalone/worker.ts'],bundle:true,write:false,format:'esm',platform:'neutral',external:['node:crypto']});
const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{WEB_ORIGIN:'https://aliens2003.github.io'}});
try{
const db=await mf.getD1Database('DB');
for(const file of ['scripts/fixture-original-state.sql','scripts/fixture-original-auth.sql','standalone/intl-schema.sql']){
 await db.exec((await readFile(file,'utf8')).replace(/--[^\n]*/g,'').replace(/\s+/g,' '));
}
const owner='fixture-owner',password=crypto.randomUUID(),origin='https://aliens2003.github.io';
await db.prepare('INSERT INTO app_users(id,username,name,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?,0)').bind(owner,'fixture','Fixture',await hashPassword(password),'old').run();
await db.prepare('INSERT INTO travel_states VALUES(?,?,?)').bind(owner,'original untouched',7).run();
const call=(p,{body,token,method,site=origin}={})=>mf.dispatchFetch('https://test.example'+p,{method:method||(body?'POST':'GET'),headers:{Origin:site,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
assert.equal((await call('/api/state',{site:'https://other.example'})).status,403);
assert.equal((await call('/api/state',{method:'OPTIONS'})).headers.get('access-control-allow-origin'),origin);
assert.equal((await call('/api/state')).status,401);
const logins=[];
for(let i=0;i<2;i++){const r=await call('/api/auth/login',{site:'https://test.example',body:{username:'fixture',password}});assert.equal(r.status,200);logins.push((await r.json()).token)}
const [a,b]=logins;assert.notEqual(a,b);
const state=(await (await call('/api/state',{token:a})).json()).data;
state.folders.push({id:'fixture-folder',name:'Tokyo',placeIds:[],routes:[]});
assert.equal((await call('/api/state',{token:a,body:{data:state,revision:0}})).status,200);
assert.equal((await call('/api/state',{token:b,body:{data:state,revision:0}})).status,409);
assert.equal((await (await call('/api/state',{token:b})).json()).data.folders[0].name,'Tokyo');
assert.equal((await db.prepare('SELECT payload FROM travel_states WHERE user_id=?').bind(owner).first()).payload,'original untouched');
assert.equal((await call('/api/maps?action=search&q=Tokyo',{token:a})).status,503);
await db.prepare("UPDATE app_users SET recovery_hash='new' WHERE id=?").bind(owner).run();
assert.equal((await call('/api/state',{token:a})).status,401);
const r=await geoapify(new Request('https://test.example/api/maps?action=search&q=Tokyo'), 'mock-key',async u=>{
 assert.equal(u.hostname,'api.geoapify.com');assert.equal(u.searchParams.get('text'),'Tokyo');
 return Response.json({results:[{name:'Tokyo Station',lat:35.68,lon:139.76,formatted:'Tokyo, Japan'}]});
});
assert.deepEqual((await r.json()).places,[{name:'Tokyo Station',lat:35.68,lng:139.76,address:'Tokyo, Japan'}]);
assert.equal((await geoapify(new Request('https://test.example/api/tile/1/3/0'),'mock-key',()=>{throw Error('unexpected upstream')})).status,400);
console.log('PASS: CORS, account reuse, two-device sync, conflicts, original data isolation, session revocation, Geoapify result and tile validation');
}finally{await mf.dispose()}
