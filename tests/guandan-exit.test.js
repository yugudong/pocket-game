'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../miniprogram/core/guandan-cards'),G=require('../miniprogram/core/guandan'),AI=require('../miniprogram/core/guandan-ai'),{publicModel}=require('../miniprogram/core/guandan-ai-public'),{closingPlan}=require('../miniprogram/core/guandan-ai-exit');
const id=(r,s=0,d=0)=>d*54+(r>=15?r+37:(r-2)*4+s),group=(r,n)=>Array.from({length:n},(_,i)=>id(r,i%4,Math.floor(i/4)));
function fixture(hands,options={}){let s=G.create('p0','我','收尾桌');for(let i=1;i<4;i++)G.addPlayer(s,'p'+i,'玩家'+i);const held=hands.flat();assert.equal(new Set(held).size,held.length);return Object.assign(s,{phase:'play',hands,level:2,dealLevel:2,levels:[2,2],playingTeam:0,round:1,turn:0,last:null,passed:[],tablePlays:[null,null,null,null],finish:[],moves:0,played:Array.from({length:108},(_,i)=>i).filter(i=>!held.includes(i))},options);}
function choose(s){const cmd=AI.choose(G.view(s,'p0'));assert.doesNotThrow(()=>G.apply(s,'p0',{...cmd,epoch:s.epoch}));return cmd;}
function apply(s,seat,cmd){return G.apply(s,'p'+seat,{...cmd,epoch:s.epoch});}
test('different ordinary counts: lead the pair, finish on the bomb, and give partner wind',()=>{
  let s=fixture([[...group(8,6),...group(3,2)],group(14,3),group(7,3),group(10,3)]),cmd=choose(s);assert.equal(cmd.combo.kind,'pair');s=apply(s,0,cmd);for(const seat of [1,2,3])s=apply(s,seat,{type:'pass'});cmd=choose(s);assert.equal(cmd.combo.kind,'bomb');s=apply(s,0,cmd);for(const seat of [1,2,3])s=apply(s,seat,{type:'pass'});assert.deepEqual(s.finish,[0]);assert.equal(s.turn,2);
});
test('a possible whole higher pair requires the bomb before the final low pair',()=>{
  const s=fixture([[...group(8,6),...group(3,2)],group(14,2),group(7,3),group(10,3)]),cmd=choose(s);assert.equal(cmd.combo.kind,'bomb');assert.equal(cmd.cards.length,6);
});
test('matching counts alone do not trigger bombing when no whole higher pair is possible',()=>{
  const s=fixture([[...group(8,6),...group(3,2)],[id(14),id(13)],[id(7),id(9)],[id(10),id(11)]]),v=G.view(s,'p0'),m=publicModel(v,0);assert.equal(m.couldFinish(C.classify(group(3,2),2)[0],1),false);assert.equal(choose(s).combo.kind,'pair');
});
test('an enemy whole bomb can finish despite a count mismatch, so first take control with the larger bomb',()=>{
  const s=fixture([[...group(8,6),...group(3,2)],group(14,4),group(7,3),group(10,3)]),m=publicModel(G.view(s,'p0'),0);assert.equal(m.couldFinish(C.classify(group(3,2),2)[0],1),true);assert.equal(choose(s).combo.kind,'bomb');
});
test('when following, use the safe ordinary group if it beats the table',()=>{
  const s=fixture([[...group(8,6),...group(6,2)],group(14,3),group(7,3),group(10,3)],{last:{seat:1,cards:group(3,2),combo:C.classify(group(3,2),2)[0]},passed:[2,3]});assert.equal(choose(s).combo.kind,'pair');
});
test('two bombs: lead the weaker one and keep the strongest for the final wind',()=>{
  const s=fixture([[...group(8,6),...group(3,4)],group(14,3),group(7,3),group(10,3)]),cmd=choose(s);assert.equal(cmd.combo.kind,'bomb');assert.equal(cmd.cards.length,4);
});
test('do not bias toward bombing if the same enemy whole bomb defeats both routes',()=>{
  const s=fixture([[...group(5,4),id(3),id(4,1),id(6,2),id(7,3),id(9,1)],group(12,6),group(13,6),group(14,6)],{level:9}),v=G.view(s,'p0'),m=publicModel(v,0),straight={cards:[id(3),id(4,1),id(9,1),id(6,2),id(7,3)],combo:{kind:'straight',high:7,count:5}},p=closingPlan(v,0,[straight],m);assert.equal(p.proven,null);assert.equal(p.bias.size,0);assert.equal(choose(s).combo.kind,'straight');
});
test('public exact card ownership can rule out a whole-hand response and cold views cannot reveal hidden hands',()=>{
  const s=fixture([[...group(8,6),...group(3,2)],[id(14),id(13)],[id(14,1),id(13,1)],[id(10),id(11)]],{tributes:[{from:3,to:1,card:id(14),returnCard:id(10)},{from:2,to:1,card:id(13)}]}),v=G.view(s,'p0'),m=publicModel(v,0);assert.equal(m.couldFinish(C.classify(group(3,2),2)[0],1),false);const cmd=choose(s);assert.equal(cmd.combo.kind,'pair');assert.deepEqual(AI.choose({...JSON.parse(JSON.stringify(v)),hand:v.hand.slice().reverse(),hands:[[107],[106],[105],[104]]}),cmd);
});
test('host defaults a same-suit run to flush but accepts an explicit ordinary straight',()=>{
  const run=[3,4,5,6,7].map(r=>id(r)),s=fixture([run,group(14,3),group(8,3),group(10,3)]),plain=C.classify(run,2).find(c=>c.kind==='straight');assert.equal(apply(s,0,{type:'play',cards:run}).last.combo.kind,'flush');assert.equal(apply(s,0,{type:'play',cards:run,combo:plain}).last.combo.kind,'straight');assert.equal(choose(s).combo.kind,'flush');
});
test('default wildcard flush uses its highest legal interpretation',()=>{
  const run=[3,4,5,6].map(r=>id(r)).concat(id(9,1)),s=fixture([run,group(14,3),group(8,3),group(10,3)],{level:9}),cmd=choose(s);assert.equal(cmd.combo.kind,'flush');assert.equal(cmd.combo.high,7);assert.equal(apply(s,0,{type:'play',cards:run}).last.combo.high,7);
});
