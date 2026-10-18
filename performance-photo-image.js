/* Locate isolated white amount bubbles on colored panels, without card-specific coordinates. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.PerformancePhotoImage=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function findAmountBubbles({width,height,data}){
  const seen=new Uint8Array(width*height),queue=new Int32Array(width*height),found=[];
  const white=i=>data[i*4]>238&&data[i*4+1]>238&&data[i*4+2]>238;
  for(let start=0;start<seen.length;start++){
   if(seen[start]||!white(start))continue;
   let head=0,tail=1,x0=width,y0=height,x1=0,y1=0;queue[0]=start;seen[start]=1;
   while(head<tail){
    const i=queue[head++],x=i%width,y=Math.floor(i/width);
    x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
    for(const next of [x>0?i-1:-1,x+1<width?i+1:-1,y>0?i-width:-1,y+1<height?i+width:-1]){
     if(next>=0&&!seen[next]&&white(next)){seen[next]=1;queue[tail++]=next}
    }
   }
   const w=x1-x0+1,h=y1-y0+1;
   if(w<35||w>width*.8||h<12||h>height*.12||w/h<1.5||w/h>12||tail<w*h*.45)continue;
   let colored=0,total=0,dark=0;
   for(let y=Math.max(0,y0-3);y<=Math.min(height-1,y1+3);y++)for(let x=Math.max(0,x0-3);x<=Math.min(width-1,x1+3);x++){
    const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
    if(x<x0||x>x1||y<y0||y>y1){total++;if(Math.max(r,g,b)-Math.min(r,g,b)>50)colored++}
    else if(Math.max(r,g,b)<150)dark++;
   }
   if(total&&colored/total>.35&&dark>w*h*.015)found.push({x:x0,y:y0,width:w,height:h});
  }
  return found.sort((a,b)=>b.width*b.height-a.width*a.height).slice(0,3);
 }
 return{findAmountBubbles};
});
