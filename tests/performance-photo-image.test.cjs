const test=require('node:test'),assert=require('node:assert/strict');
const {findAmountBubbles}=require('../performance-photo-image.js');
test('isolated white bubble on teal is found, graph and white page are excluded',()=>{
 const width=400,height=600,data=new Uint8ClampedArray(width*height*4);
 function fill(x,y,w,h,r,g,b){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const i=(yy*width+xx)*4;data.set([r,g,b,255],i)}}
 fill(0,0,width,height,255,255,255);fill(20,180,360,300,0,123,131);
 fill(270,260,80,24,255,255,255);fill(280,267,50,6,30,30,30);
 fill(40,300,310,4,255,255,255);
 const boxes=findAmountBubbles({width,height,data});
 assert.equal(boxes.length,1);assert.deepEqual(boxes[0],{x:270,y:260,width:80,height:24});
});
