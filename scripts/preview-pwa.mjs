// Isolated local QA: fresh in-memory D1, no real accounts or credentials written.
import {build} from 'esbuild';
import {Miniflare,Log,LogLevel} from 'miniflare';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
const root=process.cwd();
const {outputFiles}=await build({entryPoints:['standalone/worker.ts'],absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'neutral',external:['node:crypto'],target:'es2022',tsconfig:path.join(root,'tsconfig.json')});
const mf=new Miniflare({host:'127.0.0.1',port:5174,modules:true,script:outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],assets:{directory:path.join(root,'dist/pwa'),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true},assetConfig:{not_found_handling:'single-page-application',html_handling:'none'}},bindings:{SETUP_TOKEN:randomBytes(32).toString('base64url')},log:new Log(LogLevel.ERROR)});
const db=await mf.getD1Database('DB');
for(const file of ['0000_daffy_bushwacker.sql','0001_standalone_auth.sql','0002_map_limits.sql'])await db.exec((await fs.readFile(path.join(root,'drizzle',file),'utf8')).replace(/--[^\n]*/g,'').replace(/\s+/g,' '));
// A throwaway browser fixture; credentials are generated, kept in memory, and never logged.
const id=crypto.randomUUID(),session=randomBytes(32).toString('base64url');
await db.prepare('INSERT INTO app_users(id,username,name,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?,?)').bind(id,'local-preview','本机验收账号','disabled',randomBytes(32).toString('hex'),Math.floor(Date.now()/1000)).run();
await db.prepare('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(session).digest('hex'),id,Math.floor(Date.now()/1000)+3600).run();
// The URL is local-only and contains no credential. This handler exists only in this QA process.
const server=await mf.ready;
const http=await import('node:http');
let networkAvailable=true;
process.stdin.setEncoding('utf8');process.stdin.on('data',line=>{if(line.trim()==='offline'){networkAvailable=false;console.log('Local origin disconnected for offline QA')}if(line.trim()==='online'){networkAvailable=true;console.log('Local origin reconnected')}});
const proxy=http.createServer(async(req,res)=>{
  try {
    if(!networkAvailable){res.destroy();return}
    if(req.url==='/local-preview-signin') {res.writeHead(303,{'Set-Cookie':`suixing_session=${session}; Path=/; HttpOnly; SameSite=Strict`,'Location':'/','Cache-Control':'no-store'});res.end();return}
    const parts=[];for await(const part of req)parts.push(part);
    const body=Buffer.concat(parts);
    const headers={...req.headers,host:server.host};
    if(headers.origin==='http://127.0.0.1:5175')headers.origin=server.origin;
    const response=await fetch(server.origin+req.url,{method:req.method,headers,body:body.length?body:undefined,redirect:'manual'});
    const outgoing=new Headers(response.headers);outgoing.delete('content-encoding');outgoing.delete('content-length');
    res.writeHead(response.status,Object.fromEntries(outgoing));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503);res.end('Local preview error')}
});
proxy.listen(5175,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5175/local-preview-signin (isolated throwaway account)'));
async function close(){proxy.close();await mf.dispose();process.exit(0)}
process.on('SIGINT',close);process.on('SIGTERM',close);
