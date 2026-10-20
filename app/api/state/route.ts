import { getChatGPTUser } from '../../chatgpt-auth';
import { env } from 'cloudflare:workers';
import { stateSchema } from '../../../lib/travel';
export async function GET(){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});
 const row=await env.DB!.prepare('SELECT payload,revision FROM travel_states WHERE user_id=?').bind(user.userId).first<{payload:string,revision:number}>();
 return Response.json({data:row?JSON.parse(row.payload):null,revision:row?.revision??0},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'请求来源不匹配'},{status:403});
 const body=await request.text();if(body.length>1500000)return Response.json({error:'数据过大，请导出后精简'},{status:413});
 let input;try{input=JSON.parse(body)}catch{return Response.json({error:'数据格式错误'},{status:400})}
 const parsed=stateSchema.safeParse(input.data);
 if(!parsed.success||!Number.isSafeInteger(input.revision)||input.revision<0)return Response.json({error:'数据格式错误'},{status:400});
 const result=await env.DB!.prepare('INSERT INTO travel_states(user_id,payload,revision) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload, revision=travel_states.revision+1 WHERE travel_states.revision=? RETURNING revision').bind(user.userId,JSON.stringify(parsed.data),input.revision).first<{revision:number}>();
 if(!result)return Response.json({error:'另一台设备已更新。请先导出当前备份，再重新载入云端数据。'},{status:409});
 return Response.json(result);
}
