export type LocationFix={lng:number,lat:number,accuracy:number,timestamp:number};
export type HeadingEvent={webkitCompassHeading?:number,webkitCompassAccuracy?:number,absolute?:boolean,alpha:number|null,beta?:number|null};
export function compassHeading(e:HeadingEvent):number|null{
 if(Number.isFinite(e.webkitCompassHeading)){
  if(e.webkitCompassHeading!<0||e.webkitCompassHeading!>=360)return null;
  if(e.webkitCompassAccuracy!==undefined&&(!Number.isFinite(e.webkitCompassAccuracy)||e.webkitCompassAccuracy<0||e.webkitCompassAccuracy>50))return null;
  return e.webkitCompassHeading!;
 }
 // Relative alpha and GPS course do not describe a north-referenced phone heading.
 if(!e.absolute||e.alpha===null||!Number.isFinite(e.alpha))return null;
 const tilt=Math.cos((e.beta??0)*Math.PI/180);
 if(Math.abs(tilt)<.15)return null; // The phone's top edge points almost vertically.
 return ((360-e.alpha+(tilt<0?180:0))%360+360)%360;
}
type Geo=Pick<Geolocation,'watchPosition'|'clearWatch'|'getCurrentPosition'>;
export class LocationTracker{
 private watch:number|null=null;
 private generation=0;
 private denied=false;
 private visible=true;
 private stopped=false;
 private geo:Geo|undefined;
 private onFix:(fix:LocationFix)=>void;
 private onError:(message:string)=>void;
 constructor(geo:Geo|undefined,onFix:(fix:LocationFix)=>void,onError:(message:string)=>void){this.geo=geo;this.onFix=onFix;this.onError=onError}
 private accept=(p:GeolocationPosition)=>{
  const {longitude:lng,latitude:lat,accuracy}=p.coords;
  if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>85||!Number.isFinite(accuracy)||accuracy<0)return;
  const fix={lng,lat,accuracy,timestamp:p.timestamp};this.onFix(fix);return fix;
 };
 start(){
  if(this.stopped||!this.visible||this.denied||this.watch!==null)return;
  if(!this.geo){this.onError('浏览器不支持定位，可继续搜索地点');return}
  const generation=++this.generation;
  try{const watch=this.geo.watchPosition(p=>{if(this.visible&&generation===this.generation&&!this.stopped)this.accept(p)},e=>{
   if(generation!==this.generation||this.stopped)return;
   if(e.code===1){this.denied=true;this.pause()}
   this.onError('未获取到位置，可点击定位重试，或手动搜索地点');
  },{enableHighAccuracy:true,timeout:15000,maximumAge:5000});
  if(generation===this.generation&&!this.stopped&&this.visible)this.watch=watch;else this.geo.clearWatch(watch);
  }catch{this.onError('定位暂不可用，可继续搜索地点')}
 }
 private pause(){++this.generation;if(this.watch!==null)this.geo?.clearWatch(this.watch);this.watch=null}
 setVisible(visible:boolean){this.visible=visible;if(visible)this.start();else this.pause()}
 locate():Promise<LocationFix>{
  if(this.stopped||!this.visible)return Promise.reject(Error('定位请求已取消'));
  if(!this.geo)return Promise.reject(Error('浏览器不支持定位'));
  this.denied=false;
  const generation=this.generation;
  return new Promise((resolve,reject)=>this.geo!.getCurrentPosition(p=>{
   if(this.stopped||!this.visible||generation!==this.generation){reject(Error('定位请求已取消'));return}
   const fix=this.accept(p);if(!fix){reject(Error('定位数据无效'));return}this.start();resolve(fix);
  },e=>{if(e.code===1){this.denied=true;this.pause()}reject(Error('未获取到位置，请检查浏览器定位权限'))},{enableHighAccuracy:true,timeout:12000,maximumAge:0}));
 }
 stop(){this.stopped=true;this.pause()}
}
