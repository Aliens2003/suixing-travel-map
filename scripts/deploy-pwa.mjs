// Run only with the owner's Cloudflare login. Does not enable a paid plan.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd(),cli=path.join(root,'node_modules/wrangler/bin/wrangler.js');
const runtime=path.join(root,'.sites-runtime');
await fs.mkdir(runtime,{recursive:true});
function run(args,{capture=false}={}) {
  const result=spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',stdio:capture?'pipe':'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'}});
  if(result.status!==0)throw Error('Cloudflare command failed; the original site has not been changed.');
  return result.stdout||'';
}
const mode=process.argv[2]||'prepare';
if(!['prepare','bootstrap','publish'].includes(mode))throw Error('Use prepare, bootstrap or publish');
if(mode==='prepare') {
  run(['whoami']);
  const databases=JSON.parse(run(['d1','list','--json'],{capture:true}));
  let database=databases.find(d=>d.name==='suixing-travel-map');
  if(!database) {
    run(['d1','create','suixing-travel-map']);
    database=JSON.parse(run(['d1','list','--json'],{capture:true})).find(d=>d.name==='suixing-travel-map');
  }
  if(!database?.uuid)throw Error('Database identity unavailable');
  const config=JSON.parse(await fs.readFile(path.join(root,'wrangler.pwa.jsonc'),'utf8'));
  config.main=path.join(root,'standalone/worker.ts');
  config.assets.directory=path.join(root,'dist/pwa');
  config.d1_databases[0].database_id=database.uuid;
  config.d1_databases[0].migrations_dir=path.join(root,'drizzle');
  await fs.writeFile(path.join(runtime,'wrangler.pwa.production.json'),JSON.stringify(config,null,2));
  run(['d1','migrations','apply','DB','--config',path.join(runtime,'wrangler.pwa.production.json'),'--remote']);
  console.log('Prepared. Add SETUP_TOKEN and the three AMAP secrets using Cloudflare secret settings before publishing.');
}else {
  const config=path.join(runtime,'wrangler.pwa.production.json');
  await fs.access(config);await fs.access(path.join(root,'dist/pwa/precache.json'));
  // Verify credential names only, never read or print secret values.
  const secrets=mode==='bootstrap'?[]:JSON.parse(run(['secret','list','--config',config],{capture:true}));
  const required=['AMAP_JS_KEY','AMAP_SECURITY_CODE','AMAP_WEB_KEY'];
  if(mode!=='bootstrap'&&required.some(name=>!secrets.some(value=>value.name===name)))throw Error('Required runtime secrets are missing. Set them in Cloudflare before publishing.');
  run(['deploy','--config',config]);
}
