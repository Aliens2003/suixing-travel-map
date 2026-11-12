export const signInPage=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>随行国际版 · 安全登录</title><style>body{font:16px system-ui;background:#eff4ef;color:#263b34;display:grid;place-items:center;min-height:90vh;margin:0}main{box-sizing:border-box;width:min(92vw,420px);background:white;padding:28px;border-radius:22px}label,input,button{display:block;box-sizing:border-box;width:100%;margin:10px 0}input,button{font:inherit;padding:12px;border:1px solid #b9c9bc;border-radius:10px}button{background:#32745f;color:white}p{line-height:1.6}</style><main><h1>随行 · 国际版</h1><p>使用原版随行账号。密码只提交到随行的登录服务。</p><form method="post"><label>账号<input name="username" autocomplete="username" maxlength="64" required></label><label>密码<input name="password" type="password" autocomplete="current-password" maxlength="128" required></label><button disabled>登录</button><p role="status"></p></form></main><script src="/signin.js" defer></script></html>`;
export const signInScript=(origin:string)=>`
 const origin=${JSON.stringify(origin)},form=document.querySelector('form'),button=form.querySelector('button'),status=form.querySelector('[role=status]');
 if(!window.opener){status.textContent='请从 GitHub Pages 上的随行国际版打开此窗口。';}
 else button.disabled=false;
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!window.opener)return;
  const fields=new FormData(form);button.disabled=true;status.textContent='正在登录…';
  try{
   const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:fields.get('username'),password:fields.get('password')})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'登录失败');
   form.reset();window.opener.postMessage({type:'suixing-international-login',user:data.user,token:data.token},origin);
   status.textContent='已登录，可以返回随行。';window.close();
  }catch(error){status.textContent=error instanceof TypeError?'无法连接登录服务':error.message;button.disabled=false}
 });
`;
