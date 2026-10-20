'use strict';
function point(event){
  const touch=(event.touches&&event.touches[0])||(event.changedTouches&&event.changedTouches[0]);if(!touch)return null;
  const x=touch.clientX===undefined?(touch.pageX===undefined?touch.x:touch.pageX):touch.clientX;
  const y=touch.clientY===undefined?(touch.pageY===undefined?touch.y:touch.pageY):touch.clientY;
  return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
}
// Match the bottom-aligned flex layout, including overlapping columns/cards.
function rectangles(layout,columns,viewport={}){
  const width=viewport.width||844,height=viewport.height||390,count=columns.length;
  const total=count*layout.cardWidth+Math.max(0,count-1)*layout.gap;
  const available=width-layout.left-layout.right-8,start=layout.left+4+(available-total)/2,bottom=height-layout.bottom-2,result=[];
  columns.forEach((column,index)=>column.cards.forEach(card=>result.push({id:card.id,eligible:card.eligible!==false,left:start+index*(layout.cardWidth+layout.gap),right:start+index*(layout.cardWidth+layout.gap)+layout.cardWidth,top:bottom-column.height+card.top,bottom:bottom-column.height+card.top+layout.cardHeight})));
  return result;
}
function hit(point,rects){
  for(let i=rects.length-1;i>=0;i--){const r=rects[i];if(point.x>=r.left&&point.x<r.right&&point.y>=r.top&&point.y<r.bottom)return r.eligible?r.id:null;}return null;
}
function trace(from,to,rects){
  const steps=Math.max(1,Math.min(4096,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/3))),seen=new Set(),ids=[];
  for(let i=0;i<=steps;i++){const id=hit({x:from.x+(to.x-from.x)*i/steps,y:from.y+(to.y-from.y)*i/steps},rects);if(id!==null&&!seen.has(id)){seen.add(id);ids.push(id);}}return ids;
}
module.exports={point,rectangles,hit,trace};
