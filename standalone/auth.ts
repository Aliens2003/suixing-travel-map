import {randomToken,tokenHash,verifyPassword} from '../lib/password';
export interface AuthEnv {DB:D1Database}
type User={id:string;name:string};
type Owner=User&{password_hash:string;recovery_hash:string};
const json=(body:unknown,status=200)=>Response.json(body,{status});
const now=()=>Math.floor(Date.now()/1000);
const cookieName='__Host-suixing-international';
const cookie=(value:string,maxAge=7*86400)=>cookieName+'='+value+'; Max-Age='+maxAge+'; Path=/; HttpOnly; Secure; SameSite=Strict';
function sessionToken(r:Request){
 const bearer=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(r.headers.get('Authorization')||'')?.[1];
 if(bearer)return bearer;
 const raw=r.headers.get('Cookie')?.split(';').map(p=>p.trim()).find(p=>p.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 return raw&&/^[A-Za-z0-9_-]{43}$/.test(raw)?raw:undefined;
}
export async function getSessionUser(r:Request,env:AuthEnv){
 const token=sessionToken(r);if(!token)return null;
 return env.DB.prepare('SELECT u.id,u.name FROM intl_sessions s JOIN app_users u ON u.id=s.user_id AND u.recovery_hash=s.recovery_hash WHERE s.token_hash=? AND s.expires_at>?').bind(tokenHash(token),now()).first<User>();
}
async function limited(request: Request, env: AuthEnv, action: string, username: string) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const bucket = Math.floor(now() / 900);
  const limits = [{ key: `ip:${action}:${tokenHash(ip)}`, max: action === 'login' ? 20 : 5 }];
  if (action !== 'setup') limits.push({ key: `account:${action}:${tokenHash(username)}`, max: action === 'login' ? 10 : 5 });
  const results = await env.DB.batch(limits.map(({ key }) => env.DB.prepare('INSERT INTO intl_auth_limits(rate_key,bucket,attempts) VALUES(?,?,1) ON CONFLICT(rate_key) DO UPDATE SET attempts=CASE WHEN intl_auth_limits.bucket=excluded.bucket THEN intl_auth_limits.attempts+1 ELSE 1 END,bucket=excluded.bucket RETURNING attempts').bind(key, bucket)));
  // Each increment is atomic; concurrent requests cannot share an allowed attempt.
  return results.some((result, index) => Number((result.results[0] as { attempts: number })?.attempts || Infinity) > limits[index].max);
}
async function readBody(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('body');
  if (Number(request.headers.get('content-length')) > 8192) throw new Error('size');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 8192) { await reader.cancel(); throw new Error('size'); } chunks.push(value); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const body = JSON.parse(new TextDecoder().decode(bytes));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body');
  return body as Record<string, unknown>;
}

export async function handleAuth(request:Request,env:AuthEnv):Promise<Response>{
 const path=new URL(request.url).pathname;
 if(path==='/api/auth/session'&&request.method==='GET'){
  const user=await getSessionUser(request,env);return user?json({user}):json({error:'请重新登录'},401)
 }
 if(request.method!=='POST')return json({error:'不支持此请求'},405);
 if(path==='/api/auth/logout'){
  const token=sessionToken(request);if(token)await env.DB.prepare('DELETE FROM intl_sessions WHERE token_hash=?').bind(tokenHash(token)).run();
  return Response.json({ok:true},{headers:{'Set-Cookie':cookie('',0)}});
 }
 if(path!=='/api/auth/login'&&path!=='/api/auth/web-login')return json({error:'接口不存在'},404);
 let input:Record<string,unknown>;
 try{input=await readBody(request)}catch{return json({error:'无效登录请求'},400)}
 const username=typeof input.username==='string'?input.username.trim().toLowerCase():'';
 if(!/^[a-z0-9_.-]{3,64}$/.test(username)||typeof input.password!=='string'||input.password.length<12||input.password.length>128)return json({error:'账号或密码格式不正确'},400);
 if(await limited(request,env,'login',username))return json({error:'尝试过于频繁，请稍后重试'},429);
 const user=await env.DB.prepare('SELECT id,name,password_hash,recovery_hash FROM app_users WHERE username=?').bind(username).first<Owner>();
 if(!await verifyPassword(input.password,user?.password_hash||'')||!user)return json({error:'账号或密码不正确'},401);
 const token=randomToken();
 await env.DB.batch([
  env.DB.prepare('DELETE FROM intl_sessions WHERE expires_at<=?').bind(now()),
  env.DB.prepare('DELETE FROM intl_auth_limits WHERE bucket<?').bind(Math.floor(now()/900)-2),
  env.DB.prepare('INSERT INTO intl_sessions(token_hash,user_id,recovery_hash,expires_at) VALUES(?,?,?,?)').bind(tokenHash(token),user.id,user.recovery_hash,now()+7*86400)
 ]);
 const publicUser={id:user.id,name:user.name};
 return path==='/api/auth/web-login'?Response.json({user:publicUser},{headers:{'Set-Cookie':cookie(token)}}):json({user:publicUser,token});
}
