import {createRoot} from 'react-dom/client';
import {useEffect,useState} from 'react';
import TravelApp from '../app/travel-app';
import {api,asset} from '../lib/api';
import {requestTimeout} from '../lib/request-timeout';
import '../app/globals.css';
import './pwa.css';

type User={id:string;name:string};
const identity='suixing-international-user';
function App(){
 const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;
  (async()=>{try{
   const r=await api('/api/auth/session',{signal:requestTimeout(8000)});
   if(r.status===401){localStorage.removeItem(identity);return}
   if(!r.ok)throw Error();
   const v=await r.json() as {user:User};if(live)setUser(v.user);
  }catch{try{const cached=JSON.parse(localStorage.getItem(identity)||'null');if(live&&cached)setUser(cached)}catch{}}
  finally{if(live)setLoading(false)}})();
  return()=>{live=false};
 },[]);
 async function login(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setError('');setBusy(true);
  const fields=new FormData(e.currentTarget);
  try{
   const r=await api('/api/auth/web-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:fields.get('username'),password:fields.get('password')}),signal:requestTimeout(20000)});
   const v=await r.json() as {user:User;error?:string};
   if(!r.ok)throw Error(v.error||'登录失败');
   localStorage.setItem(identity,JSON.stringify(v.user));setUser(v.user);
  }catch(error){setError(error instanceof TypeError?'无法连接登录服务，请检查网络。':error instanceof Error?error.message:'登录失败')}
  finally{setBusy(false)}
 }
 async function logout(){const r=await api('/api/auth/logout',{method:'POST',signal:requestTimeout(10000)});if(!r.ok&&r.status!==401)throw Error('退出失败，请重试');clear()}
 function clear(){localStorage.removeItem(identity);setError('');setUser(null)}
 if(user)return <TravelApp key={user.id} user={user} independent onLogout={logout} onReauthenticate={clear}/>;
 return <main className="auth-page"><section className="auth-card"><img src={asset('icons/icon-192.png')} width="64" height="64" alt="随行"/><h1>随行 · 国际版</h1><p>使用原版账号登录。国际版收藏单独保存，可在设备之间同步。</p>{loading?<p>正在连接…</p>:<form onSubmit={login}><label>账号<input name="username" autoComplete="username" required maxLength={64}/></label><label>密码<input name="password" type="password" autoComplete="current-password" required maxLength={128}/></label>{error&&<p role="alert">{error}</p>}<button className="primary full" disabled={busy}>{busy?'正在登录…':'登录国际版'}</button></form>}<a href="https://suixing-travel-map.suixing-aliens2003.workers.dev/">回到原版 / 找回密码</a></section></main>
}
createRoot(document.getElementById('root')!).render(<App/>);
