import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
export async function GET(request:Request){
 if(!await getChatGPTUser())return new Response('Unauthorized',{status:401});
 const cfg=env as unknown as Record<string,string>;
 if(!cfg.AMAP_SECURITY_CODE)return new Response('Map service not configured',{status:503});
 const u=new URL(request.url),path=u.pathname.replace('/_AMapService','');
 if(!/^\/(v3|v4|v5)\/[a-zA-Z0-9/_-]+$/.test(path))return new Response('Invalid path',{status:400});
 u.searchParams.set('jscode',cfg.AMAP_SECURITY_CODE);u.searchParams.set('key',cfg.AMAP_JS_KEY);
 const host=path.startsWith('/v4/map/styles')?'webapi.amap.com':'restapi.amap.com';
 const r=await fetch(`https://${host}${path}?${u.searchParams}`,{signal:AbortSignal.timeout(15000)});
 return new Response(r.body,{status:r.status,headers:{'Content-Type':r.headers.get('Content-Type')||'application/json'}});
}
