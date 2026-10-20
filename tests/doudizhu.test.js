'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../miniprogram/core/doudizhu'),C=require('../miniprogram/core/doudizhu-cards'),AI=require('../miniprogram/core/doudizhu-ai');
function ids(ranks){const used={};return ranks.map(r=>{if(r>=15)return r===15?52:53;const n=used[r]||0;used[r]=n+1;assert(n<4);return (r-2)*4+n;});}
function start(random=()=>.3){let s=G.create('p','我','斗地主桌');for(const c of [{type:'fillBots'},{type:'ready',value:true},{type:'start'}])s=G.apply(s,'p',{...c,epoch:s.epoch},random);return s;}
function act(s,cmd,actor=s.players[s.turn].id){return G.apply(s,actor,{...cmd,epoch:s.epoch});}
function seed(value){return()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/0x100000000;};}
test('all classic shapes; wings compare body ranks, ordinary types/counts must match, bombs and rocket override',()=>{
  const samples={single:[3],pair:[4,4],triple:[5,5,5],tripleSingle:[6,6,6,3],triplePair:[7,7,7,4,4],straight:[10,11,12,13,14],pairs:[3,3,4,4,5,5],triples:[6,6,6,7,7,7],planeSingle:[3,3,3,4,4,4,8,8],planePair:[5,5,5,6,6,6,9,9,10,10],fourSingle:[8,8,8,8,9,9],fourPair:[10,10,10,10,3,3,6,6],bomb:[11,11,11,11],rocket:[15,16]};
  for(const [kind,ranks] of Object.entries(samples))assert(C.classify(ids(ranks)).some(c=>c.kind===kind),kind);
  const combo=r=>C.classify(ids(r))[0];assert(C.beats(combo([2]),combo([14])));assert(C.beats(combo([15]),combo([2])));assert(C.beats(combo([16]),combo([15])));assert(!C.beats(combo([4,4]),combo([3])));assert(!C.beats(combo([4,5,6,7,8,9]),combo([3,4,5,6,7])));assert(C.beats(combo([6,6,6,3]),combo([5,5,5,14])));assert(C.beats(combo([3,3,3,3]),combo([2])));assert(C.beats(combo([15,16]),combo([2,2,2,2])));assert(!C.beats(combo([15,16]),combo([15,16])));
});
test('reject invalid/deck-duplicate selections and illegal runs or attachments',()=>{
  for(const ranks of [[2,3,4,5,6],[11,12,13,14,2],[14,3,4,5,6],[3,3,4,4],[3,3,3,4,5],[3,3,3,3,4,4,4,5],[3,3,3,4,4,4,15,16],[5,5,5,5,15,16],[3,3,3,4,4,4,4,8]])assert.equal(C.classify(ids(ranks)).length,0,ranks.join(','));
  assert.deepEqual(C.classify([4,4]),[]);assert.deepEqual(C.classify([54]),[]);assert.deepEqual(C.classify([-1]),[]);
});
test('generated candidates agree with authoritative classification for seeded hands and targets',()=>{
  const random=seed(47);let checked=0;
  for(let n=0;n<35;n++){const deck=Array.from({length:54},(_,id)=>id);for(let i=53;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}const hand=deck.slice(0,n%2?17:20);
    for(const m of C.moves(hand)){assert.equal(new Set(m.cards).size,m.cards.length);assert(m.cards.every(id=>hand.includes(id)));assert(C.classify(m.cards).some(c=>C.key(c)===C.key(m.combo)),JSON.stringify(m));checked++;}
    const last={kind:'pair',high:9,count:2};assert(C.moves(hand,last).every(m=>C.beats(m.combo,last)));
  }assert(checked>500);
});
test('three seats, human replaces a bot only in lobby; host and readiness checks',()=>{
  let s=G.create('p','我','桌');s=G.apply(s,'p',{type:'fillBots',epoch:s.epoch});assert.equal(s.players.length,3);G.addPlayer(s,'q','好友');assert.equal(s.players[1].id,'q');G.addPlayer(s,'r','好友2');assert.equal(s.players.filter(p=>p.bot).length,0);assert.throws(()=>G.addPlayer(s,'x','第四位'),/三个座位/);assert.throws(()=>G.apply(s,'q',{type:'start',epoch:s.epoch}),/房主/);assert.throws(()=>G.apply(s,'p',{type:'start',epoch:s.epoch}),/准备/);assert.throws(()=>G.removePlayer(s,'p'),/房主/);
});
test('bid privacy, increasing scores, early three, all-pass fallback and 54-card conservation',()=>{
  let s=start();assert.equal(s.phase,'bid');assert.deepEqual(s.hands.map(h=>h.length),[17,17,17]);assert.equal(new Set(s.hands.flat().concat(s.bottom)).size,54);for(const p of s.players){const v=G.view(s,p.id);assert.equal(v.hand.length,17);assert.deepEqual(v.bottom,[]);assert.equal(v.hands,undefined);}
  assert.throws(()=>act(s,{type:'bid',value:1},s.players[(s.turn+1)%3].id),/轮到/);s=act(s,{type:'bid',value:1});assert.throws(()=>act(s,{type:'bid',value:1}),/更高/);const winner=s.turn;s=act(s,{type:'bid',value:3});assert.equal(s.landlord,winner);assert.equal(s.phase,'play');assert.equal(s.turn,winner);assert.equal(s.hands[winner].length,20);assert.deepEqual(G.view(s,'p').bottom,s.bottom);assert.equal(new Set(s.hands.flat()).size,54);
  let all=start();const first=all.bidStart;for(let i=0;i<3;i++)all=act(all,{type:'bid',value:0});assert.equal(all.landlord,first);assert.equal(all.bid,1);assert.equal(all.phase,'play');
});
test('passing twice returns lead; no lead pass, ownership, combo forgery, stale epoch and wrong turn rejected',()=>{
  let s=act(start(),{type:'bid',value:3});const owner=s.turn,owned=s.hands[owner][0];assert.throws(()=>act(s,{type:'pass'}),/领出/);assert.throws(()=>act(s,{type:'play',cards:[s.hands[(owner+1)%3][0]]}),/自己的手牌/);assert.throws(()=>act(s,{type:'play',cards:[owned],combo:{kind:'bomb',high:17,count:4}}),/压不过/);const epoch=s.epoch;s=act(s,{type:'play',cards:[owned]});assert.equal(s.tablePlays[owner].cards[0],owned);assert.throws(()=>G.apply(s,s.players[s.turn].id,{type:'pass',epoch}),/更新/);assert.throws(()=>act(s,{type:'pass'},s.players[owner].id),/轮到/);s=act(s,{type:'pass'});s=act(s,{type:'pass'});assert.equal(s.turn,owner);assert.equal(s.last,null);assert.deepEqual(s.tablePlays,[null,null,null]);
});
test('spring, reverse spring, bombs, zero-sum scores; next preserves totals and lobby reset is recoverable',()=>{
  let s=act(start(),{type:'bid',value:3});const l=s.landlord;s.hands[l]=ids([4,4,4,4]);s=act(s,{type:'play',cards:s.hands[l]});assert.equal(s.phase,'roundOver');assert.equal(s.result.spring,'春天');assert.equal(s.result.multiplier,4);assert.equal(s.result.deltas[l],24);assert.equal(s.result.deltas.reduce((a,b)=>a+b),0);const scores={...s.scores};s=act(s,{type:'next'},'p');assert.deepEqual(s.scores,scores);assert.equal(s.round,2);assert.equal(s.phase,'bid');
  s=act(s,{type:'bid',value:2});s=act(s,{type:'bid',value:0});s=act(s,{type:'bid',value:0});const landlord=s.landlord,farmer=(landlord+1)%3;s.playCounts[landlord]=1;s.turn=farmer;s.hands[farmer]=ids([8]);s.last=null;s=act(s,{type:'play',cards:s.hands[farmer]});assert.equal(s.result.spring,'反春天');assert.equal(s.result.winner,1);assert.equal(s.result.deltas[landlord],-8);s=act(s,{type:'again'},'p');assert.equal(G.view(s,'p').phase,'lobby');assert.deepEqual(G.view(s,'p').bottom,[]);
});
test('bots finish immediately, protect a farmer partner and block a one-card landlord with a high single',()=>{
  const players=[{id:'a',seat:0,count:3},{id:'b',seat:1,count:1},{id:'c',seat:2,count:8}],v={me:'a',turn:0,phase:'play',landlord:2,players,hand:ids([6,6,6]),last:{seat:2,combo:{kind:'triple',high:5,count:3}},played:[]};assert.deepEqual(AI.choose(v).cards,v.hand);
  v.hand=ids([6,8,10]);v.last={seat:1,combo:{kind:'single',high:3,count:1}};assert.equal(AI.choose(v).type,'pass');v.players[2].count=1;v.last.seat=2;v.hand=ids([7,12,16]);assert.equal(C.card(AI.choose(v).cards[0]).rank,16);
});
test('24 seeded complete bot games terminate, conserve all cards and keep private/public views separate',{timeout:60000},()=>{
  let commands=0,max=0,total=0,decisions=0;
  for(let n=1;n<=24;n++){let s=start(seed(n)),moves=0;while(s.phase!=='roundOver'){assert(++moves<260);const p=s.players[s.turn],v=G.view(s,p.id),at=Date.now(),cmd=AI.choose(v);const ms=Date.now()-at;max=Math.max(max,ms);total+=ms;decisions++;s=act(s,cmd,p.id);const visible=s.hands.flat().concat(s.played,s.phase==='bid'?s.bottom:[]);assert.equal(new Set(visible).size,54);assert.equal(visible.length,54);assert.equal(v.hands,undefined);}assert.equal(s.result.deltas.reduce((a,b)=>a+b),0);commands+=moves;}
  console.log('Dou Dizhu bots:',{games:24,commands,meanMs:Number((total/decisions).toFixed(2)),maxMs:max});
});
