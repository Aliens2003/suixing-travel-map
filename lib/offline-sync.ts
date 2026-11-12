import {initial,stateSchema,type State} from './travel';

export type SyncConflict={id:string,label:string,local:unknown,remote:unknown};
export type Choices=Record<string,'local'|'remote'>;
export type ConflictSession={base:State,local:State,remote:State,choices:Choices};
export type SyncRecord={version:1,base:State,local:State,revision:number,session?:ConflictSession};
export const copy=<T,>(value:T):T=>structuredClone(value);
export const equal=(a:unknown,b:unknown):boolean=>{
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
 const x=a as Record<string,unknown>,y=b as Record<string,unknown>,keys=Object.keys(x);return keys.length===Object.keys(y).length&&keys.every(k=>Object.hasOwn(y,k)&&equal(x[k],y[k]));
};
const fieldNames:Record<string,string>={name:'名称',originalName:'原地名',lng:'经度',lat:'纬度',category:'分类',tags:'标签',note:'备注',url:'网址',visited:'去过状态',date:'日期',stops:'路线地点顺序',modes:'交通方式',icon:'图标',color:'颜色'};

/** Three-way merge: neither timestamps nor array indices determine a winner. */
export function mergeTravel(base:State,local:State,remote:State,choices:Choices={}){
 const conflicts:SyncConflict[]=[];
 function conflict(id:string,label:string,l:unknown,r:unknown){if(choices[id])return copy(choices[id]==='local'?l:r);conflicts.push({id,label,local:copy(l),remote:copy(r)});return copy(l)}
 function entities(b:any[],l:any[],r:any[],path:string,label:string):any[]{
  const bm=new Map(b.map(v=>[v.id,v])),lm=new Map(l.map(v=>[v.id,v])),rm=new Map(r.map(v=>[v.id,v]));
  return [...new Set([...l,...r,...b].map(v=>v.id))].flatMap(id=>{const bv=bm.get(id),lv=lm.get(id),rv=rm.get(id),p=`${path}/${id}`,title=`${label}「${lv?.name||rv?.name||bv?.name||id}」`;let value:any;
   if(equal(lv,rv))value=copy(lv);else if(equal(lv,bv))value=copy(rv);else if(equal(rv,bv))value=copy(lv);
   else if(!lv||!rv||!bv)value=conflict(p,`${title}：${!lv||!rv?'删除与编辑冲突':'两端创建了不同内容'}`,lv,rv);
   else {value={id};for(const k of Object.keys({...bv,...lv,...rv})){if(k==='id')continue;const key=`${p}/${k}`;
    if(k==='routes')value[k]=entities(bv[k],lv[k],rv[k],key,`${title}的路线`);
    else if(k==='placeIds'){const bs=new Set(bv[k]),ls=new Set(lv[k]),rs=new Set(rv[k]);value[k]=[...new Set([...lv[k],...rv[k]])].filter(v=>bs.has(v)?ls.has(v)&&rs.has(v):ls.has(v)||rs.has(v))}
    else if(equal(lv[k],rv[k]))value[k]=copy(lv[k]);else if(equal(lv[k],bv[k]))value[k]=copy(rv[k]);else if(equal(rv[k],bv[k]))value[k]=copy(lv[k]);
    else value[k]=conflict(key,`${title}的${fieldNames[k]||k}在两端均有修改`,lv[k],rv[k]);
   }}return value?[value]:[];
  });
 }
 if(choices.state)return {data:copy(choices.state==='local'?local:remote),conflicts};
 const data:State={schemaVersion:2,categories:entities(base.categories,local.categories,remote.categories,'categories','分类'),places:entities(base.places,local.places,remote.places,'places','地点'),folders:entities(base.folders,local.folders,remote.folders,'folders','收藏夹')};
 if(!stateSchema.safeParse(data).success)return {data:copy(local),conflicts:[{id:'state',label:'两端修改涉及地点、分类或路线的关联，无法安全逐项合并；请选择保留整份本机版本或整份云端版本',local:copy(local),remote:copy(remote)}]};
 return {data,conflicts};
}

