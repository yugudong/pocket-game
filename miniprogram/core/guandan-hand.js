'use strict';
function create(C){
function automatic(hand,level){const columns=[];for(const id of C.sorted(hand,level)){const rank=C.card(id).rank,last=columns[columns.length-1];if(last&&C.card(last.cards[0]).rank===rank)last.cards.push(id);else columns.push({cards:[id],manual:false});}return columns;}
function reconcile(columns,hand,level){
  const owned=new Set(hand),seen=new Set(),result=[];
  for(const column of Array.isArray(columns)?columns:[]){const cards=[];for(const id of Array.isArray(column.cards)?column.cards:[])if(owned.has(id)&&!seen.has(id)){cards.push(id);seen.add(id);}if(cards.length)result.push({cards,manual:!!column.manual});}
  for(const id of C.sorted(hand.filter(id=>!seen.has(id)),level)){const rank=C.card(id).rank,column=result.find(c=>!c.manual&&c.cards.every(id=>C.card(id).rank===rank));if(column)column.cards.push(id);else result.push({cards:[id],manual:false});}return result;
}
return {automatic,reconcile,combine,fit};
}
function combine(columns,selected){
  const wanted=new Set(selected),cards=columns.flatMap(c=>c.cards).filter(id=>wanted.has(id));if(!cards.length)return columns;const result=[];let inserted=false;
  for(const column of columns){if(!inserted&&column.cards.some(id=>wanted.has(id))){result.push({cards,manual:true});inserted=true;}const rest=column.cards.filter(id=>!wanted.has(id));if(rest.length)result.push({cards:rest,manual:!!column.manual});}return result;
}
// Keep every card accessible without scrolling. A very long logical column is
// laid out in adjacent segments; its group key still selects the whole column.
function fit(columns,viewport={}){
  const width=viewport.width||844;
  const left=Math.max(84,(viewport.left||0)+76),right=Math.max(12,viewport.right||0),bottom=Math.max(6,viewport.bottom||0);
  const cardHeight=52,step=14,capacity=6;
  const handHeight=cardHeight+(capacity-1)*step+6,segments=[];
  for(const column of columns)for(let offset=0;offset<column.cards.length;offset+=capacity){
    const cards=column.cards.slice(offset,offset+capacity);
    segments.push({key:cards[0],groupKey:column.cards[0],manual:column.manual,height:cardHeight+(cards.length-1)*step,cards:cards.map((id,index)=>({id,top:index*step}))});
  }
  const available=Math.max(80,width-left-right-8),count=Math.max(1,segments.length);
  const cardWidth=Math.min(44,Math.max(22,Math.floor((available-2*(count-1))/count)));
  const gap=count>1?Math.min(2,(available-cardWidth*count)/(count-1)):0;
  return {columns:segments,left,right,bottom,height:handHeight,cardHeight,cardWidth,gap,rankSize:cardWidth<26?9:cardWidth<32?11:cardWidth<38?14:15,suitSize:cardWidth<26?7:cardWidth<32?8:cardWidth<38?10:12};
}
module.exports=Object.assign({create},create(require('./guandan-cards')));
