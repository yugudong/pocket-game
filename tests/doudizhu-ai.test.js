'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../miniprogram/core/doudizhu-cards'),G=require('../miniprogram/core/doudizhu'),AI=require('../miniprogram/core/doudizhu-ai'),O=require('../miniprogram/core/doudizhu-observation');
const {publicModel,team}=require('../miniprogram/core/doudizhu-ai-public'),{inference,likelihood,shapeProfile}=require('../miniprogram/core/doudizhu-ai-belief'),{rollCircle}=require('../miniprogram/core/doudizhu-ai-circle'),{ending,searchSample,advance}=require('../miniprogram/core/doudizhu-ai-endgame'),{fragments}=require('../miniprogram/core/wire');
const id=(r,suit=0)=>r>=15?r+37:(r-2)*4+suit,group=(r,n)=>Array.from({length:n},(_,s)=>id(r,s)),shape=cards=>C.classify(cards)[0],old=require('../tools/fixtures/doudizhu-ai-1.6.5/doudizhu-ai');
function state(hands,landlord=0,turn=0){let s=G.create('p0','我','策略桌');for(let i=1;i<3;i++)G.addPlayer(s,'p'+i,'玩家'+i);assert.equal(new Set(hands.flat()).size,hands.flat().length);return Object.assign(s,{phase:'play',hands,landlord,turn,round:1,bid:1,bids:[1,0,0],bottom:[],last:null,passed:[],tablePlays:[null,null,null],publicHistory:[],played:Array.from({length:54},(_,i)=>i).filter(i=>!hands.flat().includes(i)),playCounts:[0,0,0],multiplier:1,moves:0});}
const act=(s,cmd)=>G.apply(s,s.players[s.turn].id,{...cmd,epoch:s.epoch});

