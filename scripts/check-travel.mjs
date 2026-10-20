import assert from 'node:assert/strict';
import {initial} from '../lib/travel.ts';
const base='http://127.0.0.1:5173';
const headers={cookie:'__sites_local_auth=1',origin:base,'Content-Type':'application/json'};
const get=()=>fetch(base+'/api/state',{headers}).then(r=>r.json());
const save=(data,revision,extra={})=>fetch(base+'/api/state',{method:'POST',headers:{...headers,...extra},body:JSON.stringify({data,revision})});
const original=await get();let rev=original.revision;
try{
 assert.equal((await fetch(base+'/api/state')).status,401,'anonymous reads rejected');
 assert.equal((await save(original.data,rev,{origin:'https://other.example'})).status,403,'cross-origin writes rejected');
 const data=structuredClone(original.data||initial),cat=data.categories[0].id;
 const p=(id,name,lng)=>({id,name,lng,lat:30.25,category:cat,tags:'测试',note:'备注',url:'',visited:false,saved:true});
 data.places.push(p('check-a','验证 A',120.15),p('check-b','验证 B',120.16));
 data.trips.push({id:'check-trip',name:'测试旅行',placeIds:['check-a','check-b'],routes:[{id:'check-route',name:'测试路线',date:'',stops:['check-a','check-b'],modes:{0:'bicycling'},note:''}]});
 let r=await save(data,rev);assert.equal(r.status,200);rev=(await r.json()).revision;
 assert.equal((await save(data,rev-1)).status,409,'stale device revision rejected');
 let cloud=await get();assert.equal(cloud.data.trips.at(-1).routes[0].modes[0],'bicycling');
 data.trips.at(-1).routes[0].stops.reverse();data.places.find(p=>p.id==='check-a').saved=false;
 r=await save(data,rev);assert.equal(r.status,200);rev=(await r.json()).revision;
 cloud=await get();assert.deepEqual(cloud.data.trips.at(-1).routes[0].stops,['check-b','check-a']);assert(cloud.data.trips.at(-1).placeIds.includes('check-a'),'removing collection retains trip');
 const bad=structuredClone(data);bad.trips.at(-1).placeIds.push('missing-id');assert.equal((await save(bad,rev)).status,400,'invalid references rejected');
 const injection=structuredClone(data);injection.places.at(-1).url='javascript:alert(1)';assert.equal((await save(injection,rev)).status,400,'unsafe URLs rejected');
 const cfg=await fetch(base+'/api/maps?action=config',{headers}).then(r=>r.json());if(!cfg.ready)assert.equal((await fetch(base+'/api/maps?action=search&q=杭州',{headers})).status,503,'unconfigured maps honestly unavailable');
 assert.equal((await fetch(base+'/_AMapService/v3/place/text',{headers})).status,503,'security proxy route exists');
 assert.equal((await fetch(base+'/offline.html')).status,200);
 console.log('PASS: login access, origin check, persistence, reorder, cycling, collection independence, concurrent revision, input validation, map configuration, offline page');
}finally{const current=await get();assert.equal((await save(original.data||initial,current.revision)).status,200,'restore local test data');}
