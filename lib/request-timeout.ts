// Older Safari supports AbortController but not AbortSignal.timeout.
export function requestTimeout(milliseconds:number):AbortSignal {
  if(typeof AbortSignal.timeout==='function')return AbortSignal.timeout(milliseconds);
  const controller=new AbortController();
  setTimeout(()=>controller.abort(),milliseconds);
  return controller.signal;
}
