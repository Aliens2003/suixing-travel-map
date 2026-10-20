'use client';
import { useEffect,useRef,useState } from 'react';
import { gcj, type Place,type State } from '../lib/travel';
declare global {interface Window{L:any;AMap:any;_AMapSecurityConfig:any}}
export type MapControl={focus:(lng:number,lat:number)=>void;zoom:(d:number)=>void;center:()=>[number,number]};
function script(src:string){return new Promise<void>((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=()=>resolve();s.onerror=reject;document.head.appendChild(s)})}
export default function MapView({places,categories,lines,onPick,onSelect,onReady,onNotice}:{places:Place[],categories:State['categories'],lines:number[][][],onPick:(lng:number,lat:number)=>void,onSelect:(id:string)=>void,onReady:(m:MapControl)=>void,onNotice:(s:string)=>void}){
 const el=useRef<HTMLDivElement>(null),map=useRef<any>(null),kind=useRef(''),layers=useRef<any[]>([]),callbacks=useRef({onPick,onSelect,onReady,onNotice}),[ready,setReady]=useState(false);callbacks.current={onPick,onSelect,onReady,onNotice};
 useEffect(()=>{let disposed=false;
 (async()=>{let cfg={jsKey:''};try{const r=await fetch('/api/maps?action=config');cfg=await r.json()}catch{}
 if(disposed)return;
 if(cfg.jsKey){
  window._AMapSecurityConfig={serviceHost:location.origin+'/_AMapService'};
  await script('https://webapi.amap.com/maps?v=2.0&key='+encodeURIComponent(cfg.jsKey));if(disposed)return;
  const a=window.AMap,m=new a.Map(el.current,{zoom:12,center:gcj(120.1551,30.2741),viewMode:'2D'});map.current=m;kind.current='amap';
  m.on('rightclick',(e:any)=>{const p=gcj(e.lnglat.lng,e.lnglat.lat,true);callbacks.current.onPick(...p)});
  callbacks.current.onReady({focus:(lng,lat)=>m.setZoomAndCenter(15,gcj(lng,lat)),zoom:d=>m.setZoom(m.getZoom()+d),center:()=>{const p=m.getCenter();return gcj(p.lng,p.lat,true)}});
 }else{
  const css=document.createElement('link');css.rel='stylesheet';css.href='/vendor/leaflet.css';document.head.appendChild(css);
  if(!window.L)await script('/vendor/leaflet.js');if(disposed)return;
  const L=window.L,m=L.map(el.current,{zoomControl:false,attributionControl:true}).setView([30.2741,120.1551],12);map.current=m;kind.current='leaflet';
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(m).on('tileerror',()=>callbacks.current.onNotice('底图暂时加载失败，已保存的地点仍可在列表查看。'));
  m.on('contextmenu',(e:any)=>callbacks.current.onPick(e.latlng.lng,e.latlng.lat));
  callbacks.current.onReady({focus:(lng,lat)=>m.setView([lat,lng],15),zoom:d=>m.setZoom(m.getZoom()+d),center:()=>{const p=m.getCenter();return [p.lng,p.lat]}});
 }
 // Explicit pointer long press works on iOS; movement cancels selection.
 let timer:ReturnType<typeof setTimeout>|undefined,start:[number,number]|null=null;
 const down=(e:PointerEvent)=>{if(e.button!==0||(e.target as HTMLElement).closest('.leaflet-marker-icon,.amap-marker'))return;start=[e.clientX,e.clientY];clearTimeout(timer);timer=setTimeout(()=>{if(!start)return;const rect=el.current!.getBoundingClientRect();if(kind.current==='leaflet'){const p=map.current.containerPointToLatLng([start[0]-rect.left,start[1]-rect.top]);callbacks.current.onPick(p.lng,p.lat)}else{const p=map.current.containerToLngLat(new window.AMap.Pixel(start[0]-rect.left,start[1]-rect.top));callbacks.current.onPick(...gcj(p.lng,p.lat,true))}start=null},650)};
 const move=(e:PointerEvent)=>{if(start&&Math.hypot(e.clientX-start[0],e.clientY-start[1])>8){clearTimeout(timer);start=null}};
 const cancel=()=>{clearTimeout(timer);start=null};const node=el.current!;node.addEventListener('pointerdown',down);node.addEventListener('pointermove',move);node.addEventListener('pointerup',cancel);node.addEventListener('pointercancel',cancel);
 map.current._cleanup=()=>{cancel();node.removeEventListener('pointerdown',down);node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',cancel);node.removeEventListener('pointercancel',cancel)};
 setReady(true);
 })().catch(()=>callbacks.current.onNotice('地图加载失败。请检查网络，或使用地点列表继续查看。'));
 return()=>{disposed=true;map.current?._cleanup?.();map.current?.remove?.();map.current?.destroy?.()};
 },[]);
 useEffect(()=>{if(!ready)return;const m=map.current;
 layers.current.forEach(l=>kind.current==='leaflet'?l.remove():m.remove(l));layers.current=[];
 const add=(l:any)=>{kind.current==='leaflet'?l.addTo(m):m.add(l);layers.current.push(l)};
 places.forEach(p=>{const c=categories.find(c=>c.id===p.category)||categories[0],content=document.createElement('button');content.className='map-marker';content.style.background=c.color;content.textContent=c.icon;content.title=p.name;content.setAttribute('aria-label',p.name);
 let marker;if(kind.current==='leaflet'){marker=window.L.marker([p.lat,p.lng],{icon:window.L.divIcon({html:content,iconSize:[36,42],iconAnchor:[18,42],className:'marker-wrap'})});marker.on('click',()=>callbacks.current.onSelect(p.id))}else{marker=new window.AMap.Marker({position:gcj(p.lng,p.lat),content,anchor:'bottom-center'});marker.on('click',()=>callbacks.current.onSelect(p.id))}add(marker)});
 lines.forEach(line=>{if(line.length<2)return;add(kind.current==='leaflet'?window.L.polyline(line.map(p=>[p[1],p[0]]),{color:'#337c65',weight:5,opacity:.8}):new window.AMap.Polyline({path:line.map(p=>gcj(p[0],p[1])),strokeColor:'#337c65',strokeWeight:5}))});
 },[places,categories,lines,ready]);
 return <div className="map" ref={el} aria-label="互动地图"/>;
}

