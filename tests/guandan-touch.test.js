'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../miniprogram/core/guandan'),Touch=require('../miniprogram/core/guandan-touch'),{definition}=require('../miniprogram/core/guandan-page');
function setup(){
  let state=G.create('p','玩家','滑动桌');for(const cmd of [{type:'fillBots'},{type:'ready',value:true},{type:'start'}])state=G.apply(state,'p',{...cmd,epoch:state.epoch},()=>.3);
  state.turn=0;state.hands[0]=[0,54,1,4,8,12,16,20];
  const d=definition(true),p={...d,data:JSON.parse(JSON.stringify(d.data)),alive:true,visible:true,viewport:{width:844,height:390},setData(patch){Object.assign(this.data,patch);}};
  const status=()=>({mode:'host',game:'guandan',connected:true,busy:false,message:'',view:G.view(state,'p')});p.session={status,invitation:()=>null};p.render(status());
  return {p,state,status};
}
const event=point=>({touches:[{clientX:point.x,clientY:point.y}]});
function rects(p){return Touch.rectangles(p.data.handLayout,p.data.handColumns,p.viewport);}
function point(p,id,header=false){const r=rects(p).find(r=>r.id===id);return {x:(r.left+r.right)/2,y:header?r.top+5:r.bottom-10};}
function row(p){return p.data.handColumns.map(c=>c.cards[c.cards.length-1].id);}
function finish(p,at){p.endSwipe({touches:[],changedTouches:event(at).touches});}

test('fast horizontal stroke paints every crossed card once, reversal preserves selection, and the next tap works',()=>{
  const {p}=setup(),ids=row(p),first=point(p,ids[0]),last=point(p,ids[ids.length-1]);
  p.startSwipe(event(first));p.moveSwipe(event(last));assert.deepEqual(p.data.selected,ids);
  p.moveSwipe(event(first));assert.deepEqual(p.data.selected,ids);finish(p,first);
  p.selectCard({currentTarget:{dataset:{id:ids[0]}}});assert.deepEqual(p.data.selected,ids); // Ignore any native tap emitted by this stroke.
  p.startSwipe(event(first));finish(p,first);p.selectCard({currentTarget:{dataset:{id:ids[0]}}});assert(!p.data.selected.includes(ids[0]));
  p.clear();p.startSwipe(event(first));finish(p,last);assert.deepEqual(p.data.selected,ids); // Fast stroke with only start/end events.
});
test('starting on a selected card erases crossed cards without affecting untouched selections',()=>{
  const {p}=setup(),ids=row(p),extra=p.data.handColumns.find(c=>c.cards.length>1).cards[0].id;
  p.setData({selected:ids.concat(extra)});p.render(p.session.status());const first=point(p,ids[0]),last=point(p,ids[ids.length-1]);
  p.startSwipe(event(first));p.moveSwipe(event(last));p.moveSwipe(event(first));finish(p,first);assert.deepEqual(p.data.selected,[extra]);
});
test('vertical stroke selects exposed cards rather than the hidden cards underneath, with long press still selecting a group',()=>{
  const {p}=setup(),column=p.data.handColumns.find(c=>c.cards.length===3),ids=column.cards.map(c=>c.id),top=point(p,ids[0],true),bottom=point(p,ids[2]);
  assert.equal(Touch.hit(top,rects(p)),ids[0]);assert.equal(Touch.hit(point(p,ids[1],true),rects(p)),ids[1]);assert.equal(Touch.hit(bottom,rects(p)),ids[2]);
  p.startSwipe(event(top));p.moveSwipe(event(bottom));finish(p,bottom);assert.deepEqual(p.data.selected,ids);
  p.clear();p.startSwipe(event(top));p.selectColumn({currentTarget:{dataset:{id:column.groupKey}}});finish(p,top);p.selectCard({currentTarget:{dataset:{id:ids[0]}}});assert.deepEqual(p.data.selected,ids);
});
test('stationary touch preserves tap behavior; empty space, multitouch and hidden cards do not paint',()=>{
  const {p}=setup(),id=row(p)[0],at=point(p,id);p.startSwipe(event(at));p.moveSwipe(event({x:at.x+2,y:at.y}));finish(p,at);assert.equal(p.data.selected.length,0);
  p.selectCard({currentTarget:{dataset:{id}}});assert.deepEqual(p.data.selected,[id]);p.clear();
  p.startSwipe(event({x:0,y:0}));p.moveSwipe(event({x:0,y:100}));finish(p,{x:0,y:100});assert.equal(p.data.selected.length,0);
  p.startSwipe({touches:[event(at).touches[0],event(at).touches[0]]});assert.equal(p.swipe,null);p.toggleHand();p.startSwipe(event(at));assert.equal(p.swipe,null);
});
test('hand changes, rotation, background and cancellation terminate stale gestures safely',()=>{
  const {p,state,status}=setup(),ids=row(p),first=point(p,ids[0]),last=point(p,ids[ids.length-1]);p.startSwipe(event(first));
  state.epoch++;p.render(status());assert(p.swipe); // Other players/presence updates preserve the gesture.
  state.hands[0]=state.hands[0].filter(id=>id!==ids[0]);state.epoch++;p.render(status());assert.equal(p.swipe,null);p.moveSwipe(event(last));assert.equal(p.data.selected.length,0);
  const next=point(p,row(p)[0]);p.startSwipe(event(next));global.wx={};p.onResize({size:{windowWidth:667,windowHeight:375}});assert.equal(p.swipe,null);
  p.startSwipe(event(point(p,row(p)[0])));p.cancelSwipe();assert.equal(p.swipe,null);p.startSwipe(event(point(p,row(p)[0])));p.onHide();assert.equal(p.swipe,null);assert(p.data.hideHand);
});
test('tribute strokes keep only one eligible return card and never select ineligible cards',()=>{
  const {p}=setup(),v={...p.data.view,phase:'tribute',returnOptions:[4,8],returnTo:2,turn:0},status={...p.session.status(),view:v};p.session.status=()=>status;p.render(status);
  const ids=row(p),first=point(p,ids[0]),last=point(p,ids[ids.length-1]);p.startSwipe(event(first));p.moveSwipe(event(last));finish(p,last);
  assert.deepEqual(p.data.selected,[8]);assert.equal(Touch.hit(point(p,0),rects(p)),null);
});