test('public action history captures faced shape and before-counts, passes project, invalid actions do not record, legacy saves work',()=>{
  let s=state([[id(3),id(4)],[id(5),id(6)],[id(7),id(8)]]);s=act(s,{type:'play',cards:[id(3)]});s=act(s,{type:'pass'});const v=G.view(s,'p2'),events=O.events(v);assert.deepEqual(v.passed,[1]);assert.deepEqual(events[0].counts,[2,2,2]);assert.deepEqual(events[1].faced,shape([id(3)]));assert.deepEqual(events[1].cards,[]);
  assert.throws(()=>act(s,{type:'play',cards:[id(4)]}),/自己/);assert.equal(s.publicHistory.length,2);v.publicHistory[0][1].push(53);assert.deepEqual(s.publicHistory[0][1],[id(3)]);delete s.publicHistory;delete s.passed;assert.deepEqual(G.view(s,'p0').publicHistory,[]);assert.deepEqual(G.view(s,'p0').passed,[]);
});
test('maximal public history fits the UDP envelope and resets in the next deal and lobby',()=>{
  const s=state([[id(3)],[id(4)],[id(5)]]);for(let i=0;i<54;i++)for(let n=0;n<3;n++)s.publicHistory.push([i%3,n?[]:[i],n?null:['single',17,1],(i+2)%3,['single',17,1],[20,17,17]]);assert.equal(s.publicHistory.length,O.LIMIT);assert(fragments(G.view(s,'p0'),'a'.repeat(64),'b'.repeat(64),1).length<=96);s.phase='roundOver';s.turn=0;assert.deepEqual(act(s,{type:'next'}).publicHistory,[]);assert.deepEqual(G.view(act(s,{type:'again'}),'p0').publicHistory,[]);
});
test('bottom cards stay with the landlord in every possible deal, played bottom cards are removed, farmer cards are private',()=>{
  const s=state([[id(3),id(4)],[id(5),id(6)],[id(7),id(8)]],1);s.bottom=[id(5),id(6),id(14)];const v=G.view(s,'p0'),facts=publicModel(v,0);assert.deepEqual(facts.known[1],[id(5),id(6)]);const model=inference(v,0,facts);assert(model.samples().length);for(const p of model.samples()){assert.deepEqual(C.sorted(p.hands[1]),[id(5),id(6)]);assert.equal(new Set(p.hands.flat()).size,6);assert(!p.hands.flat().includes(id(14)));}assert.equal(v.hands,undefined);assert.equal(v.remainingHands,undefined);
});
test('single and reported-pair probabilities count mutually exclusive holdings exactly, including a rocket',()=>{
  const s=state([[id(3)],[id(14),id(15)],[id(16),id(4)]],1),v=G.view(s,'p0'),facts=publicModel(v,0);assert(Math.abs(facts.response({kind:'single',high:15,count:1},1,false)-5/6)<1e-12);
  const p=state([[id(3)],group(8,2),[id(15),id(16)]],1),m=publicModel(G.view(p,'p0'),0),combo={kind:'pair',high:7,count:2};assert(Math.abs(m.response(combo,1,false)-1/6)<1e-12);assert(Math.abs(m.response(combo,1,true)-2/6)<1e-12);
});
test('small deal spaces are enumerated without duplicate samples and preserve card counts',()=>{
  const s=state([[id(3)],[id(4),id(5)],[id(6),id(7)]],1),v=G.view(s,'p0'),deals=publicModel(v,0).deals(()=>.5);assert.equal(deals.length,6);assert.equal(new Set(deals.map(h=>h.map(row=>row.join(',')).join('|'))).size,6);for(const hands of deals){assert.deepEqual(hands.map(h=>h.length),[1,2,2]);assert.equal(new Set(hands.flat()).size,5);}
});
test('opponent passes are soft negative evidence; yielding to another farmer is neutral and bombs may be saved',()=>{
  const e={seat:1,owner:0,cards:[],faced:shape([id(8)]),counts:[8,2,8],later:[],age:0};const can=[id(14),id(5)],cannot=[id(3),id(4)];assert(likelihood(can,[e],0)<likelihood(cannot,[e],0));assert(Number.isFinite(likelihood(can,[e],0)));assert.equal(likelihood(can,[{...e,owner:2}],0),0);
  const six={...e,counts:[8,6,8]},bomb=[...group(3,4),id(4),id(5)],normal=[id(14),id(6),id(7),id(9),id(10),id(11)];assert(likelihood(bomb,[six],0)>likelihood(normal,[six],0));
});
test('subsequent public plays reconstruct an earlier hand and low single leads favor loose cards over splitting pairs',()=>{
  const e={seat:1,owner:0,cards:[],faced:shape([id(8)]),counts:[8,3,8],later:[id(14)],age:4};assert.equal(likelihood([id(3),id(4)],[e],0),likelihood([id(5),id(6)],[e],0));
  const lead={seat:1,owner:-1,cards:[id(3)],combo:shape([id(3)]),counts:[10,5,10],later:[],age:0};assert(likelihood([id(4),id(7),id(10),id(13)],[lead],0)>likelihood([id(3,1),...group(7,2),id(10)],[lead],0));
});
test('planning retains pairs after another physical suit was removed and handles airplane wings',()=>{
  const hand=[...group(3,4),...group(5,3),...group(6,3),...group(8,2),...group(9,2)],estimate=AI.planner(hand);assert.equal(estimate(hand.filter(id=>!group(3,2).includes(id))),2);assert.equal(estimate([...group(5,3),...group(6,3),...group(8,2),...group(9,2)]),1);assert.equal(AI.planner()([]),0);
});
test('cached planning preserves the established search decisions across full hands and candidate remainders',()=>{
  let seed=81;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};for(let n=0;n<6;n++){const deck=Array.from({length:54},(_,i)=>i);for(let i=53;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}const hand=C.sorted(deck.slice(0,n%2?17:20)),moves=C.moves(hand),cached=AI.planner(hand,moves),original=old.planner();assert.equal(cached(hand),original(hand));for(const m of moves.slice(0,24)){const left=hand.filter(id=>!m.cards.includes(id));assert.equal(cached(left),original(left));}}
});
test('a declined finishing pair reweights possible holdings and their pair structure without becoming a certainty',()=>{
  const s=state([[id(3)],group(8,2),[id(15),id(16)]],0),plain=G.view(s,'p0'),prior=inference(plain,0,publicModel(plain,0));s.publicHistory=[[1,[],null,0,['pair',7,2],[1,2,2]]];const v=G.view(s,'p0'),belief=inference(v,0,publicModel(v,0)),combo={kind:'pair',high:7,count:2};assert(belief.profile(1).pairs<prior.profile(1).pairs);assert(belief.response(combo,1)>0);assert(belief.response(combo,1)<prior.response(combo,1));assert(belief.samples().some(p=>p.weight!==belief.samples()[0].weight));
});
test('already-passed landlord does not provoke wasting a king over the other farmer',()=>{
  const s=state([[id(16),id(3),id(4),id(6)],[id(8),id(10)],[id(14)]],2);s.last={seat:1,cards:[id(5)],combo:shape([id(5)])};s.passed=[2];const v=G.view(s,'p0');assert.equal(AI.choose(v).type,'pass');assert.equal(old.choose(v).type,'play');
});
test('spend a certain controlling bomb for a two-play win instead of mechanically saving it',()=>{
  const s=state([[...group(4,4),...group(6,4)],[id(3),id(5),id(7)],[id(8),id(10),id(12)]]);s.last={seat:1,cards:[id(14)],combo:shape([id(14)])};const v=G.view(s,'p0'),cmd=AI.choose(v);assert.equal(cmd.type,'play');assert.equal(cmd.combo.kind,'bomb');assert.doesNotThrow(()=>act(s,cmd));assert.equal(old.choose(v).type,'pass');
});
test('a farmer who can finish in two pairs may take the low partner lead when the one-card landlord cannot interfere',()=>{
  const s=state([[...group(5,2),...group(7,2)],[...group(4,2),...group(6,2),...group(8,2),...group(10,2)],[id(16)]],2);s.last={seat:1,cards:group(3,2),combo:shape(group(3,2))};s.bottom=[id(16),id(14),id(15)];const v=G.view(s,'p0'),cmd=AI.choose(v);assert.equal(cmd.type,'play');assert.equal(cmd.combo.kind,'pair');assert.equal(old.choose(v).type,'pass');assert.doesNotThrow(()=>act(s,cmd));
});
test('avoid giving a reported pair an easy finish when a triple attachment can be led instead',()=>{
  const s=state([[...group(3,2),...group(7,3),id(9)],group(2,2),[id(4),id(6),id(8)]]),cmd=AI.choose(G.view(s,'p0'));assert.equal(cmd.type,'play');assert.notEqual(cmd.combo.kind,'pair');assert.doesNotThrow(()=>act(s,cmd));
});
test('the two-seat forecast distinguishes partner control before versus after landlord interception',()=>{
  const mine=[...group(3,2),id(4),id(10),id(12),id(14),id(15),id(16)],front=[...group(7,2),id(5)],back=[...group(9,2),id(6)],cmd={type:'play',cards:group(3,2),combo:shape(group(3,2))};
  let s=state([mine,front,back],1),v=G.view(s,'p0'),result=rollCircle(v,0,cmd,s.hands,s.hands.map(h=>shapeProfile(h)),C.moves);assert.equal(result.partnerCanTake,1);assert.equal(result.partnerReceives,1);assert.equal(result.partnerSafe,1);
  s=state([mine,front,back],2);v=G.view(s,'p0');result=rollCircle(v,0,cmd,s.hands,s.hands.map(h=>shapeProfile(h)),C.moves);assert.equal(result.partnerReceives,1);assert.equal(result.partnerSafe,0);assert.equal(result.teamControl,0);
});
test('forecast stops immediately when the landlord goes out, rather than inventing a later farmer reply',()=>{
  const s=state([[...group(3,2),id(4)],group(7,2),group(9,2)],1),v=G.view(s,'p0'),cmd={type:'play',cards:group(3,2),combo:shape(group(3,2))},result=rollCircle(v,0,cmd,s.hands,s.hands.map(h=>shapeProfile(h)),C.moves);assert.equal(result.enemyWin,1);assert.equal(result.partnerFinish,0);assert.equal(result.partnerReceives,0);
});
test('decision and weighted profiles survive cold serialization, hand permutation and injected hidden fields',()=>{
  let s=state([[id(3),id(4),id(12)],[id(5),id(6),id(14)],[id(7),id(8),id(16)]]);s=act(s,{type:'play',cards:[id(3)]});s=act(s,{type:'pass'});s=act(s,{type:'pass'});const v=G.view(s,'p0'),cold=JSON.parse(JSON.stringify(v)),m=inference(v,0,publicModel(v,0)),n=inference(cold,0,publicModel(cold,0));assert.deepEqual(m.profile(1),n.profile(1));assert(m.profile(1).confidence>0);assert.deepEqual(AI.choose(v),AI.choose({...cold,hand:cold.hand.slice().reverse(),hands:[[53],[52],[51]],secretDeal:[1,2]}));
});
test('bounded ending search agrees with the rule engine on a small forced farmer win',()=>{
  const s=state([[id(6),id(8)], [id(7)], [id(9)]],1),v=G.view(s,'p0'),commands=C.moves(v.hand).map(m=>({type:'play',...m}));
  function brute(state){if(state.phase==='roundOver')return state.result.winner===1?120:-120;const seat=state.turn,actions=C.moves(state.hands[seat],state.last&&state.last.combo).map(m=>({type:'play',...m}));if(state.last)actions.push({type:'pass'});const scores=actions.map(cmd=>brute(act(state,cmd)));return team(seat,state.landlord)===1?Math.max(...scores):Math.min(...scores);}
  const expected=commands.map(cmd=>brute(act(s,cmd))),result=searchSample({hands:s.hands,last:null,passed:[],turn:0},commands,1,1,10000,12);assert.deepEqual(result.scores,expected);assert(result.depth>=4);assert(result.nodes<=10000);
  for(const cmd of commands){const actual=act(s,cmd),child=advance({hands:s.hands,last:null,passed:[],turn:0},cmd);assert.deepEqual(child.hands,actual.hands);assert.equal(child.turn,actual.turn);}
});
test('ending node exhaustion returns a complete earlier layer for all candidates',()=>{
  const s=state([[id(6),id(8)],[id(7),id(10)],[id(9),id(11)]],1),commands=C.moves(s.hands[0]).map(m=>({type:'play',...m})),initial={hands:s.hands,last:null,passed:[],turn:0};const one=searchSample(initial,commands,1,1,100,1),cut=searchSample(initial,commands,1,1,commands.length+1,12);assert.equal(cut.depth,1);assert.deepEqual(cut.scores,one.scores);assert(cut.nodes<=commands.length+1);
});
test('ending overrides a losing lead for a clear farmer win but retains caller safeguards when already agreeing',()=>{
  const s=state([[id(6),id(8)],[id(7)],[id(9)]],1);s.bottom=[id(7),id(14),id(15)];const v=G.view(s,'p0'),model=inference(v,0,publicModel(v,0)),moves=C.moves(v.hand),ranked=moves.map((m,i)=>({m,score:i}));assert.equal(model.samples().length,1);assert.deepEqual(ending(v,0,ranked,model).cards,[id(8)]);const reversed=ranked.slice().reverse().map((row,i)=>({...row,score:i}));assert.equal(ending(v,0,reversed,model),null);
});
