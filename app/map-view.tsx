'use client';
import {useEffect,useRef,useState} from 'react';
import {api,asset} from '../lib/api';
import {type Place,type State} from '../lib/travel';
import {visibleLabels} from '../lib/map-labels';
import type {LocationFix} from '../lib/device-location';
declare global {interface Window{L:any}}
export type MapControl={focus:(lng:number,lat:number)=>void;zoom:(d:number)=>void;center:()=>[number,number];fit:(places:Place[])=>void};
function script(src:string){return new Promise<void>((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=()=>resolve();s.onerror=reject;document.head.appendChild(s)})}
export default function MapView({places,categories,lines,allowPick,selectedId,position,heading,searchPin,onPick,onSelect,onReady,onNotice,onInteract,layout='map'}:{places:Place[],categories:State['categories'],lines:number[][][],allowPick:boolean,selectedId:string,position:LocationFix|null,heading:number|null,searchPin:{name:string,lng:number,lat:number}|null,onPick:(lng:number,lat:number)=>void,onSelect:(id:string)=>void,onReady:(m:MapControl)=>void,onNotice:(s:string)=>void,onInteract:()=>void,layout?:'map'|'sheet'|'workspace'}){
 const el=useRef<HTMLDivElement>(null),map=useRef<any>(null),layers=useRef<any[]>([]),callbacks=useRef({onPick,onSelect,onReady,onNotice,allowPick,onInteract,layout}),[ready,setReady]=useState(false),userMarker=useRef<any>(null),userArrow=useRef<HTMLElement|null>(null);
 callbacks.current={onPick,onSelect,onReady,onNotice,allowPick,onInteract,layout};
 useEffect(()=>{let disposed=false;let cleanup=()=>{};
 (async()=>{
  if(disposed)return;
  let view={lng:0,lat:24,zoom:3};
  try{const v=JSON.parse(localStorage.getItem('suixing-international-map-view')||'null');if(v&&Number.isFinite(v.lng)&&Math.abs(v.lng)<=180&&Number.isFinite(v.lat)&&Math.abs(v.lat)<=85&&Number.isFinite(v.zoom)&&v.zoom>=3&&v.zoom<=19)view=v}catch{}
  let m:any,center:()=>[number,number],focus:(lng:number,lat:number)=>void,fit:(ps:Place[])=>void;
  const padding=()=>{const small=window.innerWidth<=650,view=callbacks.current.layout,top=view==='workspace'?110:145,bottom=view==='sheet'||(view==='workspace'&&small)?Math.min(innerHeight*.5+110,innerHeight-top-100):155;return [top,small?55:80,Math.max(100,bottom),view==='workspace'&&!small?450:45]};
   const css=document.createElement('link');css.rel='stylesheet';css.href=asset('vendor/leaflet.css');document.head.appendChild(css);
   if(!window.L)await script(asset('vendor/leaflet.js'));if(disposed)return;
   const L=window.L;m=L.map(el.current,{zoomControl:false,attributionControl:true}).setView([view.lat,view.lng],view.zoom);
   const Tiles=L.GridLayer.extend({
    createTile(coords:any,done:any){
     const img=document.createElement('img');img.alt='';
     api('/api/tile/'+coords.z+'/'+coords.x+'/'+coords.y,{signal:AbortSignal.timeout?.(15000)}).then(r=>{if(!r.ok)throw Error();return r.blob()}).then(blob=>{
      const object=URL.createObjectURL(blob);
      img.onload=()=>{URL.revokeObjectURL(object);done(null,img)};
      img.onerror=()=>{URL.revokeObjectURL(object);done(Error(),img)};
      img.src=object;
     }).catch(()=>done(Error(),img));return img;
    }
   });
   new Tiles({maxZoom:19,attribution:'<a href="https://www.geoapify.com/">Geoapify</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(m).on('tileerror',()=>callbacks.current.onNotice('底图暂不可用，已保存的地点仍可在列表查看。'));
   center=()=>{const p=m.getCenter();return [((p.lng+180)%360+360)%360-180,p.lat]};focus=(lng,lat)=>m.setView([lat,lng],15);
   fit=ps=>{if(!ps.length)return;const p=padding();m.fitBounds(ps.map(v=>[v.lat,v.lng]),{paddingTopLeft:[p[3],p[0]],paddingBottomRight:[p[1],p[2]],maxZoom:15})};
   m.on('contextmenu',(e:any)=>{if(callbacks.current.allowPick)callbacks.current.onPick(((e.latlng.lng+180)%360+360)%360-180,e.latlng.lat)});
  map.current=m;
  const remember=()=>{try{const [lng,lat]=center();localStorage.setItem('suixing-international-map-view',JSON.stringify({lng,lat,zoom:m.getZoom()}))}catch{}};
  m.on('moveend',remember);m.on('zoomend',remember);
  let timer:ReturnType<typeof setTimeout>|undefined,start:[number,number]|null=null;
  const cancel=()=>{clearTimeout(timer);start=null};
  const down=(e:PointerEvent)=>{callbacks.current.onInteract();if(!callbacks.current.allowPick||e.button!==0||(e.target as HTMLElement).closest('.leaflet-marker-icon,.amap-marker'))return;start=[e.clientX,e.clientY];clearTimeout(timer);timer=setTimeout(()=>{if(!start||!callbacks.current.allowPick)return;const rect=el.current!.getBoundingClientRect();const p=m.containerPointToLatLng([start[0]-rect.left,start[1]-rect.top]);callbacks.current.onPick(((p.lng+180)%360+360)%360-180,p.lat);cancel()},650)};
  const move=(e:PointerEvent)=>{if(start&&Math.hypot(e.clientX-start[0],e.clientY-start[1])>8)cancel()};
  const wheel=()=>callbacks.current.onInteract();const node=el.current!;node.addEventListener('wheel',wheel,{passive:true});node.addEventListener('pointerdown',down);node.addEventListener('pointermove',move);node.addEventListener('pointerup',cancel);node.addEventListener('pointercancel',cancel);
  cleanup=()=>{cancel();node.removeEventListener('wheel',wheel);node.removeEventListener('pointerdown',down);node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',cancel);node.removeEventListener('pointercancel',cancel);m.off('moveend',remember);m.off('zoomend',remember)};
  setReady(true);callbacks.current.onReady({focus,center,fit,zoom:d=>m.setZoom(m.getZoom()+d)});
 })().catch(()=>callbacks.current.onNotice('地图加载失败。请检查网络，或使用地点列表继续查看。'));
 return()=>{disposed=true;cleanup();const current=map.current;map.current=null;userMarker.current=null;current?.remove()};
 },[]);
 useEffect(()=>{
  if(!ready||!map.current)return;const m=map.current;
  layers.current.forEach(l=>l.remove());layers.current=[];
  const add=(l:any)=>{l.addTo(m);layers.current.push(l)};
  const labels:{p:Place,label:HTMLSpanElement,width:number}[]=[];
  places.forEach(p=>{
   const c=categories.find(c=>c.id===p.category)||categories[0],content=document.createElement('button'),icon=document.createElement('span'),label=document.createElement('span');
   content.className='map-marker'+(p.id===selectedId?' selected':'');content.title=p.name;content.setAttribute('aria-label',p.name);
   icon.className='marker-icon';icon.style.background=c.color;icon.textContent=c.icon;label.className='marker-label';label.textContent=p.name;content.appendChild(icon);content.appendChild(label);
   let marker:any;
   marker=window.L.marker([p.lat,p.lng],{icon:window.L.divIcon({html:content,iconSize:[26,26],iconAnchor:[13,13],className:'marker-wrap'}),zIndexOffset:p.id===selectedId?1000:0});marker.on('click',()=>callbacks.current.onSelect(p.id));
   add(marker);labels.push({p,label,width:Math.min(128,Math.max(35,label.getBoundingClientRect().width||p.name.length*12+12))});
  });
  const layout=()=>{
   const rect=el.current!.getBoundingClientRect(),items=labels.map(({p,width})=>{const xy=m.latLngToContainerPoint([p.lat,p.lng]);return {id:p.id,x:xy.x,y:xy.y,width}});
   const shown=visibleLabels(items,selectedId,rect.width,rect.height);labels.forEach(({p,label})=>label.classList.toggle('label-hidden',!shown.has(p.id)));
  };
  lines.forEach(line=>{if(line.length<2)return;add(window.L.polyline(line.map(p=>[p[1],p[0]]),{color:'#337c65',weight:5,opacity:.8}))});
  layout();m.on('moveend',layout);m.on('zoomend',layout);m.on('resize',layout);
  return()=>{if(map.current===m){m.off('moveend',layout);m.off('zoomend',layout);m.off('resize',layout)}};
 },[places,categories,lines,ready,selectedId]);
 useEffect(()=>{
  if(!ready||!map.current)return;const m=map.current;
  if(!position){if(userMarker.current){userMarker.current.remove();userMarker.current=null}return}
  if(!userMarker.current){
   const node=document.createElement('div'),arrow=document.createElement('span'),dot=document.createElement('span');node.className='user-location';node.setAttribute('role','img');node.setAttribute('aria-label','我的当前位置');node.title='我的当前位置';arrow.className='user-heading';dot.className='user-dot';node.appendChild(arrow);node.appendChild(dot);userArrow.current=arrow;
   userMarker.current=window.L.marker([position.lat,position.lng],{interactive:false,zIndexOffset:2000,icon:window.L.divIcon({html:node,iconSize:[24,24],iconAnchor:[12,12],className:'marker-wrap user-marker'})}).addTo(m);
  }
  userMarker.current.setLatLng([position.lat,position.lng]);
  const arrow=userArrow.current!;arrow.hidden=heading===null;if(heading!==null)arrow.style.transform=`rotate(${heading}deg)`;
 },[ready,position,heading]);
 useEffect(()=>{
  if(!ready||!map.current||!searchPin)return;const m=map.current,node=document.createElement('div'),icon=document.createElement('span'),label=document.createElement('span');node.className='search-pin';node.setAttribute('role','img');node.setAttribute('aria-label','搜索目的地：'+searchPin.name);icon.className='search-pin-icon';icon.textContent='●';label.className='marker-label';label.textContent=searchPin.name;node.appendChild(icon);node.appendChild(label);
  const marker=window.L.marker([searchPin.lat,searchPin.lng],{interactive:false,zIndexOffset:1500,icon:window.L.divIcon({html:node,iconSize:[30,36],iconAnchor:[15,30],className:'marker-wrap'})}).addTo(m);
  return()=>{if(map.current===m)marker.remove()};
 },[ready,searchPin]);
 return <div className="map" ref={el} aria-label="互动地图"/>;
}
