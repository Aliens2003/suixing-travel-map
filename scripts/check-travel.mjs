import assert from 'node:assert/strict';
import {initial,removeFromFolder} from '../lib/travel.ts';
const base='http://127.0.0.1:5173';
const headers={cookie:'__sites_local_auth=1',origin:base,'Content-Type':'application/json'};
const get=()=>fetch(base+'/api/state',{headers}).then(r=>r.json());
const save=(data,revision,extra={})=>fetch(base+'/api/state',{method:'POST',headers:{...headers,...extra},body:JSON.stringify({data,revision})});
const original=await get();let rev=original.revision;
try{
 assert.equal((await fetch(base+'/api/state')).status,401);
 assert.equal((await save(initial,rev,{origin:'https://other.example'})).status,403);
 const data=structuredClone(initial),p=(id,name,lng)=>({id,name,originalName:name,lng,lat:30.25,category:'sight',tags:'测试',note:'备注',url:'',visited:false});
 data.places.push(p('check-a','验证 A',120.15),p('check-b','验证 B',120.16));
 data.folders=[{id:'hz',name:'杭州',placeIds:['check-a','check-b'],routes:[{id:'r',name:'第一天',date:'',stops:['check-a','check-b'],modes:{0:'bicycling'},note:''}]},{id:'cz',name:'常州',placeIds:['check-a'],routes:[]}];
 let r=await save(data,rev);assert.equal(r.status,200);rev=(await r.json()).revision;
 assert.equal((await save(data,rev-1)).status,409);
 assert.equal((await get()).data.folders[0].routes[0].modes[0],'bicycling');
 data.folders[0].routes[0].stops.reverse();data.places[0].name='共享名称';r=await save(data,rev);assert.equal(r.status,200);rev=(await r.json()).revision;
 assert.deepEqual((await get()).data.folders[0].routes[0].stops,['check-b','check-a']);
 removeFromFolder(data,'hz','check-a');r=await save(data,rev);assert.equal(r.status,200);rev=(await r.json()).revision;
 const cloud=await get();assert.equal(cloud.data.places.find(p=>p.id==='check-a').name,'共享名称');assert.deepEqual(cloud.data.folders[1].placeIds,['check-a']);
 const bad=structuredClone(data);bad.folders[0].placeIds.push('missing');assert.equal((await save(bad,rev)).status,400);
 const unsafe=structuredClone(data);unsafe.places[0].url='javascript:alert(1)';assert.equal((await save(unsafe,rev)).status,400);
 assert.equal((await save({categories:[],places:[],trips:[]},rev)).status,400);
 assert.equal((await fetch(base+'/offline.html')).status,200);
 console.log('PASS: auth, origin, folder persistence, reorder/cycling, shared edits, independent removal, CAS conflicts, invalid refs/URLs/legacy rejected, offline page');
}finally{const current=await get();assert.equal((await save(original.data||initial,current.revision)).status,200)}
