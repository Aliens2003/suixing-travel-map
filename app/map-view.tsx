'use client';
import {useEffect,useRef,useState} from 'react';
import {gcj,type Place,type State} from '../lib/travel';
import {visibleLabels} from '../lib/map-labels';
import type {LocationFix} from '../lib/device-location';
declare global {interface Window{L:any;AMap:any;_AMapSecurityConfig:any}}
export type MapControl={focus:(lng:number,lat:number)=>void;zoom:(d:number)=>void;center:()=>[number,number];fit:(places:Place[])=>void};
function script(src:string){return new Promise<void>((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=()=>resolve();s.onerror=reject;document.head.appendChild(s)})}
export default function MapView({places,categories,lines,allowPick,selectedId,position,heading,searchPin,onPick,onSelect,onReady,onNotice,onInteract,layout='map'}:{places:Place[],categories:State['categories'],lines:number[][][],allowPick:boolean,selectedId:string,position:LocationFix|null,heading:number|null,searchPin:{name:string,lng:number,lat:number}|null,onPick:(lng:number,lat:number)=>void,onSelect:(id:string)=>void,onReady:(m:MapControl)=>void,onNotice:(s:string)=>void,onInteract:()=>void,layout?:'map'|'sheet'|'workspace'}){
 const el=useRef<HTMLDivElement>(null),map=useRef<any>(null),kind=useRef(''),layers=useRef<any[]>([]),callbacks=useRef({onPick,onSelect,onReady,onNotice,allowPick,onInteract,layout}),[ready,setReady]=useState(false),userMarker=useRef<any>(null),userArrow=useRef<HTMLElement|null>(null);
 callbacks.current={onPick,onSelect,onReady,onNotice,allowPick,onInteract,layout};
 useEffect(()=>{let disposed=false;let cleanup=()=>{};
 (async()=>{
  let cfg={jsKey:''};try{cfg=await fetch('/api/maps?action=config').then(r=>r.json())}catch{}
  if(disposed)return;
  let view={lng:120.1551,lat:30.2741,zoom:12};
  try{const v=JSON.parse(localStorage.getItem('suixing-map-view')||'null');if(v&&Number.isFinite(v.lng)&&Math.abs(v.lng)<=180&&Number.isFinite(v.lat)&&Math.abs(v.lat)<=85&&Number.isFinite(v.zoom)&&v.zoom>=3&&v.zoom<=19)view=v}catch{}
  let m:any,center:()=>[number,number],focus:(lng:number,lat:number)=>void,fit:(ps:Place[])=>void;
  const padding=()=>{const small=window.innerWidth<=650,view=callbacks.current.layout,top=view==='workspace'?110:145,bottom=view==='sheet'||(view==='workspace'&&small)?Math.min(innerHeight*.5+110,innerHeight-top-100):155;return [top,small?55:80,Math.max(100,bottom),view==='workspace'&&!small?450:45]};
  if(cfg.jsKey){
   window._AMapSecurityConfig={serviceHost:location.origin+'/_AMapService'};
   if(!window.AMap)await script('https://webapi.amap.com/maps?v=2.0&key='+encodeURIComponent(cfg.jsKey));if(disposed)return;
   const a=window.AMap;m=new a.Map(el.current,{zoom:view.zoom,center:gcj(view.lng,view.lat),viewMode:'2D',rotateEnable:false,pitchEnable:false});kind.current='amap';
   center=()=>{const p=m.getCenter();return gcj(p.lng,p.lat,true)};
   focus=(lng,lat)=>m.setZoomAndCenter(15,gcj(lng,lat));
   fit=ps=>{if(!ps.length)return;const coords=ps.map(p=>gcj(p.lng,p.lat)),xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);const bounds=new a.Bounds([Math.min(...xs)-.0003,Math.min(...ys)-.0003],[Math.max(...xs)+.0003,Math.max(...ys)+.0003]),p=padding();m.setBounds(bounds,false,[p[0],p[2],p[3],p[1]])};
   m.on('rightclick',(e:any)=>{if(callbacks.current.allowPick)callbacks.current.onPick(...gcj(e.lnglat.lng,e.lnglat.lat,true))});
  }else{
   const css=document.createElement('link');css.rel='stylesheet';css.href='/vendor/leaflet.css';document.head.appendChild(css);
   if(!window.L)await script('/vendor/leaflet.js');if(disposed)return;
   const L=window.L;m=L.map(el.current,{zoomControl:false,attributionControl:true}).setView([view.lat,view.lng],view.zoom);kind.current='leaflet';
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(m).on('tileerror',()=>callbacks.current.onNotice('底图暂时加载失败，已保存的地点仍可在列表查看。'));
   center=()=>{const p=m.getCenter();return [p.lng,p.lat]};focus=(lng,lat)=>m.setView([lat,lng],15);
   fit=ps=>{if(!ps.length)return;const p=padding();m.fitBounds(ps.map(v=>[v.lat,v.lng]),{paddingTopLeft:[p[3],p[0]],paddingBottomRight:[p[1],p[2]],maxZoom:15})};
   m.on('contextmenu',(e:any)=>{if(callbacks.current.allowPick)callbacks.current.onPick(e.latlng.lng,e.latlng.lat)});
  }
  map.current=m;
  const remember=()=>{try{const [lng,lat]=center();localStorage.setItem('suixing-map-view',JSON.stringify({lng,lat,zoom:m.getZoom()}))}catch{}};
  m.on('moveend',remember);m.on('zoomend',remember);
  let timer:ReturnType<typeof setTimeout>|undefined,start:[number,number]|null=null;
  const cancel=()=>{clearTimeout(timer);start=null};
  const down=(e:PointerEvent)=>{callbacks.current.onInteract();if(!callbacks.current.allowPick||e.button!==0||(e.target as HTMLElement).closest('.leaflet-marker-icon,.amap-marker'))return;start=[e.clientX,e.clientY];clearTimeout(timer);timer=setTimeout(()=>{if(!start||!callbacks.current.allowPick)return;const rect=el.current!.getBoundingClientRect();if(kind.current==='leaflet'){const p=m.containerPointToLatLng([start[0]-rect.left,start[1]-rect.top]);callbacks.current.onPick(p.lng,p.lat)}else{const p=m.containerToLngLat(new window.AMap.Pixel(start[0]-rect.left,start[1]-rect.top));callbacks.current.onPick(...gcj(p.lng,p.lat,true))}cancel()},650)};
  const move=(e:PointerEvent)=>{if(start&&Math.hypot(e.clientX-start[0],e.clientY-start[1])>8)cancel()};
  const wheel=()=>callbacks.current.onInteract();const node=el.current!;node.addEventListener('wheel',wheel,{passive:true});node.addEventListener('pointerdown',down);node.addEventListener('pointermove',move);node.addEventListener('pointerup',cancel);node.addEventListener('pointercancel',cancel);
  cleanup=()=>{cancel();node.removeEventListener('wheel',wheel);node.removeEventListener('pointerdown',down);node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',cancel);node.removeEventListener('pointercancel',cancel);m.off('moveend',remember);m.off('zoomend',remember)};
  setReady(true);callbacks.current.onReady({focus,center,fit,zoom:d=>m.setZoom(m.getZoom()+d)});
 })().catch(()=>callbacks.current.onNotice('地图加载失败。请检查网络，或使用地点列表继续查看。'));
 return()=>{disposed=true;cleanup();const current=map.current;map.current=null;userMarker.current=null;if(kind.current==='leaflet')current?.remove();else current?.destroy()};
 },[]);
 useEffect(()=>{
  if(!ready||!map.current)return;const m=map.current;
  layers.current.forEach(l=>kind.current==='leaflet'?l.remove():m.remove(l));layers.current=[];
  const add=(l:any)=>{kind.current==='leaflet'?l.addTo(m):m.add(l);layers.current.push(l)};
  const labels:{p:Place,label:HTMLSpanElement,width:number}[]=[];
  places.forEach(p=>{
   const c=categories.find(c=>c.id===p.category)||categories[0],content=document.createElement('button'),icon=document.createElement('span'),label=document.createElement('span');
   content.className='map-marker'+(p.id===selectedId?' selected':'');content.title=p.name;content.setAttribute('aria-label',p.name);
   icon.className='marker-icon';icon.style.background=c.color;icon.textContent=c.icon;label.className='marker-label';label.textContent=p.name;content.appendChild(icon);content.appendChild(label);
   let marker:any;
   if(kind.current==='leaflet'){marker=window.L.marker([p.lat,p.lng],{icon:window.L.divIcon({html:content,iconSize:[26,26],iconAnchor:[13,13],className:'marker-wrap'}),zIndexOffset:p.id===selectedId?1000:0});marker.on('click',()=>callbacks.current.onSelect(p.id))}
   else{marker=new window.AMap.Marker({position:gcj(p.lng,p.lat),content,offset:new window.AMap.Pixel(-13,-13),zIndex:p.id===selectedId?200:100});marker.on('click',()=>callbacks.current.onSelect(p.id))}
   add(marker);labels.push({p,label,width:Math.min(128,Math.max(35,label.getBoundingClientRect().width||p.name.length*12+12))});
  });
  const layout=()=>{
   const rect=el.current!.getBoundingClientRect(),items=labels.map(({p,width})=>{const xy=kind.current==='leaflet'?m.latLngToContainerPoint([p.lat,p.lng]):m.lngLatToContainer(gcj(p.lng,p.lat));return {id:p.id,x:xy.x,y:xy.y,width}});
   const shown=visibleLabels(items,selectedId,rect.width,rect.height);labels.forEach(({p,label})=>label.classList.toggle('label-hidden',!shown.has(p.id)));
  };
  lines.forEach(line=>{if(line.length<2)return;add(kind.current==='leaflet'?window.L.polyline(line.map(p=>[p[1],p[0]]),{color:'#337c65',weight:5,opacity:.8}):new window.AMap.Polyline({path:line.map(p=>gcj(p[0],p[1])),strokeColor:'#337c65',strokeWeight:5}))});
  layout();m.on('moveend',layout);m.on('zoomend',layout);m.on('resize',layout);
  return()=>{if(map.current===m){m.off('moveend',layout);m.off('zoomend',layout);m.off('resize',layout)}};
 },[places,categories,lines,ready,selectedId]);
 useEffect(()=>{
  if(!ready||!map.current)return;const m=map.current;
  if(!position){if(userMarker.current){kind.current==='leaflet'?userMarker.current.remove():m.remove(userMarker.current);userMarker.current=null}return}
  if(!userMarker.current){
   const node=document.createElement('div'),arrow=document.createElement('span'),dot=document.createElement('span');node.className='user-location';node.setAttribute('role','img');node.setAttribute('aria-label','我的当前位置');node.title='我的当前位置';arrow.className='user-heading';dot.className='user-dot';node.appendChild(arrow);node.appendChild(dot);userArrow.current=arrow;
   if(kind.current==='leaflet'){userMarker.current=window.L.marker([position.lat,position.lng],{interactive:false,zIndexOffset:2000,icon:window.L.divIcon({html:node,iconSize:[24,24],iconAnchor:[12,12],className:'marker-wrap user-marker'})}).addTo(m)}
   else{userMarker.current=new window.AMap.Marker({position:gcj(position.lng,position.lat),content:node,offset:new window.AMap.Pixel(-12,-12),zIndex:300,bubble:true});m.add(userMarker.current)}
  }
  if(kind.current==='leaflet')userMarker.current.setLatLng([position.lat,position.lng]);else userMarker.current.setPosition(gcj(position.lng,position.lat));
  const arrow=userArrow.current!;arrow.hidden=heading===null;if(heading!==null)arrow.style.transform=`rotate(${heading}deg)`;
 },[ready,position,heading]);
 useEffect(()=>{
  if(!ready||!map.current||!searchPin)return;const m=map.current,node=document.createElement('div'),icon=document.createElement('span'),label=document.createElement('span');node.className='search-pin';node.setAttribute('role','img');node.setAttribute('aria-label','搜索目的地：'+searchPin.name);icon.className='search-pin-icon';icon.textContent='●';label.className='marker-label';label.textContent=searchPin.name;node.appendChild(icon);node.appendChild(label);
  const marker=kind.current==='leaflet'?window.L.marker([searchPin.lat,searchPin.lng],{interactive:false,zIndexOffset:1500,icon:window.L.divIcon({html:node,iconSize:[30,36],iconAnchor:[15,30],className:'marker-wrap'})}).addTo(m):new window.AMap.Marker({position:gcj(searchPin.lng,searchPin.lat),content:node,offset:new window.AMap.Pixel(-15,-30),zIndex:250,bubble:true});
  if(kind.current==='amap')m.add(marker);return()=>{if(map.current===m){if(kind.current==='leaflet')marker.remove();else m.remove(marker)}};
 },[ready,searchPin]);
 return <div className="map" ref={el} aria-label="互动地图"/>;
}
