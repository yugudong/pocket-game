'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../miniprogram/core/guandan-cards'),G=require('../miniprogram/core/guandan'),AI=require('../miniprogram/core/guandan-ai'),old=require('../tools/fixtures/guandan-ai-1.6.6/guandan-ai');
const {publicModel}=require('../miniprogram/core/guandan-ai-public'),{inference}=require('../miniprogram/core/guandan-ai-belief'),{retention}=require('../miniprogram/core/guandan-ai-retention');
const id=(r,s=0,d=0)=>d*54+(r>=15?r+37:(r-2)*4+s),group=(r,n)=>Array.from({length:n},(_,i)=>id(r,i%4,Math.floor(i/4)));
function fixture(hand,others=[[id(9),id(10),id(11),id(12)],[id(13),id(13,1),id(6,1),id(6,2)],[id(14),id(14,1),id(10,1),id(11,1)]],options={}){
  const hands=[hand,...others],held=hands.flat();assert.equal(new Set(held).size,held.length);let s=G.create('p0','我','残局留牌');for(let i=1;i<4;i++)G.addPlayer(s,'p'+i,'玩家'+i);
  return Object.assign(s,{phase:'play',hands,level:2,dealLevel:2,levels:[2,2],playingTeam:0,round:1,turn:0,last:null,passed:[],tablePlays:[null,null,null,null],finish:[],moves:0,played:Array.from({length:108},(_,i)=>i).filter(i=>!held.includes(i))},options);
}
function choose(s){const v=G.view(s,'p0'),cmd=AI.choose(v);assert.doesNotThrow(()=>G.apply(s,'p0',{...cmd,epoch:s.epoch}));return cmd;}
function reserve(s){const v=G.view(s,'p0');return retention(v,0,inference(v,0,publicModel(v,0)));}
test('lead a loose low single before the only bomb instead of leaving two stranded singles',()=>{
  const s=fixture([...group(8,4),id(3),id(5)]),cmd=choose(s);assert.equal(old.choose(G.view(s,'p0')).combo.kind,'bomb');assert.equal(cmd.combo.kind,'single');assert([id(3),id(5)].includes(cmd.cards[0]));
});
test('do not lead a big joker ahead of three weak singles even when the small ending search is active',()=>{
  const s=fixture([id(3),id(5),id(7),id(16)]),v=G.view(s,'p0'),cmd=choose(s);assert(v.players.reduce((n,p)=>n+p.count,0)<=16);assert.deepEqual(old.choose(v).cards,[id(16)]);assert.equal(cmd.combo.kind,'single');assert.notEqual(cmd.cards[0],id(16));
});
test('a bomb plus a king does not justify spending the king while small singles can be shed first',()=>{
  const s=fixture([...group(8,4),id(3),id(5),id(16)]),cmd=choose(s);assert.deepEqual(old.choose(G.view(s,'p0')).cards,[id(16)]);assert.equal(cmd.combo.kind,'single');assert([id(3),id(5)].includes(cmd.cards[0]));
});
test('retain a high pair while several low singles still need a route out',()=>{
  const s=fixture([id(14,2),id(14,3),id(3),id(5),id(8)]),cmd=choose(s);assert.equal(old.choose(G.view(s,'p0')).combo.kind,'pair');assert.equal(cmd.combo.kind,'single');assert(C.card(cmd.cards[0]).rank<14);
});
test('in a quiet middle game pass rather than spend the last bomb against an ordinary pair',()=>{
  const s=fixture([...group(8,4),id(3),id(5)],[[id(9),id(10),id(12),id(13),id(14),id(16)],group(7,6),[id(9,1),id(10,1),id(12,1),id(13,1),id(14,1),id(15)]],{last:{seat:1,cards:[id(14,2),id(14,3)],combo:{kind:'pair',high:14,count:2}},passed:[2,3]});assert.equal(old.choose(G.view(s,'p0')).type,'play');assert.equal(choose(s).type,'pass');
});
test('lead the safe ordinary group and retain the controlling bomb for the finish',()=>{
  let s=fixture([...group(8,4),id(3)]),cmd=choose(s);assert.deepEqual(cmd.cards,[id(3)]);s=G.apply(s,'p0',{...cmd,epoch:s.epoch});for(const seat of [1,2,3])s=G.apply(s,'p'+seat,{type:'pass',epoch:s.epoch});assert.equal(choose(s).combo.kind,'bomb');
});
test('protect a partner lead from an active reported single instead of preserving the big joker',()=>{
  const s=fixture([id(3),id(5),id(7),id(16)],[[id(14)],[],[id(9),id(10),id(12)]],{finish:[2],passed:[3],last:{seat:2,cards:[id(13)],combo:{kind:'single',high:13,count:1}}});assert.deepEqual(choose(s).cards,[id(16)]);
});
test('the reported-single defense remains unchanged by the new reserve penalty',()=>{
  const s=fixture([...group(8,4),id(3),id(5)],[[id(14)],group(7,4),[id(16)]],{passed:[2,3],last:{seat:1,cards:[id(2),id(2,2)],combo:{kind:'pair',high:16,count:2}}});assert.deepEqual(choose(s),old.choose(G.view(s,'p0')));
});
test('a complete low run is not counted as five isolated weak singles',()=>{
  const s=fixture([id(3),id(4),id(5),id(6),id(7),id(16)]),r=reserve(s);assert.equal(r.assess(s.hands[0]).weak,0);assert.equal(r.after(s.hands[0].filter(x=>x!==id(16))).penalty,0);
});
test('joker bomb and its individual kings are not counted as overlapping independent stoppers',()=>{
  const s=fixture([id(15),id(15,0,1),id(16),id(16,0,1),id(3),id(5)]),r=reserve(s),before=r.assess(s.hands[0]),after=r.after([id(3),id(5)]);assert(before.weak>1);assert(Math.abs(before.controls-1)<1e-12);assert.equal(after.controls,0);assert(after.spent>.9);assert(after.penalty>10);
});
test('a straight flush remains a re-entry reserve even when an ordinary straight of the same cards is weak',()=>{
  const run=[id(3),id(4),id(5),id(6),id(7)],s=fixture([...run,id(9,2),id(11,3)]),v=G.view(s,'p0');v.players[1].count=8;v.players[3].count=8;const model={response:combo=>combo.kind==='flush'||combo.high>=16?0:1},r=retention(v,0,model);assert.equal(r.assess(v.hand).controls,1);assert(r.after([id(9,2),id(11,3)]).penalty>15);
});
test('shedding a low singleton does not incorrectly count the retained bomb as spent',()=>{
  const s=fixture([...group(8,4),id(3),id(5)]),r=reserve(s),next=r.after(s.hands[0].filter(x=>x!==id(3)));assert(next.controls>.8);assert.equal(next.spent,0);assert(next.penalty<=0);
});
test('one wildcard may pair one loose card, but cannot hide every remaining singleton at once',()=>{
  const s=fixture([id(3),id(5),id(6),id(9,1)],undefined,{level:9,dealLevel:9}),r=reserve(s);assert(r.assess(s.hands[0]).weak>1.05);
});
test('small cards whose higher ordinary rivals are all gone are not treated as stranded weak cards',()=>{
  const s=fixture([...group(10,4),id(5),id(7)],[group(3,4),group(4,4),group(3,8).slice(4)]);assert.equal(reserve(s).assess(s.hands[0]).weak,0);
});
test('reserve evaluation and chosen move use public views only and survive cold restore and card permutation',()=>{
  const s=fixture([...group(8,4),id(3),id(5)]),v=G.view(s,'p0'),cold=JSON.parse(JSON.stringify(v)),before=JSON.stringify(v),cmd=AI.choose(v);assert.deepEqual(AI.choose({...cold,hand:cold.hand.slice().reverse(),hands:[[107],[106],[105],[104]]}),cmd);assert.equal(JSON.stringify(v),before);const a=reserve(s).after([id(3),id(5)]),model=inference(cold,0,publicModel(cold,0));assert.deepEqual(retention(cold,0,model).after([id(5),id(3)]),a);
});
