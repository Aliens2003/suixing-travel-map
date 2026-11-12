export const asset=(path:string)=>import.meta.env.BASE_URL+path.replace(/^\//,'');
export function api(path:string,init:RequestInit={}){
 return fetch(path,{...init,credentials:'same-origin',redirect:'error',cache:'no-store'});
}
