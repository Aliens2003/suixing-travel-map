// Run locally after deploying the independent Worker. Never handles the owner's password.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';

const root=fileURLToPath(new URL('../',import.meta.url));
const runtime=path.join(root,'.sites-runtime');
const configPath=path.join(runtime,'wrangler.pwa.production.json');
let deployment,config,target;
try {
  deployment=JSON.parse(await fs.readFile(path.join(runtime,'pwa-deployment.json'),'utf8'));
  config=JSON.parse(await fs.readFile(configPath,'utf8'));
  target=new URL(deployment.url);
}catch{throw Error('无法读取独立部署地址或配置，初始化未开始。')}
if(target.protocol!=='https:'||!/^suixing-travel-map\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.workers\.dev$/.test(target.hostname)||target.port||target.username||target.password||target.search||target.hash||target.pathname!=='/'||config.name!=='suixing-travel-map')throw Error('独立部署地址或配置不匹配，初始化未开始。');
const localOrigin='http://127.0.0.1:5176';
const logs=path.join(root,'.wrangler','logs');
await fs.mkdir(logs,{recursive:true});

async function session() {
  const response=await fetch(new URL('/api/auth/session',target),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('独立站账号服务暂不可用，初始化未完成。');
  const data=await response.json();
  if(typeof data.configured!=='boolean'||typeof data.setupRequired!=='boolean')throw Error('账号服务返回异常，初始化未完成。');
  return data;
}
function secretCommand(action,input='') {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'secret',action,'SETUP_TOKEN','--config',configPath],{
      cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true,
      env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false',WRANGLER_LOG_SANITIZE:'true',WRANGLER_LOG_PATH:logs},
    });
    // Discard all child output: neither token input nor API diagnostic bodies may escape.
    child.stdout.resume();child.stderr.resume();
    const timeout=setTimeout(()=>child.kill(),90000);
    child.on('error',()=>{clearTimeout(timeout);reject(Error('初始化凭据操作失败，请检查 Cloudflare 登录。'))});
    child.on('close',code=>{clearTimeout(timeout);code===0?resolve():reject(Error('初始化凭据操作失败，请检查 Cloudflare 登录。'))});
    child.stdin.on('error',()=>{});
    child.stdin.end(input);
  });
}

if((await session()).configured) {
  console.log('个人账号已创建，无需初始化，服务端凭据未更改。');
} else {
  let token=randomBytes(32).toString('base64url');
  let secretMayExist=false,redirected=false,closing=false;
  let timer,poller,provisioning;
  const server=createServer((request,response)=>{
    const headers={'Cache-Control':'no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
    const sameHeaderOrigin=value=>{try{return new URL(value).origin===localOrigin}catch{return false}};
    const site=request.headers['sec-fetch-site'];
    const allowedSite=site==='none'||site==='same-origin';
    const origin=request.headers.origin,referer=request.headers.referer;
    const safe=request.socket.remoteAddress==='127.0.0.1'&&request.headers.host==='127.0.0.1:5176'&&allowedSite&&(!origin||sameHeaderOrigin(origin))&&(!referer||sameHeaderOrigin(referer));
    if(!safe){response.writeHead(403,headers);response.end('请在此电脑的浏览器地址栏直接打开本地初始化地址。');return}
    if(request.method!=='GET'||request.url!=='/'){response.writeHead(404,headers);response.end('Not found');return}
    if(closing||redirected){response.writeHead(410,headers);response.end('初始化入口已使用。请在已打开的随行页面完成账号创建。');return}
    redirected=true;
    const destination=new URL(target);destination.hash='setup='+token;
    response.writeHead(303,{...headers,Location:destination.href});response.end();
  });
  const stopped=new Promise(resolve=>server.on('close',resolve));
  async function finish(reason) {
    if(closing)return;
    closing=true;clearTimeout(timer);clearInterval(poller);token='';
    server.close();server.closeAllConnections();
    let deleted=false;
    if(secretMayExist) {
      // A signal during PUT must not delete first and leave a late PUT behind.
      try{await provisioning}catch{}
      for(let attempt=0;attempt<3&&!deleted;attempt++) {
        try {await secretCommand('delete');deleted=true}catch{}
      }
    }
    if(deleted)console.log(reason+'；SETUP_TOKEN 已删除，本地初始化入口已关闭。');
    else if(secretMayExist){console.error('本地入口已关闭，但 SETUP_TOKEN 删除失败。请在 Cloudflare 中删除该秘密后再继续。');process.exitCode=1}
    else console.log(reason+'，本地入口已关闭，服务端凭据未更改。');
    if(reason==='初始化超时')process.exitCode=1;
  }
  const interrupt=()=>void finish('初始化已取消');
  try {
    // Reserve the loopback port before setting any cloud secret.
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(5176,'127.0.0.1',resolve)});
    // Recheck after reserving the port so an already configured account is never rotated.
    if((await session()).configured){server.close();server.closeAllConnections();console.log('个人账号已创建，初始化凭据未更改。')}
    else {
      secretMayExist=true;
      process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
      provisioning=secretCommand('put',token+'\n');
      await provisioning;
      if(closing)throw Error('初始化已取消');
      // Port stays private until secret provisioning succeeds; output contains no fragment.
      console.log(localOrigin+'/');
      timer=setTimeout(()=>void finish('初始化超时'),10*60*1000);
      let checking=false;
      poller=setInterval(async()=>{if(checking||closing)return;checking=true;try{if((await session()).configured)await finish('个人账号创建成功')}catch{}finally{checking=false}},5000);
      await stopped;
    }
  } catch {
    await finish('初始化未完成');process.exitCode=1;
  } finally {
    process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
  }
}
