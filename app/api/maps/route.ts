import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { gcj } from '../../../lib/travel';
export async function GET(request:Request){
 if(!await getChatGPTUser())return Response.json({error:'请先登录'},{status:401});
 const cfg=env as unknown as Record<string,string>,u=new URL(request.url),action=u.searchParams.get('action');
 if(action==='config')return Response.json({jsKey:cfg.AMAP_JS_KEY||'',ready:!!cfg.AMAP_WEB_KEY});
 if(!cfg.AMAP_WEB_KEY)return Response.json({error:'地点搜索和路线服务尚未连接，请在设置中查看接入说明。'},{status:503});
 try{
 const params=new URLSearchParams({key:cfg.AMAP_WEB_KEY,output:'JSON'});let path='';
 if(action==='search'){
  const q=u.searchParams.get('q')?.trim();if(!q||q.length>100)return Response.json({error:'请输入地名'},{status:400});
  params.set('keywords',q);params.set('offset','12');params.set('extensions','base');path='/v3/place/text';
 }else if(action==='route'){
  const mode=u.searchParams.get('mode')||'walking';if(!['walking','bicycling','driving','transit'].includes(mode))return Response.json({error:'交通方式无效'},{status:400});
  for(const key of ['origin','destination']){const pair=(u.searchParams.get(key)||'').split(',').map(Number);if(pair.length!==2||!pair.every(Number.isFinite)||Math.abs(pair[0])>180||Math.abs(pair[1])>85)return Response.json({error:'坐标无效'},{status:400});params.set(key,gcj(pair[0],pair[1]).map(v=>v.toFixed(6)).join(','));}
  path=mode==='bicycling'?'/v4/direction/bicycling':`/v3/direction/${mode==='transit'?'transit/integrated':mode}`;
  if(mode==='transit'){
   const cities=await Promise.all(['origin','destination'].map(async key=>{const r=await fetch('https://restapi.amap.com/v3/geocode/regeo?'+new URLSearchParams({key:cfg.AMAP_WEB_KEY,location:params.get(key)!}),{signal:AbortSignal.timeout(12000)});const j=await r.json() as any;return j.regeocode?.addressComponent?.adcode}));
   if(cities.some(c=>!c))throw Error('城市识别失败');params.set('city',cities[0]);params.set('cityd',cities[1]);params.set('extensions','all');
  }
 }else return Response.json({error:'请求无效'},{status:400});
 const response=await fetch('https://restapi.amap.com'+path+'?'+params,{signal:AbortSignal.timeout(20000)}),data=await response.json() as any;
 if(data.status!=='1'&&data.errcode!==0)throw Error('服务暂不可用');
 if(action==='search')return Response.json({places:(data.pois||[]).filter((p:any)=>typeof p.location==='string').map((p:any)=>{const [lng,lat]=gcj(...(p.location.split(',').map(Number) as [number,number]),true);return {name:p.name,lng,lat,address:[p.cityname,p.adname,typeof p.address==='string'?p.address:''].filter(Boolean).join(' · ')}})});
 const route=data.route||data.data,p=route?.paths?.[0]||route?.transits?.[0];if(!p)throw Error('无路线');
 const segments=p.steps||(p.segments||[]).flatMap((s:any)=>[...(s.walking?.steps||[]),...(s.bus?.buslines||[])]);
 const lines=segments.map((s:any)=>(s.polyline||'').split(';').filter(Boolean).map((v:string)=>gcj(...(v.split(',').map(Number) as [number,number]),true))).filter((v:any)=>v.length>1);
 return Response.json({distance:Number(p.distance||0),duration:Number(p.duration||0),lines,instructions:segments.map((s:any)=>s.instruction||s.name).filter(Boolean)});
 }catch{return Response.json({error:'未获取到结果，请检查地图服务配置、网络或交通方式后重试。'},{status:502})}
}
