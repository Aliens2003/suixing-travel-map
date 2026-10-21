import {handleAuth,getSessionUser} from './auth';
import {stateSchema,initial} from '../lib/travel';
import {handleMaps} from '../lib/maps-server';

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SETUP_TOKEN?: string;
  AMAP_JS_KEY?: string;
  AMAP_SECURITY_CODE?: string;
  AMAP_WEB_KEY?: string;
}
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function sameOrigin(request:Request) {
  return request.headers.get('origin')===new URL(request.url).origin;
}
async function state(request:Request,env:Env,userId:string) {
  if(request.method==='GET') {
    const row=await env.DB.prepare('SELECT payload,revision FROM travel_states WHERE user_id=?').bind(userId).first<{payload:string;revision:number}>();
    return json({data:row?stateSchema.parse(JSON.parse(row.payload)):initial,revision:row?.revision??0});
  }
  if(request.method!=='POST')return json({error:'请求方式不支持'},405);
  if(!sameOrigin(request))return json({error:'请求来源不匹配'},403);
  if(Number(request.headers.get('content-length')||0)>1500000)return json({error:'数据不能超过 1.5 MB'},413);
  const reader=request.body?.getReader();
  if(!reader)return json({error:'数据格式错误'},400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1500000){await reader.cancel();return json({error:'数据不能超过 1.5 MB'},413)}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  const body=new TextDecoder().decode(bytes);
  let value:any;
  try{value=JSON.parse(body)}catch{return json({error:'数据格式错误'},400)}
  const parsed=stateSchema.safeParse(value?.data);
  if(!parsed.success||!Number.isSafeInteger(value?.revision)||value.revision<0)return json({error:'数据格式错误'},400);
  const row=await env.DB.prepare('INSERT INTO travel_states(user_id,payload,revision) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,revision=travel_states.revision+1 WHERE travel_states.revision=? RETURNING revision').bind(userId,JSON.stringify(parsed.data),value.revision).first<{revision:number}>();
  return row?json(row):json({error:'其他设备已更新，正在合并修改'},409);
}
async function mapProxy(request:Request,env:Env) {
  if(!env.AMAP_SECURITY_CODE||!env.AMAP_JS_KEY)return new Response('Map service not configured',{status:503});
  const url=new URL(request.url),path=url.pathname.slice('/_AMapService'.length);
  if(!/^\/(v3|v4|v5)\/[a-zA-Z0-9/_-]+$/.test(path))return new Response('Invalid path',{status:400});
  url.searchParams.set('jscode',env.AMAP_SECURITY_CODE);
  url.searchParams.set('key',env.AMAP_JS_KEY);
  const host=path.startsWith('/v4/map/styles')?'webapi.amap.com':'restapi.amap.com';
  const response=await fetch(`https://${host}${path}?${url.searchParams}`,{signal:AbortSignal.timeout(15000)});
  return new Response(response.body,{status:response.status,headers:{'Content-Type':response.headers.get('Content-Type')||'application/json','Cache-Control':'no-store'}});
}
async function handle(request:Request,env:Env):Promise<Response> {
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/auth/'))return await handleAuth(request,env)||json({error:'接口不存在'},404);
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/_AMapService')) {
    const user=await getSessionUser(request,env);
    if(!user)return json({error:'登录已过期，请重新登录；本机待同步内容仍保留。'},401);
    if(url.pathname==='/api/state')return state(request,env,user.id);
    if(request.method!=='GET')return json({error:'请求方式不支持'},405);
    const minute=Math.floor(Date.now()/60000);
    const limit=await env.DB.prepare('INSERT INTO map_limits(user_id,window,count) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count').bind(user.id,minute).first<{count:number}>();
    if((limit?.count||0)>120)return json({error:'地图请求过于频繁，请稍后重试'},429);
    if(url.pathname==='/api/maps')return handleMaps(request,{
      AMAP_JS_KEY:env.AMAP_JS_KEY||'',AMAP_WEB_KEY:env.AMAP_WEB_KEY||'',AMAP_SECURITY_CODE:env.AMAP_SECURITY_CODE||'',
    });
    if(url.pathname.startsWith('/_AMapService/'))return mapProxy(request,env);
    return json({error:'接口不存在'},404);
  }
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  return env.ASSETS.fetch(request);
}
export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    let response:Response;
    try {response=await handle(request,env)}
    catch {response=json({error:'服务暂不可用，请稍后重试。'},503)}
    const headers=new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');
    headers.set('Referrer-Policy','strict-origin-when-cross-origin');
    headers.set('Permissions-Policy','geolocation=(self), camera=(), microphone=()');
    headers.set('X-Frame-Options','DENY');
    if(new URL(request.url).pathname.startsWith('/api/'))headers.set('Cache-Control','no-store');
    if(['/', '/index.html','/sw.js','/precache.json'].includes(new URL(request.url).pathname))headers.set('Cache-Control','no-cache');
    return new Response(response.body,{status:response.status,headers});
  },
};
