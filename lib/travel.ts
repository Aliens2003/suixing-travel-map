import { z } from 'zod';
const id=z.string().min(1).max(100);
export const placeSchema=z.object({id,name:z.string().min(1).max(120),lng:z.number().min(-180).max(180),lat:z.number().min(-85).max(85),category:id,tags:z.string().max(500),note:z.string().max(5000),url:z.string().max(2000).refine(v=>!v||/^https?:\/\//i.test(v)),visited:z.boolean(),saved:z.boolean()});
const route=z.object({id,name:z.string().min(1).max(100),date:z.string().max(20),stops:z.array(id).max(100),modes:z.record(z.enum(['walking','bicycling','driving','transit'])),note:z.string().max(5000)});
export const stateSchema=z.object({categories:z.array(z.object({id,name:z.string().min(1).max(40),icon:z.string().max(8),color:z.string().regex(/^#[0-9a-f]{6}$/i)})).min(1).max(100),places:z.array(placeSchema).max(5000),trips:z.array(z.object({id,name:z.string().min(1).max(100),placeIds:z.array(id).max(1000),routes:z.array(route).max(100)})).max(200)}).superRefine((s,c)=>{
 const p=new Set(s.places.map(v=>v.id)),cats=new Set(s.categories.map(v=>v.id)),unique=(a:string[])=>new Set(a).size===a.length;
 if(!unique(s.places.map(v=>v.id))||!unique(s.categories.map(v=>v.id))||!unique(s.trips.map(v=>v.id))||s.places.some(v=>!cats.has(v.category))||s.trips.some(t=>!unique(t.placeIds)||t.placeIds.some(v=>!p.has(v))||!unique(t.routes.map(r=>r.id))||t.routes.some(r=>r.stops.some(v=>!t.placeIds.includes(v)))))c.addIssue({code:z.ZodIssueCode.custom,message:'地点关联无效'});
});
export type State=z.infer<typeof stateSchema>;
export type Place=State['places'][number];
export type Trip=State['trips'][number];
export type Route=Trip['routes'][number];
export const initial:State={categories:[{id:'sight',name:'景点',icon:'✦',color:'#d57d50'},{id:'stay',name:'住宿',icon:'⌂',color:'#698ac0'},{id:'food',name:'餐饮',icon:'♨',color:'#c69b45'},{id:'transport',name:'交通',icon:'↗',color:'#688e7d'},{id:'school',name:'学校',icon:'▥',color:'#9784ae'}],places:[],trips:[]};
export const modes={walking:'步行',bicycling:'骑行',driving:'驾车',transit:'公交 / 地铁'};
export const uid=()=>crypto.randomUUID();
export function gcj(lng:number,lat:number,inverse=false):[number,number]{
 if(lng<72.004||lng>137.8347||lat<0.8293||lat>55.8271)return [lng,lat];
 const x=lng-105,y=lat-35,pi=Math.PI;
 let a=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));
 a+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;a+=(20*Math.sin(y*pi)+40*Math.sin(y/3*pi))*2/3;a+=(160*Math.sin(y/12*pi)+320*Math.sin(y*pi/30))*2/3;
 let b=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));
 b+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;b+=(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3;b+=(150*Math.sin(x/12*pi)+300*Math.sin(x/30*pi))*2/3;
 const rad=lat/180*pi,magic=1-.00669342162296594323*Math.sin(rad)**2,root=Math.sqrt(magic);
 a=a*180/((6378245*(1-.00669342162296594323))/(magic*root)*pi);b=b*180/(6378245/root*Math.cos(rad)*pi);
 return [lng+(inverse?-b:b),lat+(inverse?-a:a)];
}
