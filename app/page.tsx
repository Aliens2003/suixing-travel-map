import TravelApp from './travel-app';
import { getChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Page() {
 const user=await getChatGPTUser();
 return <TravelApp user={user?{id:user.userId,name:user.displayName}:null}/>;
}
