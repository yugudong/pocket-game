'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../miniprogram/core/guandan'),C=require('../miniprogram/core/guandan-cards'),AI=require('../miniprogram/core/guandan-ai'),old=require('../tools/fixtures/guandan-ai-1.6.9/guandan-ai');
const {controlPlays}=require('../miniprogram/core/guandan-ai-lead'),{planner}=require('../miniprogram/core/guandan-ai-planner');
const id=(r,s=0,d=0)=>d*54+(r>=15?r+37:(r-2)*4+s),pair=r=>[id(r),id(r,1)];
function fixture(hand,options={}){
  const hands=[hand,[id(9),id(10),id(11),id(12)],[id(13),id(13,1),id(6,1),id(6,2)],[id(14),id(14,1),id(10,1),id(11,1)]],held=hands.flat();assert.equal(new Set(held).size,held.length);
  let s=G.create('p0','我','保留普通控牌');for(let i=1;i<4;i++)G.addPlayer(s,'p'+i,'玩家'+i);
  return Object.assign(s,{phase:'play',hands,level:2,dealLevel:2,levels:[2,2],playingTeam:0,round:1,turn:0,last:null,passed:[],tablePlays:[null,null,null,null],finish:[],moves:0,played:Array.from({length:108},(_,i)=>i).filter(i=>!held.includes(i))},options);
}
function choose(s){const cmd=AI.choose(G.view(s,'p0'));assert.doesNotThrow(()=>G.apply(s,'p0',{...cmd,epoch:s.epoch}));return cmd;}
const aces=[id(14,2),id(14,3)];
for(const [name,item] of Object.entries(require('./fixtures/guandan-control-leads.json')))test('public-view replay retains the ordinary stopper: '+name,()=>{
  const s=item.state,v=G.view(s,s.players[s.turn].id),prior=old.choose(v),cmd=AI.choose(v);assert.deepEqual(prior,item.command);assert.notDeepEqual(cmd.cards,prior.cards);assert(!cmd.cards.some(id=>prior.cards.includes(id)));assert.doesNotThrow(()=>G.apply(s,v.me,{...cmd,epoch:s.epoch}));
});
test('lead a low pair before the controlling AA pair, even though no loose singles remain',()=>{
  const s=fixture([...pair(3),...pair(5),...aces]),v=G.view(s,'p0');assert.deepEqual(old.choose(v).cards,aces);const cmd=choose(s);assert.equal(cmd.combo.kind,'pair');assert(cmd.combo.high<14);
});
test('lead a low pair before a big joker instead of burning single control ahead of small pairs',()=>{
  const s=fixture([...pair(3),...pair(5),id(16)]);assert.deepEqual(old.choose(G.view(s,'p0')).cards,[id(16)]);assert.equal(choose(s).combo.kind,'pair');
});
test('short ending search cannot split the high pair to override equally efficient low singles',()=>{
  const s=fixture([id(3),id(5),...aces]),v=G.view(s,'p0');assert.equal(old.choose(v).combo.high,14);const cmd=choose(s);assert.equal(cmd.combo.kind,'single');assert(cmd.combo.high<14);
});
test('one ordinary winning card before a single remaining group is a valid two-play exit',()=>{
  const s=fixture([id(3),id(16)]);assert.deepEqual(choose(s).cards,[id(16)]);
});
test('a whole-hand ordinary pair is played immediately',()=>{assert.deepEqual(choose(fixture(aces)).cards,aces);});
test('a necessary following single may spend the big joker to recover the lead',()=>{
  const s=fixture([id(3),id(5),id(16)],{last:{seat:1,cards:[id(15)],combo:{kind:'single',high:17,count:1}},passed:[2,3]});s.hands[1]=[id(14)];s.played=Array.from({length:108},(_,i)=>i).filter(i=>!s.hands.flat().includes(i));assert.deepEqual(choose(s).cards,[id(16)]);
});
test('a necessary following pair may spend AA to recover the lead',()=>{
  const s=fixture([...pair(3),...pair(5),...aces],{last:{seat:1,cards:pair(12),combo:{kind:'pair',high:12,count:2}},passed:[2,3]});assert.deepEqual(choose(s).cards,aces);
});
test('following a low pair, use the small legal pair before AA rather than chasing an uncontested circle',()=>{
  const s=fixture([...pair(5),...pair(7),...aces],{last:{seat:1,cards:pair(4),combo:{kind:'pair',high:4,count:2}},passed:[2,3]});assert.deepEqual(old.choose(G.view(s,'p0')).cards,aces);const cmd=choose(s);assert.equal(cmd.combo.kind,'pair');assert(cmd.combo.high<14);
});
test('necessary reported-single defense still spends the big joker',()=>{
  const s=fixture([id(3),id(5),id(7),id(16)]);s.hands[1]=[id(14)];s.played=Array.from({length:108},(_,i)=>i).filter(i=>!s.hands.flat().includes(i));assert.deepEqual(choose(s).cards,[id(16)]);
});
function example(){
  const v=G.view(fixture([...pair(3),...pair(5),...aces]),'p0'),estimate=planner(v.level,v.hand),circle={enemyFirst:0,enemyFinish:0,partnerFinish:0,partnerSafe:0},rows=[aces,pair(3)].map(cards=>{const m={cards,combo:C.classify(cards,v.level)[0]},left=v.hand.filter(id=>!cards.includes(id));return {m,left,turns:estimate(left),shapeDamage:0,exit:false,circle:{...circle}};}),model={response:combo=>combo.high>=14?0:1,couldFinish:()=>false};return {v,rows,model,estimate};
}
test('ordinary re-entry assessment excludes bombs from the response probability',()=>{
  const e=example(),calls=[];e.model.response=(combo,seat,bombs)=>{calls.push(bombs);return combo.high>=14?0:1;};assert.deepEqual(controlPlays(e.v,0,e.rows,e.model,e.estimate),[e.rows[1]]);assert(calls.length);assert(calls.every(x=>x===false));
});
for(const [name,mutate] of [
  ['extra remaining hand',e=>e.rows[1].turns++],
  ['additional shape damage',e=>e.rows[1].shapeDamage++],
  ['enemy first finish',e=>e.rows[1].circle.enemyFirst=1],
  ['enemy later finish',e=>e.rows[1].circle.enemyFinish=1],
  ['clear partner finish',e=>e.rows[0].circle.partnerFinish=1],
  ['partner safe control',e=>e.rows[0].circle.partnerSafe=1],
  ['whole-hand enemy reply',e=>e.model.couldFinish=combo=>combo.high<14],
  ['only ordinary control remains',e=>e.model.response=()=>0]
])test('retain the high lead when the alternative has '+name,()=>{const e=example();mutate(e);assert(controlPlays(e.v,0,e.rows,e.model,e.estimate).includes(e.rows[0]));});
test('control lead selection is deterministic, immutable and ignores fabricated hidden hands',()=>{
  const s=fixture([...pair(3),...pair(5),...aces]),v=G.view(s,'p0'),before=JSON.stringify(v),cmd=AI.choose(v);assert.deepEqual(AI.choose({...JSON.parse(before),hand:v.hand.slice().reverse(),hands:[[107],[106],[105],[104]]}),cmd);assert.equal(JSON.stringify(v),before);
});
