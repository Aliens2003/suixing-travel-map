import {handleAuth,getSessionUser} from './auth';
import {signInPage,signInScript} from './signin';
import {geoapify} from '../lib/geoapify';
import {stateSchema,initial} from '../lib/travel';
interface Env{ASSETS:Fetcher;DB:D1Database;GEOAPIFY_API_KEY?:string;WEB_ORIGIN:string}
const json=(body:unknown,status=200)=>Response.json(body,{status});
async function state(request:Request,env:Env,userId:string) {
  if(request.method==='GET') {
    const row=await env.DB.prepare('SELECT payload,revision FROM intl_travel_states WHERE user_id=?').bind(userId).first<{payload:string;revision:number}>();
    return json({data:row?stateSchema.parse(JSON.parse(row.payload)):initial,revision:row?.revision??0});
  }
  if(request.method!=='POST')return json({error:'请求方式不支持'},405);
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
  const row=await env.DB.prepare('INSERT INTO intl_travel_states(user_id,payload,revision) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,revision=intl_travel_states.revision+1 WHERE intl_travel_states.revision=? RETURNING revision').bind(userId,JSON.stringify(parsed.data),value.revision).first<{revision:number}>();
  return row?json(row):json({error:'其他设备已更新，正在合并修改'},409);
}

async function handle(request:Request,env:Env){
 const path=new URL(request.url).pathname;
 if(['/api/auth/login','/api/auth/web-login'].includes(path)&&request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'请通过独立登录窗口登录'},403);
 if(path.startsWith('/api/auth/'))return handleAuth(request,env);
 if(!['/api/state','/api/maps'].includes(path)&&!path.startsWith('/api/tile/'))return json({error:'接口不存在'},404);
 const user=await getSessionUser(request,env);
 if(!user)return json({error:'登录已过期，本机修改仍保留'},401);
 if(path==='/api/state')return state(request,env,user.id);
 if(request.method!=='GET')return json({error:'请求方式不支持'},405);
 if(new URL(request.url).searchParams.get('action')!=='config'){
  const tile=path.startsWith('/api/tile/'),minute=Math.floor(Date.now()/60000);
  const counter=await env.DB.prepare('INSERT INTO intl_map_limits(user_id,window,count) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count').bind(user.id+(tile?':tile':':api'),minute).first<{count:number}>();
  if((counter?.count||0)>(tile?240:30))return json({error:'地图请求过于频繁'},429);
 }
 return geoapify(request,env.GEOAPIFY_API_KEY);
}
export default{async fetch(request:Request,env:Env){
 const url=new URL(request.url);
 if(request.method==='GET'&&url.pathname==='/signin')return new Response(signInPage,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"}});
 if(request.method==='GET'&&url.pathname==='/signin.js')return new Response(signInScript(env.WEB_ORIGIN),{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(!url.pathname.startsWith('/api/')){
  if(!['GET','HEAD'].includes(request.method))return json({error:'请求方式不支持'},405);
  const path=url.pathname;
  if(!['/','/index.html','/manifest.webmanifest','/precache.json','/sw.js','/favicon.svg','/offline.html','/vendor/leaflet.js','/vendor/leaflet.css','/vendor/LEAFLET-LICENSE'].includes(path)&&!/^\/(?:icons\/[a-z0-9-]+\.png|assets\/[a-zA-Z0-9_.-]+\.(?:js|css))$/.test(path))return json({error:'资源不存在'},404);
  return env.ASSETS.fetch(path==='/'?new Request(new URL('/index.html',url),request):request);
 }
 const origin=request.headers.get('Origin');
 const pages=origin===env.WEB_ORIGIN;
 const sameOrigin=origin===url.origin;
 if((origin&&!pages&&!sameOrigin)||(!origin&&!['GET','HEAD'].includes(request.method)))return json({error:'请求来源不匹配'},403);
 let response:Response;
 try{response=request.method==='OPTIONS'?new Response(null,{status:204}):await handle(request,env)}
 catch{response=json({error:'服务暂不可用，请稍后重试'},503)}
 const headers=new Headers(response.headers);
 if(pages&&origin)headers.set('Access-Control-Allow-Origin',origin);
 headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');
 headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');
 headers.set('Access-Control-Max-Age','600');
 headers.set('Vary','Origin');
 headers.set('Cache-Control','no-store');
 headers.set('X-Content-Type-Options','nosniff');
 return new Response(response.body,{status:response.status,headers})
}};
