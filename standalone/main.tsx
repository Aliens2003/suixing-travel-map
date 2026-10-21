import {createRoot} from 'react-dom/client';
import {useEffect,useState} from 'react';
import {Compass,Download,RefreshCw} from 'lucide-react';
import TravelApp from '../app/travel-app';
import {requestTimeout} from '../lib/request-timeout';
import '../app/globals.css';
import './pwa.css';

type User={id:string;name:string};
type AuthResponse={user?:User|null;error?:string;setupEnabled?:boolean;setupRequired?:boolean;recoveryCode?:string};
const identityKey='suixing-device-user-v1';
function rememberedUser():User|null {
  try {const user=JSON.parse(localStorage.getItem(identityKey)||'null');return typeof user?.id==='string'&&typeof user?.name==='string'?user:null}catch{return null}
}
function App() {
  const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[mode,setMode]=useState<'login'|'setup'|'recover'>('login');
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[name,setName]=useState(''),[token,setToken]=useState(''),[recoveryCode,setRecoveryCode]=useState(''),[newCode,setNewCode]=useState(''),[working,setWorking]=useState(false),[offline,setOffline]=useState(false),[setupEnabled,setSetupEnabled]=useState(false);
  function accept(next:User) {setUser(next);setOffline(false);setError('');try{localStorage.setItem(identityKey,JSON.stringify(next))}catch{setError('本机存储不可用，请检查浏览器存储权限。')}}
  async function load() {
    setLoading(true);setError('');
    if(!navigator.onLine) {const cached=rememberedUser();if(cached){setUser(cached);setOffline(true)}else setError('请先联网登录一次，再使用离线内容。');setLoading(false);return}
    try {
      const response=await fetch('/api/auth/session',{cache:'no-store',signal:requestTimeout(12000)}),data=await response.json() as AuthResponse;
      if(!response.ok)throw Error(data.error||'账号服务暂不可用');
      setSetupEnabled(!!data.setupEnabled);setMode(data.setupRequired?'setup':'login');
      if(data.user)accept(data.user);else {setUser(null);try{localStorage.removeItem(identityKey)}catch{}}
    }catch(error){setError(error instanceof TypeError?'暂时无法连接云端，可打开本机已保存内容。':error instanceof Error?error.message:'暂时无法连接');setOffline(!!rememberedUser())}
    finally{setLoading(false)}
  }
  useEffect(()=>{const supplied=new URLSearchParams(location.hash.slice(1)).get('setup');if(supplied){setToken(supplied);history.replaceState(null,'',location.pathname+location.search)}void load()},[]);
  async function submit(event:React.FormEvent) {
    event.preventDefault();setError('');if(mode!=='login'&&password!==confirmPassword){setError('两次输入的密码不一致');return}
    setWorking(true);
    try {
      const response=await fetch('/api/auth/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,...(mode==='setup'?{token,name:name.trim()||username}:{}),...(mode==='recover'?{recoveryCode}:{} )}),signal:requestTimeout(30000)}),data=await response.json() as AuthResponse;
      if(!response.ok)throw Error(data.error||'登录失败');
      if(!data.user)throw Error('账号服务返回异常，请重试');
      accept(data.user);setNewCode(data.recoveryCode||'');setPassword('');setConfirmPassword('');setToken('');setRecoveryCode('');
    }catch(error){setError(error instanceof TypeError?'网络暂不可用，请恢复网络后重试。':error instanceof Error?error.message:'暂时无法连接，请重试')}
    finally{setWorking(false)}
  }
  async function logout() {
    const response=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:requestTimeout(15000)});
    if(!response.ok)throw Error('退出未成功，请联网后重试。');
    localStorage.removeItem(identityKey);setUser(null);setMode('login');setNewCode('');setOffline(false);setError('');
  }
  function downloadCode() {
    const url=URL.createObjectURL(new Blob([`随行账号恢复码\n账号：${username}\n恢复码：${newCode}\n请存放在密码管理器或安全位置，不要与他人分享。恢复使用后旧码失效。`],{type:'text/plain;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='随行账号恢复码.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(loading)return <main className="auth-page"><section className="auth-card"><Compass size={36}/><h1>随行</h1><p>正在打开你的旅途…</p></section></main>;
  if(user&&!newCode)return <TravelApp key={user.id} user={user} independent onLogout={logout} onReauthenticate={()=>{setUser(null);setMode('login');setOffline(false);setError('')}}/>;
  if(newCode)return <main className="auth-page"><section className="auth-card"><Compass size={36}/><h1>保存账号恢复码</h1><p>忘记密码时用它找回账号。恢复码只展示这一次，使用后会生成新码。</p><code className="recovery-code">{newCode}</code><button className="secondary full" onClick={downloadCode}><Download size={18}/>下载恢复码</button><button className="primary full" onClick={()=>{if(confirm('确认已将恢复码保存到安全位置？'))setNewCode('')}}>已保存，进入随行</button></section></main>;
  return <main className="auth-page"><section className="auth-card"><img src="/icons/icon-192.png" width="64" height="64" alt="随行"/><div className="eyebrow">把想去的地方，留在地图上。</div><h1>{mode==='setup'?'创建你的随行账号':mode==='recover'?'找回账号':'欢迎回到随行'}</h1><p>{mode==='setup'?'此应用仅供你个人使用。首次创建需要部署时设置的初始化凭据。':mode==='recover'?'输入账号、恢复码和新密码。成功后旧会话与旧恢复码都会失效。':'手机与 iPad 使用同一个账号，收藏夹和路线随你同行。'}</p>
    <form onSubmit={submit}>
      <label>账号<input autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={64} pattern="[A-Za-z0-9_.\-]{3,64}" value={username} onChange={event=>setUsername(event.target.value)} placeholder="3–64 位英文、数字或 _-."/></label>
      {mode==='setup'&&<><label>昵称<input autoComplete="nickname" maxLength={64} value={name} onChange={event=>setName(event.target.value)} placeholder="怎么称呼你"/></label><label>初始化凭据<input type="password" autoComplete="off" required value={token} onChange={event=>setToken(event.target.value)}/></label></>}
      {mode==='recover'&&<label>账号恢复码<input autoComplete="off" required value={recoveryCode} onChange={event=>setRecoveryCode(event.target.value.trim())}/></label>}
      <label>{mode==='recover'?'新密码':'密码'}<input type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={12} maxLength={128} value={password} onChange={event=>setPassword(event.target.value)} placeholder="至少 12 位，可使用密码管理器"/></label>
      {mode!=='login'&&<label>再次输入密码<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/></label>}
      {error&&<p className="auth-error" role="alert">{error}</p>}
      {mode==='setup'&&!setupEnabled&&<p className="auth-error">部署尚未配置初始化凭据，请完成托管配置后重试。</p>}
      <button className="primary full" disabled={working||(mode==='setup'&&!setupEnabled)}>{working?'正在处理…':mode==='setup'?'创建账号':mode==='recover'?'重设密码':'登录随行'}</button>
    </form>
    {mode!=='setup'&&<button className="text-button" onClick={()=>{setMode(mode==='recover'?'login':'recover');setError('');setPassword('');setConfirmPassword('')}}>{mode==='recover'?'返回登录':'忘记密码？使用恢复码'}</button>}
    <button className="text-button" disabled={working} onClick={()=>void load()}><RefreshCw size={14}/>重新连接</button>
    {offline&&<button className="secondary full" onClick={()=>setUser(rememberedUser())}>打开本机已保存内容</button>}
    <p className="subtle">在 Safari 中打开后，点“分享 → 添加到主屏幕”，即可从桌面打开随行。</p>
  </section></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