export type StorageLike=Pick<Storage,'getItem'|'setItem'>;
export function readSyncRecord(storage:StorageLike,key:string,legacyKey:string):SyncRecord|null{
 const raw=storage.getItem(key);if(raw){const v=JSON.parse(raw);if(v.version!==1||!Number.isSafeInteger(v.revision)||v.revision<0)throw Error('本机同步记录损坏，请先导出备份');stateSchema.parse(v.base);stateSchema.parse(v.local);if(v.session){stateSchema.parse(v.session.base);stateSchema.parse(v.session.local);stateSchema.parse(v.session.remote);if(!v.session.choices||Object.values(v.session.choices).some(x=>x!=='local'&&x!=='remote'))throw Error('同步冲突记录损坏')}return v}
 const legacy=storage.getItem(legacyKey);if(!legacy)return null;const v=JSON.parse(legacy);stateSchema.parse(v.data);if(!Number.isSafeInteger(v.revision)||v.revision<0)throw Error('旧缓存版本无效');return {version:1,base:copy(v.data),local:copy(v.data),revision:v.revision};
}
export type SyncSnapshot={data:State,loaded:boolean,busy:boolean,online:boolean,sync:string,conflicts:SyncConflict[],storageError?:string,readonlyReason?:string,pending:boolean};
export type LocksLike={request:(name:string,options:{mode:'exclusive',ifAvailable:true},callback:(lock:unknown|null)=>Promise<void>)=>Promise<unknown>};
/** Hold an origin-wide account lock for the writer's entire lifetime. Never steal it. */
export class AccountSyncLease {
 private closed=false;
 private requesting=false;
 private held=false;
 private release:(()=>void)|undefined;
 private cleanup:(()=>void)|undefined;
 constructor(privateLocks:LocksLike|null,privateName:string,privateAcquire:()=>()=>void,privateBlocked:(reason:string)=>void){this.locks=privateLocks;this.name=privateName;this.acquire=privateAcquire;this.blocked=privateBlocked}
 private locks:LocksLike|null;
 private name:string;
 private acquire:()=>()=>void;
 private blocked:(reason:string)=>void;
 attempt(){
  if(this.closed||this.requesting||this.held)return;
  if(!this.locks){this.blocked('当前浏览器不支持安全的多窗口保存，请使用新版 Safari，并通过 HTTPS 打开。当前仅可查看。');return}
  this.requesting=true;
  void this.locks.request(this.name,{mode:'exclusive',ifAvailable:true},async lock=>{
   if(this.closed)return;if(!lock){this.blocked('另一个随行页面正在管理此账号的数据。请关闭该页面后返回，本页会自动重试；当前仅可查看。');return}
   this.held=true;
   try{await new Promise<void>(resolve=>{this.release=resolve;this.cleanup=this.acquire()})}finally{this.cleanup?.();this.cleanup=undefined;this.release=undefined;this.held=false}
  }).catch(()=>{if(!this.closed)this.blocked('无法取得安全保存权限，请关闭其他随行页面并重试。当前仅可查看。')}).finally(()=>{this.requesting=false});
 }
 close(){this.closed=true;this.cleanup?.();this.cleanup=undefined;this.release?.()}
}
type Fetcher=(input:string,init?:RequestInit)=>Promise<Response>;
export class TravelSyncEngine {
 record:SyncRecord={version:1,base:copy(initial),local:copy(initial),revision:0};
 snapshot:SyncSnapshot={data:copy(initial),loaded:false,busy:false,online:true,sync:'正在连接',conflicts:[],pending:false};
 private running:Promise<void>|null=null;
 private listeners=new Set<()=>void>();
 private closed=false;
 private userId:string|null;
 private storage:StorageLike;
 private request:Fetcher;
 private timeoutMs:number;
 private abort:AbortController|null=null;
 constructor(userId:string|null,storage:StorageLike,request:Fetcher=(input,init)=>globalThis.fetch(input,init),timeoutMs=20000){this.userId=userId;this.storage=storage;this.request=request;this.timeoutMs=timeoutMs}
 get key(){return `suixing-offline-v1-${this.userId||'guest'}`}
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn)}};
 getSnapshot=()=>this.snapshot;
 private emit(extra:Partial<SyncSnapshot>={}){if(this.closed)return;this.snapshot={...this.snapshot,...extra,data:this.record.local,pending:!equal(this.record.base,this.record.local)||!!this.record.session};for(const fn of this.listeners)fn()}
 private persist(){if(this.closed)return false;try{this.storage.setItem(this.key,JSON.stringify(this.record));this.emit({storageError:undefined});return true}catch{this.emit({storageError:'本机存储不可用或空间不足。修改仍在当前页面内，请立即导出备份，关闭页面可能丢失。',sync:'本机保存失败'});return false}}
 start(online:boolean){if(this.closed)return;this.emit({online});if(!this.userId){this.emit({loaded:true,sync:'未登录'});return}try{const record=readSyncRecord(this.storage,this.key,`suixing-v2-cache-${this.userId}`);if(record)this.record=record;const conflicts=record?.session?mergeTravel(record.session.base,record.session.local,record.session.remote,record.session.choices).conflicts:[];this.emit({loaded:true,conflicts,sync:conflicts.length?'有同步冲突':equal(this.record.base,this.record.local)?'本机缓存':'待同步'});}catch{this.emit({loaded:true,storageError:'无法读取本机同步缓存，请保留浏览器数据并恢复备份。为避免覆盖，当前禁止保存。',sync:'本机缓存异常'});return}if(online)void this.syncNow()}
 close(){this.closed=true;this.abort?.abort();this.listeners.clear()}
 setOnline(online:boolean){this.emit({online,sync:online?this.snapshot.sync:this.snapshot.pending?'离线 · 待同步':'离线 · 本机缓存'});if(online)void this.syncNow()}
 mutate=async(fn:(draft:State)=>void):Promise<boolean>=>{
  if(this.closed||!this.userId||!this.snapshot.loaded||this.snapshot.storageError?.startsWith('无法读取'))return false;
  const next=copy(this.record.local);try{fn(next);stateSchema.parse(next)}catch{return false}
  this.record={...this.record,local:next};let conflicts=this.snapshot.conflicts;
  if(this.record.session){this.record.session={...this.record.session,local:copy(next),choices:{}};conflicts=mergeTravel(this.record.session.base,next,this.record.session.remote).conflicts}
  const saved=this.persist();this.emit({conflicts,sync:saved?(conflicts.length?'有同步冲突':this.snapshot.online?'待同步':'离线 · 待同步'):'本机保存失败'});if(saved&&this.snapshot.online&&!conflicts.length)void this.syncNow();return saved;
 };
 resolveConflict=(id:string,choice:'local'|'remote')=>{
  const session=this.record.session;if(this.closed||!session)return;session.choices={...session.choices,[id]:choice};const merged=mergeTravel(session.base,session.local,session.remote,session.choices);this.record.local=merged.data;
  if(!merged.conflicts.length)this.record.session=undefined;
  const saved=this.persist();this.emit({conflicts:merged.conflicts,sync:saved?(merged.conflicts.length?'有同步冲突':'待同步'):'本机保存失败'});if(saved&&!merged.conflicts.length&&this.snapshot.online)void this.syncNow();
 };
 syncNow=():Promise<void>=>{
  if(this.running)return this.running;if(this.closed||!this.userId||!this.snapshot.loaded||!this.snapshot.online||this.record.session||this.snapshot.storageError?.startsWith('无法读取'))return Promise.resolve();
  this.running=this.run().finally(()=>{this.running=null});return this.running;
 };
 private async run(){const controller=new AbortController();this.abort=controller;const timeout=setTimeout(()=>controller.abort(),this.timeoutMs);this.emit({busy:true,sync:'正在同步'});try{
  for(let attempt=0;attempt<4&&!this.closed;attempt++){
   const response=await this.request('/api/state',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error(response.status===401?'登录已过期，修改保留在本机，请重新登录':'云端连接失败，修改保留在本机');const cloud=await response.json() as {data:State|null,revision:number};if(this.closed)return;const remote=stateSchema.parse(cloud.data||copy(initial));if(!Number.isSafeInteger(cloud.revision)||cloud.revision<0)throw Error('云端版本无效');
   const base=this.record.base,local=this.record.local,merged=mergeTravel(base,local,remote);
   this.record={version:1,base:copy(remote),local:merged.data,revision:cloud.revision,...(merged.conflicts.length?{session:{base:copy(base),local:copy(local),remote:copy(remote),choices:{}}}:{})};
   if(!this.persist())return;this.emit({conflicts:merged.conflicts});if(merged.conflicts.length){this.emit({sync:'有同步冲突'});return}
   if(equal(this.record.base,this.record.local)){this.emit({sync:'已同步'});return}
   const sent=copy(this.record.local),revision=this.record.revision;
   const posted=await this.request('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:sent,revision}),signal:controller.signal});if(this.closed)return;if(posted.status===409)continue;if(!posted.ok)throw Error(posted.status===401?'登录已过期，修改保留在本机，请重新登录':'上传失败，修改保留在本机');const saved=await posted.json() as {revision:number};if(this.closed)return;if(!Number.isSafeInteger(saved.revision)||saved.revision<=revision)throw Error('云端保存版本无效');
   // local may have changed while POST was in flight; only acknowledge the sent snapshot.
   this.record={...this.record,base:sent,revision:saved.revision};if(!this.persist())return;this.emit();if(equal(this.record.base,this.record.local)){this.emit({sync:'已同步'});return}
  }this.emit({sync:'待同步，请稍后重试'});
 }catch(error){this.emit({sync:controller.signal.aborted?'同步超时，修改保留在本机，请重试':error instanceof Error?error.message:'同步失败，修改保留在本机'})}finally{clearTimeout(timeout);if(this.abort===controller)this.abort=null;this.emit({busy:false})}}
}
