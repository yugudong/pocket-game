'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../miniprogram/core/guandan-cards'),G=require('../miniprogram/core/guandan'),AI=require('../miniprogram/core/guandan-ai'),old=require('../tools/fixtures/guandan-ai-1.6.7/guandan-ai');
const {publicModel}=require('../miniprogram/core/guandan-ai-public'),{inference}=require('../miniprogram/core/guandan-ai-belief'),{retention}=require('../miniprogram/core/guandan-ai-retention'),fixtures=require('./fixtures/guandan-retention-regressions.json');
function view(seed){const s=fixtures[seed].state;return G.view(s,s.players[s.turn].id);}
function check(seed){const s=fixtures[seed].state,v=view(seed),cmd=AI.choose(v);assert.doesNotThrow(()=>G.apply(s,s.players[s.turn].id,{...cmd,epoch:s.epoch}));return cmd;}
function legalPartition(hand,level,estimate){const plan=estimate.partition(hand),flat=plan.flatMap(m=>m.cards);assert.equal(plan.length,estimate(hand));assert.equal(new Set(flat).size,flat.length);assert.deepEqual(flat.slice().sort((a,b)=>a-b),hand.slice().sort((a,b)=>a-b));for(const m of plan)assert(C.classify(m.cards,level).some(c=>C.key(c)===C.key(m.combo)));return plan;}
test('residual assessment uses the planner witness instead of inventing singles after 222 plus JJ',()=>{
  const v=view(1875),low=v.hand.filter(id=>[2,11].includes(C.card(id).rank)),left=v.hand.filter(id=>!low.includes(id)),estimate=AI.planner(v.level,v.hand),plan=legalPartition(left,v.level,estimate),r=retention(v,v.turn,inference(v,v.turn,publicModel(v,v.turn)),estimate),tail=r.after(left);
  assert.equal(plan.length,5);assert(plan.some(m=>m.combo.kind==='straight'&&m.combo.high===8));assert.equal(tail.turns,5);assert.equal(tail.weak,0);assert(tail.penalty<=0);assert.equal(old.choose(v).combo.high,13);const cmd=check(1875);assert.equal(cmd.combo.kind,'full');assert.equal(cmd.combo.high,2);
});
test('opening level-rank full house receives no spurious greedy regrouping reward',()=>{
  const v=view(1812),before=old.choose(v),after=check(1812);assert.equal(before.combo.kind,'full');assert.equal(before.combo.high,16);assert(!(after.combo.kind==='full'&&after.combo.high===16));
});
for(const [seed,kind,high] of [[1807,'full',16],[1814,'single',10],[1819,'single',18]])test('ordinary reply remains eligible despite reserve spending: replay '+seed,()=>{
  assert.equal(old.choose(view(seed)).type,'pass');const cmd=check(seed);assert.equal(cmd.type,'play');assert.equal(cmd.combo.kind,kind);assert.equal(cmd.combo.high,high);
});
test('having another bomb and high cards does not force passing on a big joker',()=>{
  const v=view(1819),cmd=check(1819),left=v.hand.filter(id=>!cmd.cards.includes(id)),r=retention(v,v.turn,inference(v,v.turn,publicModel(v,v.turn))),tail=r.after(left);assert(tail.controls>1);assert.equal(tail.shortfall,0);assert(tail.penalty<6);
});
test('recording actual layouts preserves established planner estimates and does not expose mutable cache objects',()=>{
  for(const seed of [1812,1819,1875]){const v=view(seed),a=AI.planner(v.level,v.hand),b=old.planner(v.level,v.hand),hands=[v.hand,...C.moves(v.hand,v.level).slice(0,48).map(m=>v.hand.filter(id=>!m.cards.includes(id)))];for(const hand of hands)assert.equal(a(hand),b(hand));for(const hand of hands){const plan=legalPartition(hand,v.level,a);if(plan.length){plan[0].cards.length=0;plan[0].combo.kind='invalid';}legalPartition(hand,v.level,a);assert.equal(a(hand),b(hand));}}
});
test('full-hand approximate retention adjustment stays below one turn of base scoring',()=>{
  const v=view(1875),r=retention(v,v.turn,inference(v,v.turn,publicModel(v,v.turn)));for(const m of C.moves(v.hand,v.level)){const result=r.after(v.hand.filter(id=>!m.cards.includes(id)));assert(result.penalty>=-4.5&&result.penalty<=7.5);}
});
test('new replay decisions remain deterministic and depend only on public views',()=>{
  const v=view(1875),before=JSON.stringify(v),cmd=AI.choose(v);assert.deepEqual(AI.choose({...JSON.parse(before),hand:v.hand.slice().reverse(),hands:[[107],[106],[105],[104]]}),cmd);assert.equal(JSON.stringify(v),before);
});
