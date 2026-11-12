'use client';
import {useEffect,useRef,useState} from 'react';
import {LocationTracker,compassHeading,type LocationFix,type HeadingEvent} from '../lib/device-location';
type OrientationConstructor=typeof DeviceOrientationEvent&{requestPermission?:(absolute?:boolean)=>Promise<string>};
export function useDeviceLocation(enabled:boolean,onFirstFix:(fix:LocationFix)=>void,onNotice:(message:string)=>void){
 const [position,setPosition]=useState<LocationFix|null>(null),[heading,setHeading]=useState<number|null>(null),[direction,setDirection]=useState('未启用朝向');
 const tracker=useRef<LocationTracker|null>(null),callbacks=useRef({onFirstFix,onNotice}),first=useRef(false),attempted=useRef(false),granted=useRef(false),detach=useRef(()=>{}),lastError=useRef('');
 callbacks.current={onFirstFix,onNotice};
 function attach(){
  detach.current();let timer:ReturnType<typeof setTimeout>|undefined;
  const receive=(event:Event)=>{const e=event as unknown as HeadingEvent;if(!e.absolute&&e.webkitCompassHeading===undefined)return;const value=compassHeading(e);clearTimeout(timer);setHeading(previous=>previous!==null&&value!==null&&Math.min(Math.abs(previous-value),360-Math.abs(previous-value))<2?previous:value);if(value!==null){setDirection('朝向已启用');timer=setTimeout(()=>{setHeading(null);setDirection('等待可靠的朝向数据')},15000)}};
  window.addEventListener('deviceorientation',receive);window.addEventListener('deviceorientationabsolute',receive);
  detach.current=()=>{clearTimeout(timer);window.removeEventListener('deviceorientation',receive);window.removeEventListener('deviceorientationabsolute',receive);setHeading(null)};
 }
 useEffect(()=>{
  if(!enabled)return;
  const current=new LocationTracker(navigator.geolocation,fix=>{setPosition(fix);lastError.current='';if(!first.current){first.current=true;callbacks.current.onFirstFix(fix)}},message=>{setPosition(null);if(lastError.current!==message){lastError.current=message;callbacks.current.onNotice(message)}});tracker.current=current;
  const ctor=window.DeviceOrientationEvent as OrientationConstructor|undefined;
  if(ctor&&!ctor.requestPermission){granted.current=true;if(!document.hidden)attach()}else if(!ctor)setDirection('此设备不支持朝向');
  const visibility=()=>{current.setVisible(!document.hidden);if(document.hidden)detach.current();else if(granted.current)attach()};
  visibility();document.addEventListener('visibilitychange',visibility);
  return()=>{current.stop();tracker.current=null;detach.current();document.removeEventListener('visibilitychange',visibility)};
 },[enabled]);
 function requestDirection(){
  const ctor=window.DeviceOrientationEvent as OrientationConstructor|undefined;
  if(!ctor){setDirection('此设备不支持朝向');return}
  if(granted.current){if(!document.hidden)attach();return}
  if(attempted.current)return;attempted.current=true;
  // Call synchronously from the Locate button, while the user gesture is active.
  try{const permission=ctor.requestPermission?.(true);if(!permission)return;
   void permission.then(result=>{if(result==='granted'){granted.current=true;if(tracker.current&&!document.hidden)attach();setDirection('等待可靠的朝向数据')}else{setHeading(null);setDirection('朝向未授权')}}).catch(()=>{setHeading(null);setDirection('朝向不可用')});
  }catch{setHeading(null);setDirection('朝向不可用')}
 }
 function locate(){requestDirection();return tracker.current?.locate()??Promise.reject(Error('地图正在初始化，请稍后重试'))}
 return {position,heading,direction,locate};
}
