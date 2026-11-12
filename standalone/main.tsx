import {createRoot} from 'react-dom/client';
import {useEffect,useRef,useState} from 'react';
import TravelApp from '../app/travel-app';
import {api,saveToken,token,asset,endpoint} from '../lib/api';
import {requestTimeout} from '../lib/request-timeout';
import '../app/globals.css';
import './pwa.css';

type User={id:string;name:string};
const identity='suixing-international-user';
function App(){
 const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;
  (async()=>{try{
   if(!token())return;
   const r=await api('/api/auth/session',{signal:requestTimeout(8000)});
   if(r.status===401){saveToken('');localStorage.removeItem(identity);return}
   if(!r.ok)throw Error();
   const v=await r.json() as {user:User};if(live)setUser(v.user);
  }catch{try{const cached=JSON.parse(localStorage.getItem(identity)||'null');if(live&&cached&&token())setUser(cached)}catch{}}
  finally{if(live)setLoading(false)}})();
  return()=>{live=false};
 },[]);
 const popup=useRef<Window|null>(null);
 useEffect(()=>{
  const receive=(event:MessageEvent)=>{
   if(event.origin!==endpoint||event.source!==popup.current||event.data?.type!=='suixing-international-login')return;
   const {token:credential,user:next}=event.data;
   if(typeof credential!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(credential)||typeof next?.id!=='string'||typeof next?.name!=='string')return;
   try{saveToken(credential);localStorage.setItem(identity,JSON.stringify(next));setUser(next);setBusy(false)}
   catch{setError('浏览器存储不可用，请检查设置');setBusy(false)}
  };
  window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive)
 },[]);
 function login(){
  setError('');
  popup.current=window.open(endpoint+'/signin','suixing-international-login','popup,width=480,height=650');
  if(!popup.current)setError('浏览器拦截了登录窗口，请在 Safari 中允许弹出窗口后重试。');
 }
 async function logout(){const r=await api('/api/auth/logout',{method:'POST',signal:requestTimeout(10000)});if(!r.ok&&r.status!==401)throw Error('退出失败，请重试');clear()}
 function clear(){saveToken('');localStorage.removeItem(identity);setError('');setUser(null)}
 if(user)return <TravelApp key={user.id} user={user} independent onLogout={logout} onReauthenticate={clear}/>;
 return <main className="auth-page"><section className="auth-card"><img src={asset('icons/icon-192.png')} width="64" height="64" alt="随行"/><h1>随行 · 国际版</h1><p>使用原版账号登录。国际版收藏单独保存，可在设备之间同步。</p>{loading?<p>正在连接…</p>:<><button className="primary full" onClick={login} disabled={busy}>打开随行登录窗口</button>{error&&<p role="alert">{error}</p>}</>}<a href="https://suixing-travel-map.suixing-aliens2003.workers.dev/">回到原版 / 找回密码</a></section></main>
}
createRoot(document.getElementById('root')!).render(<App/>);
