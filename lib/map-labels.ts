type Label={id:string,x:number,y:number,width:number};
export function visibleLabels(items:Label[],selected:string,width:number,height:number){
 const shown=new Set<string>(),boxes:{left:number,right:number,top:number,bottom:number}[]=[];
 for(const item of [...items].sort((a,b)=>a.id===selected?-1:b.id===selected?1:a.id.localeCompare(b.id))){
  if(!Number.isFinite(item.x)||!Number.isFinite(item.y)||item.x<0||item.x>width||item.y<0||item.y>height)continue;
  const box={left:item.x-item.width/2-4,right:item.x+item.width/2+4,top:item.y+15,bottom:item.y+39};
  if(item.id===selected||!boxes.some(b=>box.left<b.right&&box.right>b.left&&box.top<b.bottom&&box.bottom>b.top)){shown.add(item.id);boxes.push(box)}
 }
 return shown;
}
