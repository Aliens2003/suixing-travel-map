'use client';
import {useEffect,useRef,useState} from 'react';
import {AccountSyncLease,readSyncRecord,TravelSyncEngine,type LocksLike,type SyncSnapshot} from '../lib/offline-sync';
import {initial} from '../lib/travel';

export function useTravelSync(user:{id:string,name:string}|null){
 const [engine,setEngine]=useState<TravelSyncEngine|null>(null);
 const [snapshot,setSnapshot]=useState<SyncSnapshot>({data:initial,loaded:false,busy:false,online:true,sync:'正在连接',conflicts:[],pending:false});
 const retry=useRef<()=>void>(()=>{});
 useEffect(()=>{
  // Access to window.localStorage itself can throw in restricted browser contexts.
  const storage={getItem:(key:string)=>window.localStorage.getItem(key),setItem:(key:string,value:string)=>window.localStorage.setItem(key,value)};
  let alive=true,active:TravelSyncEngine|null=null,lease:AccountSyncLease|null=null;
  function readonly(reason:string){if(!alive)return;setEngine(null);let data=initial,pending=false;try{if(user){const record=readSyncRecord(storage,`suixing-offline-v1-${user.id}`,`suixing-v2-cache-${user.id}`);if(record){data=record.local;pending=!!record.session||JSON.stringify(record.base)!==JSON.stringify(record.local)}}}catch{}setSnapshot({data,loaded:true,busy:false,online:navigator.onLine,sync:user?'只读 · 等待安全保存权限':'未登录',conflicts:[],pending,readonlyReason:reason})}
  function begin(){
   if(!alive||lease)return;if(!user){readonly('请先登录后编辑和同步');return}
   readonly('正在取得安全保存权限');
   const locks:LocksLike|null=navigator.locks?{request:(name,options,callback)=>navigator.locks.request(name,options,callback)}:null;
   lease=new AccountSyncLease(locks,`suixing-account-writer-${user.id}`,()=>{
    const next=new TravelSyncEngine(user.id,storage);active=next;const unsubscribe=next.subscribe(()=>{if(alive)setSnapshot(next.getSnapshot())});setEngine(next);next.start(navigator.onLine);
    return()=>{unsubscribe();next.close();if(active===next)active=null;if(alive)setEngine(null)};
   },readonly);lease.attempt();
  }
  const network=()=>{if(active)active.setOnline(navigator.onLine);else lease?.attempt()},foreground=()=>{if(document.visibilityState==='visible'){if(active)void active.syncNow();else lease?.attempt()}};
  const pagehide=()=>{lease?.close();lease=null},pageshow=()=>begin();retry.current=()=>{if(active)void active.syncNow();else lease?.attempt()};begin();
  window.addEventListener('online',network);window.addEventListener('offline',network);window.addEventListener('pagehide',pagehide);window.addEventListener('pageshow',pageshow);document.addEventListener('visibilitychange',foreground);const timer=setInterval(foreground,20000);
  return()=>{alive=false;retry.current=()=>{};lease?.close();clearInterval(timer);window.removeEventListener('online',network);window.removeEventListener('offline',network);window.removeEventListener('pagehide',pagehide);window.removeEventListener('pageshow',pageshow);document.removeEventListener('visibilitychange',foreground)};
 },[user?.id]);
 return {...snapshot,mutate:engine?.mutate|| (async()=>false),syncNow:engine?.syncNow||(async()=>{retry.current()}),resolveConflict:engine?.resolveConflict||(()=>{})};
}
