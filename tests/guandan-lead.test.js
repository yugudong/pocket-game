'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../miniprogram/core/guandan'),C=require('../miniprogram/core/guandan-cards'),AI=require('../miniprogram/core/guandan-ai'),old=require('../tools/fixtures/guandan-ai-1.6.8/guandan-ai'),cases=require('./fixtures/guandan-bomb-leads.json');
const id=(r,s=0,d=0)=>d*54+(r>=15?r+37:(r-2)*4+s),group=(r,n)=>Array.from({length:n},(_,i)=>id(r,i%4,Math.floor(i/4)));
function fixture(hand,options={}){const hands=[hand,[id(10),id(11),id(12),id(13)],[id(14),id(10,1),id(11,1),id(12,1)],[id(13,1),id(14,1),id(10,2),id(11,2)]];let s=G.create('p0','我','普通牌先走');for(let i=1;i<4;i++)G.addPlayer(s,'p'+i,'玩家'+i);const held=hands.flat();assert.equal(new Set(held).size,held.length);return Object.assign(s,{phase:'play',hands,turn:0,round:1,level:2,dealLevel:2,levels:[2,2],playingTeam:0,finish:[],last:null,passed:[],tablePlays:[null,null,null,null],played:Array.from({length:108},(_,i)=>i).filter(i=>!held.includes(i))},options);}
function choose(s){const v=G.view(s,s.players[s.turn].id),cmd=AI.choose(v);assert.doesNotThrow(()=>G.apply(s,s.players[s.turn].id,{...cmd,epoch:s.epoch}));return cmd;}
for(const n of [4,5,6,7,8,9,10])test(n+'-card bomb: lead a loose ordinary card and retain the bomb for re-entry',()=>{
  const natural=group(8,Math.min(n,8)),bomb=natural.concat(n>8?[id(9,1)]:[],n>9?[id(9,1,1)]:[]),s=fixture(bomb.concat(id(3),id(5)),{level:n>8?9:2}),cmd=choose(s);assert.equal(C.strength(cmd.combo),0);if(n<=8){assert.equal(cmd.combo.kind,'single');assert([id(3),id(5)].includes(cmd.cards[0]));}assert(!cmd.cards.some(id=>natural.includes(id)));assert(C.moves(s.hands[0].filter(id=>!cmd.cards.includes(id)),s.level).some(m=>m.combo.kind==='bomb'&&m.cards.length>=Math.min(n,8)));
});
for(const [name,item] of Object.entries(cases).filter(([name])=>!name.startsWith('unavoidable')))test('recorded wasteful lead now starts with an ordinary group: '+name,()=>{
  const s=item.state,v=G.view(s,s.players[s.turn].id),prior=old.choose(v),cmd=choose(s);assert.equal(prior.combo.kind,'bomb');assert.equal(prior.cards.length,5);assert.equal(C.strength(cmd.combo),0);
});
test('a possible seven-card enemy bomb that beats our four-card bomb is not a reason to lead it',()=>{
  const s=cases.unavoidable2653.state,v=G.view(s,s.players[s.turn].id);assert.equal(old.choose(v).combo.kind,'bomb');assert.equal(old.choose(v).cards.length,4);assert.equal(C.strength(choose(s).combo),0);
});
test('recorded four-card opening bomb also yields to an ordinary group',()=>{
  const s=require('./fixtures/guandan-retention-regressions.json')['1812'].state,v=G.view(s,s.players[s.turn].id);assert.equal(old.choose(v).combo.kind,'bomb');assert.equal(old.choose(v).cards.length,4);assert.equal(C.strength(choose(s).combo),0);
});
test('retain a straight flush while shedding an ordinary card without reinterpreting its cards as a straight',()=>{
  const run=[8,9,10,11,12].map(r=>id(r,3)),s=fixture(run.concat(id(3),id(5))),cmd=choose(s);assert.equal(C.strength(cmd.combo),0);assert(!cmd.cards.some(id=>run.includes(id)));
});
test('the sole whole-hand bomb still finishes immediately',()=>{const s=fixture(group(8,5)),cmd=choose(s);assert.equal(cmd.combo.kind,'bomb');assert.equal(cmd.cards.length,5);});
test('when following, a bomb can still recover the lead for a two-play finish',()=>{
  const s=fixture(group(8,5).concat(group(3,2)),{last:{seat:1,cards:group(14,2),combo:{kind:'pair',high:14,count:2}},passed:[2,3]}),cmd=choose(s);assert.equal(cmd.combo.kind,'bomb');
});
test('two complete bombs still allow the weaker bomb first and the stronger bomb last',()=>{
  const s=fixture(group(8,5).concat(group(3,4))),cmd=choose(s);assert.equal(cmd.combo.kind,'bomb');assert.equal(cmd.cards.length,4);
});
test('ordinary lead priority does not hand an opponent a whole single finish',()=>{
  const s=fixture(group(8,4).concat(id(3)));s.hands[1]=[id(14)];s.played=Array.from({length:108},(_,i)=>i).filter(i=>!s.hands.flat().includes(i));assert.equal(choose(s).combo.kind,'bomb');
});
test('ordinary priority preserves disjoint bombs, cold views and public information boundaries',()=>{
  const s=cases.self2629.state,v=G.view(s,s.players[s.turn].id),before=JSON.stringify(v),cmd=AI.choose(v);assert.deepEqual(AI.choose({...JSON.parse(before),hand:v.hand.slice().reverse(),hands:[[107],[106],[105],[104]]}),cmd);assert.equal(JSON.stringify(v),before);const retained=s.hands[s.turn].filter(id=>!cmd.cards.includes(id));assert(C.moves(retained,s.level).some(m=>m.combo.kind==='bomb'&&m.cards.length===5));
});
