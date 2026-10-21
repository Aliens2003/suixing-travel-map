'use client';
import {useEffect,useRef,useState} from 'react';

export function usePwa(enabled:boolean) {
  const [ready,setReady]=useState(false),[waiting,setWaiting]=useState(false),[installed,setInstalled]=useState(false),[error,setError]=useState('');
  const registration=useRef<ServiceWorkerRegistration|null>(null),refreshing=useRef(false);
  useEffect(()=>{
    if(!enabled||!('serviceWorker' in navigator))return;
    let active=true;const media=matchMedia('(display-mode: standalone)');
    const detect=()=>{if(active)setInstalled(media.matches||!!(navigator as Navigator&{standalone?:boolean}).standalone)};
    detect();media.addEventListener('change',detect);
    const controller=()=>{if(refreshing.current)location.reload();else if(active)setReady(!!navigator.serviceWorker.controller)};
    navigator.serviceWorker.addEventListener('controllerchange',controller);
    const track=(r:ServiceWorkerRegistration)=>{if(!active)return;registration.current=r;setWaiting(!!r.waiting);setReady(!!r.active);const worker=r.installing;if(worker)worker.addEventListener('statechange',()=>{if(active){setWaiting(!!r.waiting);if(worker.state==='activated'){setReady(true);setError('')}if(worker.state==='redundant')setError('新版本离线应用未保存完整，请联网重新打开后重试。')}})};
    navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(r=>{track(r);r.addEventListener('updatefound',()=>track(r));void navigator.storage?.persist?.().catch(()=>false)}).catch(()=>{if(active)setError('离线应用未保存完整，请联网重新打开后重试。')});
    return()=>{active=false;media.removeEventListener('change',detect);navigator.serviceWorker.removeEventListener('controllerchange',controller)};
  },[enabled]);
  function update(){const worker=registration.current?.waiting;if(worker){refreshing.current=true;worker.postMessage({type:'SKIP_WAITING'})}}
  return {ready,waiting,installed,error,update};
}
