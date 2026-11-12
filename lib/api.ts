export const endpoint=import.meta.env.VITE_API_ORIGIN||'https://suixing-international.suixing-aliens2003.workers.dev';
const key='suixing-international-session';
export function token(){return localStorage.getItem(key)||''}
export function saveToken(value:string){if(value)localStorage.setItem(key,value);else localStorage.removeItem(key)}
export const asset=(path:string)=>import.meta.env.BASE_URL+path.replace(/^\//,'');
export function api(path:string,init:RequestInit={}){
 const headers=new Headers(init.headers),credential=token();
 if(credential)headers.set('Authorization','Bearer '+credential);
 return fetch(endpoint+path,{...init,headers,credentials:'omit',redirect:'error',cache:'no-store'});
}
