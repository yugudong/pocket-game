'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../miniprogram/core/guandan-cards'),G=require('../miniprogram/core/guandan'),AI=require('../miniprogram/core/guandan-ai'),{publicModel}=require('../miniprogram/core/guandan-ai-public');
const {ending,searchSample}=require('../miniprogram/core/guandan-ai-endgame');
function id(rank,suit=0,deck=0){return deck*54+(rank>=15?rank+37:(rank-2)*4+suit);}
function group(rank,n){return Array.from({length:n},(_,i)=>id(rank,i%4,Math.floor(i/4)));}
function fixture(hands,{level=2,turn=0,last=null,finish=hands.flatMap((h,i)=>h.length?[]:[i]),passed=[],tributes=[],antiTribute=null}={}){
  let s=G.create('p0','我','策略桌');for(let i=1;i<4;i++)G.addPlayer(s,'p'+i,'玩家'+i);const held=hands.flat();assert.equal(new Set(held).size,held.length);
  return Object.assign(s,{phase:'play',hands,level,dealLevel:level,levels:[level,level],playingTeam:0,round:1,turn,last,tablePlays:[null,null,null,null],finish,passed,tributes,antiTribute,moves:0,played:Array.from({length:108},(_,i)=>i).filter(i=>!held.includes(i))});
}
function move(s){const cmd=AI.choose(G.view(s,'p'+s.turn));assert.doesNotThrow(()=>G.apply(s,'p'+s.turn,{...cmd,epoch:s.epoch}));return cmd;}
test('spend a controlling bomb to exit in two plays instead of passing away the lead',()=>{
  const s=fixture([[...group(3,5),...group(4,2)],group(9,3),group(8,3),group(13,3)],{last:{seat:1,cards:[id(14)],combo:C.classify([id(14)],2)[0]},passed:[2,3]}),cmd=move(s);assert.equal(cmd.combo.kind,'bomb');assert.equal(cmd.cards.length,5);
  assert.equal(require('../tools/fixtures/guandan-ai-1.6.2').choose(G.view(s,'p0')).type,'pass');
  let next=G.apply(s,'p0',{...cmd,epoch:s.epoch});for(const seat of [1,2,3])next=G.apply(next,'p'+seat,{type:'pass',epoch:next.epoch});assert.equal(next.turn,0);assert.deepEqual(move(next).cards,group(4,2));
});
test('when opponents report one card, lead a set without breaking the only bomb',()=>{
  const s=fixture([[...group(3,2),...group(7,4),id(9)],[id(16)],[id(8),id(8,1),id(12)],[id(13),id(13,1),id(10)]]),cmd=move(s);assert.notEqual(cmd.combo.kind,'single');assert(!cmd.cards.some(x=>C.card(x).rank===7)||cmd.combo.kind==='bomb');
});
test('choose alternate physical suits for a pair to retain a straight flush',()=>{
  const s=fixture([[id(3),id(4),id(5),id(6),id(7),id(3,1),id(3,2)],[id(14),id(13)],[id(12),id(10)],[id(11),id(9)]],{level:9,last:{seat:1,cards:[id(2),id(2,1)],combo:C.classify([id(2),id(2,1)],9)[0]}}),cmd=move(s);
  assert.equal(cmd.combo.kind,'pair');assert.deepEqual(cmd.cards.slice().sort((a,b)=>a-b),[id(3,1),id(3,2)]);
});
test('an opponent who already passed does not trigger an unnecessary overtake of the partner',()=>{
  const s=fixture([[id(16),id(3),id(4),id(5)],group(11,8),group(12,7),[id(14)]],{last:{seat:2,cards:[id(8)],combo:C.classify([id(8)],2)[0]},passed:[3]});assert.equal(move(s).type,'pass');
});
test('protect a partner against an active reported pair using enough control',()=>{
  const s=fixture([[...group(14,2),id(16),id(16,0,1),id(3)],[id(15),id(15,0,1)],[id(9),id(10),id(11)],[id(12),id(13)]],{last:{seat:2,cards:group(8,2),combo:C.classify(group(8,2),2)[0]}}),cmd=move(s);assert.equal(cmd.type,'play');assert.equal(cmd.combo.kind,'pair');assert(cmd.combo.high>=16);
});
test('take the partner wind without spending a king once the one-card opponent passed',()=>{
  const s=fixture([[id(16),id(3),id(4),id(5)],[id(12),id(11),id(10)],[],[id(14)]],{last:{seat:2,cards:[id(8)],combo:C.classify([id(8)],2)[0]},passed:[3]});assert.equal(move(s).type,'pass');
});
test('public king ownership is respected by sampled deals; played kings are not held twice',()=>{
  const s=fixture([[id(3),id(4)],[id(16)],[id(16,0,1)],[id(5),id(6)]],{antiTribute:{holders:[{seat:1,cards:[id(16)]},{seat:2,cards:[id(16,0,1)]}],lead:0}}),v=G.view(s,'p0'),model=publicModel(v,0);
  for(let i=0;i<12;i++){const sample=model.sampleHands(()=>i/12);assert.deepEqual(sample[1],[id(16)]);assert.deepEqual(sample[2],[id(16,0,1)]);assert.equal(new Set(sample.flat()).size,6);assert.equal(sample.flat().some(id=>v.played.includes(id)),false);}
  assert.equal(model.response(C.classify([id(14)],2)[0],1),1);assert.equal(model.response(C.classify([id(16)],2)[0],1),0);
  s.hands[1]=[];s.played.push(id(16));const after=publicModel(G.view(s,'p0'),0);assert.deepEqual(after.known[1],[]);
});
test('wildcards do not invent a joker pair and returned cards have their current public owner',()=>{
  const s=fixture([[id(15),id(15,0,1)],[id(16),id(7,1)],[id(5),id(6)],[id(8),id(9)]],{level:7,tributes:[{from:3,to:2,card:id(6),returnCard:id(8)}]}),model=publicModel(G.view(s,'p0'),0);assert.equal(model.response(C.classify(s.hands[0],7)[0],1),0);assert(model.known[2].includes(id(6)));assert(model.known[3].includes(id(8)));
});
test('partition estimates keep physical pairs after another suit is removed; all wildcards stay distinct',()=>{
  const hand=[...group(8,4),id(3),id(4),id(5),id(6),id(7),id(9,1),id(9,1,1)],estimate=AI.planner(9,hand);assert(estimate(hand)<=3);assert.equal(estimate([id(8,1),id(8,2)]),1);assert.equal(estimate([id(9,1),id(9,1,1)]),1);assert.equal(estimate([]),0);
});
test('ending decisions survive cold serialization, input permutation and fabricated hidden-hand fields',()=>{
  const s=fixture([[...group(3,4),id(4)],[id(14),id(14,1),id(9)],[id(8),id(8,1),id(12)],[id(13),id(13,1),id(10)]]),v=G.view(s,'p0'),before=JSON.stringify(v),cmd=AI.choose(v);
  assert.deepEqual(AI.choose(JSON.parse(before)),cmd);assert.deepEqual(AI.choose({...v,hand:v.hand.slice().reverse()}),cmd);assert.deepEqual(AI.choose({...v,hands:[[107],[106],[105],[104]],secretDeal:[1,2,3]}),cmd);assert.equal(JSON.stringify(v),before);
});
test('sampled team search rejects a low single that hands either opponent the first finish',()=>{
  const s=fixture([[id(3),id(16)],[id(14)],[id(8)],[id(13)]]),v=G.view(s,'p0'),model=publicModel(v,0),roots=C.moves(v.hand,2).map(m=>({m,score:0})),cmd=ending(v,0,roots,model);assert.deepEqual(cmd.cards,[id(16)]);
  assert.deepEqual(ending({...v,hand:v.hand.slice().reverse()},0,roots,publicModel(v,0)),cmd);assert.doesNotThrow(()=>G.apply(s,'p0',{...cmd,epoch:s.epoch}));
});
test('an unlikely but still possible higher bomb prevents claiming a guaranteed exit',()=>{
  const s=fixture([[...group(3,4),id(4)],group(8,4),group(9,4),group(10,4)]),v=G.view(s,'p0'),model=publicModel(v,0),bomb=C.classify(group(3,4),2).find(c=>c.kind==='bomb');assert.equal(model.unbeatable(bomb,[1,3]),false);
  assert.equal(model.unbeatable({kind:'jokers',high:99,count:4},[1,3]),true);
});
test('reported singles use the exact union of higher cards, including a certain loss',()=>{
  const s=fixture([[id(13),id(3)],[id(14)],[id(15)],[id(16)]]),v=G.view(s,'p0'),model=publicModel(v,0),king=C.classify([id(13)],2)[0];assert.equal(model.response(king,1),1);
  const small=C.classify([id(15)],2)[0];assert(Math.abs(model.response(small,1)-1/3)<1e-12);
});
test('reported pairs count mutually exclusive natural and wildcard combinations once',()=>{
  const s=fixture([[...group(8,2)],[id(14),id(14,1)],[id(7,1),id(7,1,1)],[id(15),id(15,0,1)]],{level:7}),v=G.view(s,'p0'),model=publicModel(v,0),combo=C.classify(group(8,2),7)[0];
  // From six cards: AA, four A+wild choices, wild+wild and the joker pair.
  assert(Math.abs(model.response(combo,1)-7/15)<1e-12);
});
test('wildcard substitutions preserve a natural bomb even when the straight has no gap',()=>{
  const hand=[...group(5,4),id(3),id(4,1),id(6,2),id(7,3),id(9,1)],s=fixture([hand,group(12,6),group(13,6),group(14,6)],{level:9}),cmd=move(s);
  const old=require('../tools/fixtures/guandan-ai-1.6.3/guandan-ai').choose(G.view(s,'p0'));assert.notDeepEqual(cmd,old);
  assert.equal(cmd.combo.kind,'straight');assert(cmd.cards.includes(id(9,1)));assert(!cmd.cards.some(x=>C.card(x).rank===5));
});
test('very small public deal spaces are exhaustive and larger samples are unique',()=>{
  const small=fixture([[id(3),id(4)],[id(14)],[id(15)],[id(16)]]),model=publicModel(G.view(small,'p0'),0),deals=model.deals(()=>0);assert.equal(deals.length,6);assert.equal(new Set(deals.map(h=>JSON.stringify(h))).size,6);
  const large=fixture([[id(3),id(4)],group(8,3),group(9,3),group(10,3)]);let seed=17;const sampled=publicModel(G.view(large,'p0'),0).deals(()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;});assert.equal(sampled.length,6);assert.equal(new Set(sampled.map(h=>JSON.stringify(h.map(cards=>cards.slice().sort((a,b)=>a-b))))).size,6);
});
test('a truncated search discards the entire incomplete depth rather than mixing root scores',()=>{
  const s=fixture([[id(3),id(16)],[id(14)],[id(8)],[id(13)]]),state={hands:s.hands,finish:[],last:null,passed:[],turn:0},roots=C.moves(s.hands[0],2).map(m=>({type:'play',...m}));
  const shallow=searchSample(state,roots,2,0,1000,1),truncated=searchSample(state,roots,2,0,roots.length+1,10);assert.equal(truncated.depth,1);assert.deepEqual(truncated.scores,shallow.scores);assert(truncated.nodes<=roots.length+1);
});
test('completed team search agrees with an exhaustive rule-engine oracle, including partner wind',()=>{
  const cases=[fixture([[id(3),id(16)],[id(14)],[id(8)],[id(13)]]),fixture([[id(3),id(16)],[id(14)],[],[id(13)]],{last:{seat:2,cards:[id(8)],combo:C.classify([id(8)],2)[0]},passed:[3]})];
  function commands(s){const out=C.moves(s.hands[s.turn],2).filter(m=>C.beats(m.combo,s.last&&s.last.combo)).map(m=>({type:'play',...m}));if(s.last)out.push({type:'pass'});return out;}
  function apply(s,cmd){return G.apply(s,'p'+s.turn,{...cmd,epoch:s.epoch});}
  function oracle(s,depth){if(s.result){const magnitude=s.result.upgrade===3?120:s.result.upgrade===2?105:90;return (s.result.winner===0?1:-1)*magnitude;}if(!depth)return (s.finish.length?(s.finish[0]%2===0?60:-60):0)+s.hands.reduce((n,h,seat)=>n+(seat%2?1:-1)*h.length*1.5,0)+(s.turn%2===0?2:-2);const values=commands(s).map(cmd=>oracle(apply(s,cmd),depth-1));return s.turn%2===0?Math.max(...values):Math.min(...values);}
  for(const s of cases){const roots=commands(s),state={hands:s.hands,finish:s.finish,last:s.last,passed:s.passed,turn:s.turn},searched=searchSample(state,roots,2,0,100000,6);assert.equal(searched.depth,6);assert.deepEqual(searched.scores,roots.map(cmd=>oracle(apply(s,cmd),5)));}
});
