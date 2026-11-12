const attribution='Geoapify · OpenStreetMap contributors';
const json=(value:unknown,status=200)=>Response.json(value,{status});
function point(raw:string|null){
 if(!raw||!/^[-+]?\d+(?:\.\d+)?,[-+]?\d+(?:\.\d+)?$/.test(raw))return null;
 const [lng,lat]=raw.split(',').map(Number);
 return Math.abs(lng)<=180&&Math.abs(lat)<=85?[lng,lat]:null;
}
export async function geoapify(request:Request,key:string|undefined,upstream:typeof fetch=fetch){
 const url=new URL(request.url),q=url.searchParams,action=q.get('action');
 if(action==='config')return json({ready:!!key});
 if(!key)return json({error:'国际版尚未配置 Geoapify。已保存的标记仍可查看。'},503);
 let target:URL;
 if(url.pathname.startsWith('/api/tile/')){
  const m=/^\/api\/tile\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})$/.exec(url.pathname);
  if(!m)return json({error:'无效地图坐标'},400);
  const [,z,x,y]=m.map(Number);
  if(z>19||x>=2**z||y>=2**z)return json({error:'无效地图坐标'},400);
  target=new URL('https://maps.geoapify.com/v1/tile/osm-bright/'+z+'/'+x+'/'+y+'.png');
 }else if(action==='search'){
  const name=q.get('q')?.trim()||'',country=q.get('country')||'';
  if(!name||name.length>120||country&&!/^[a-z]{2}$/.test(country))return json({error:'请输入有效地名或国家代码'},400);
  target=new URL('https://api.geoapify.com/v1/geocode/search');
  target.search=new URLSearchParams({text:name,format:'json',limit:'10',bias:'countrycode:none',...(country?{filter:'countrycode:'+country}:{})}).toString();
 }else if(action==='route'){
  const a=point(q.get('origin')),b=point(q.get('destination'));
  const mode=({walking:'walk',bicycling:'bicycle',driving:'drive'} as Record<string,string>)[q.get('mode')||''];
  if(!a||!b||!mode)return json({error:'国际版仅提供步行、骑行及驾车路线'},400);
  target=new URL('https://api.geoapify.com/v1/routing');
  target.search=new URLSearchParams({waypoints:a.slice().reverse().join(',')+'|'+b.slice().reverse().join(','),mode}).toString();
 }else return json({error:'接口不存在'},404);
 target.searchParams.set('apiKey',key);
 try{
  const response=await upstream(target,{signal:AbortSignal.timeout(12000),redirect:'error'});
  if(!response.ok)return json({error:response.status===429?'地图服务额度或速率已达限制':'Geoapify 暂时不可用'},response.status===429?429:502);
  if(url.pathname.startsWith('/api/tile/')){
   if(!response.headers.get('content-type')?.startsWith('image/png'))return json({error:'底图响应异常'},502);
   return new Response(response.body,{headers:{'Content-Type':'image/png','Cache-Control':'private, max-age=3600'}});
  }
  const v:any=await response.json();
  if(action==='search'){
   const places=(Array.isArray(v.results)?v.results:[]).flatMap((p:any)=>{
    if(!p||typeof p.lon!=='number'||typeof p.lat!=='number'||!point(p.lon+','+p.lat))return [];
    const name=String(p.name||p.address_line1||p.formatted||'').slice(0,120);
    return name?[{name,lng:p.lon,lat:p.lat,address:String(p.formatted||'').slice(0,320)}]:[];
   });return json({places,attribution});
  }
  const f=v.features?.[0],p=f?.properties,g=f?.geometry;
  if(!Number.isFinite(p?.distance)||!Number.isFinite(p?.time)||!Array.isArray(g?.coordinates)||!['LineString','MultiLineString'].includes(g.type))return json({error:'未找到可用路线'},404);
  return json({distance:p.distance,duration:p.time,lines:g.type==='LineString'?[g.coordinates]:g.coordinates,instructions:[],attribution});
 }catch{return json({error:'地图服务连接失败，请检查网络后重试'},502)}
}
