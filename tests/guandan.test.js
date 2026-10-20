'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../miniprogram/core/guandan'),C=require('../miniprogram/core/guandan-cards'),AI=require('../miniprogram/core/guandan-ai');
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function id(r,s=0,d=0){return d*54+(r>=15?r+37:(r-2)*4+s);}
function group(r,n){return Array.from({length:n},(_,i)=>id(r,i%4,Math.floor(i/4)));}
function has(ids,kind,level=2){return C.classify(ids,level).find(c=>c.kind===kind);}
function start(seed=5){let s=G.create('p0','房主','掼蛋桌');for(let i=1;i<4;i++)G.addPlayer(s,'p'+i,'玩家'+i);s.players.forEach(p=>{p.ready=true;});return G.apply(s,'p0',{type:'start',epoch:s.epoch},rng(seed));}
function act(s,seat,command){return G.apply(s,s.players[seat].id,{...command,epoch:s.epoch});}
function fixture(hands,turn=0,level=2){const s=start();return Object.assign(s,{hands,turn,level,last:null,played:[],finish:[],passed:[]});}
test('all shapes, ace low/high, level ranking, wildcard joker restrictions and bomb hierarchy',()=>{
  assert(has([id(3),id(4),id(5),id(6),id(7)],'straight'));
  assert(has([id(14),id(2),id(3),id(4),id(5)],'flush'));
  assert(has([id(10),id(11),id(12),id(13),id(14)],'flush'));
  assert.equal(has([id(12),id(13),id(14),id(2),id(3)],'straight'),undefined);
  assert(has([...group(14,2),...group(2,2),...group(3,2)],'pairs'));
  assert(has([...group(14,3),...group(2,3)],'triples'));
  const ws=[id(7,1),id(7,1,1)];assert(has([id(3),id(4),...ws,id(7)],'flush',7));
  assert.equal(C.classify([id(15),ws[0]],7).length,0);
  assert(has([...group(5,3),id(15),id(15,-1,1)],'full',7));
  assert(has([...group(5,8),...ws],'bomb',7));
  const b4=has(group(14,4),'bomb'),b5=has(group(3,5),'bomb'),b6=has(group(3,6),'bomb'),flush=has([id(3),id(4),id(5),id(6),id(7)],'flush'),kings=has([id(15),id(16),id(15,-1,1),id(16,-1,1)],'jokers');
  assert(C.beats(b5,b4));assert(C.beats(flush,b5));assert(C.beats(b6,flush));assert(C.beats(kings,b6));assert(!C.beats(b6,kings));
  assert(C.beats(has([id(2)],'single'),has([id(14)],'single')));assert(C.beats(has([id(15)],'single'),has([id(2)],'single')));
  assert(!C.beats(has([id(7),id(8),id(9),id(10),id(11)],'straight',7),has([id(10),id(11),id(12),id(13),id(14)],'straight',7)));
});
test('candidate generator emits only physically owned legal cards across random hands and levels',()=>{
  const random=rng(8);for(let round=0;round<30;round++){const s=start(round+12),level=2+Math.floor(random()*13);for(const hand of s.hands)for(const m of C.moves(hand,level)){
    assert(m.cards.every(id=>hand.includes(id)));assert.equal(new Set(m.cards).size,m.cards.length);
    assert(C.classify(m.cards,level).some(c=>C.key(c)===C.key(m.combo)),JSON.stringify({m,level}));
  }}
});
test('turn enforcement, stale epoch, no skipping on lead, team wind and immediate double finish',()=>{
  let s=fixture([[id(6)],[id(4),id(8)],[id(3),id(7)],[id(5),id(9)]]);
  assert.throws(()=>act(s,1,{type:'play',cards:[id(4)]}),/轮到/);assert.throws(()=>act(s,0,{type:'pass'}),/领出/);
  assert.throws(()=>G.apply(s,'p0',{type:'play',cards:[id(6)],epoch:s.epoch-1}),/更新/);
  s=act(s,0,{type:'play',cards:[id(6)]});assert.deepEqual(s.finish,[0]);s=act(s,1,{type:'pass'});s=act(s,2,{type:'pass'});s=act(s,3,{type:'pass'});assert.equal(s.turn,2);assert.equal(s.last,null);
  s=act(s,2,{type:'play',cards:[id(3)]});s=act(s,3,{type:'pass'});s=act(s,1,{type:'pass'});assert.equal(s.turn,2);
  s=act(s,2,{type:'play',cards:[id(7)]});assert.equal(s.phase,'roundOver');assert.equal(s.result.upgrade,3);assert(s.result.double);assert.equal(s.level,5);
});
test('single/double tribute, anti-tribute, legal returns and 108-card conservation',()=>{
  for(const finish of [[0,1,2,3],[0,2,1,3]]){
    let s=start();s.finish=finish;s.phase='roundOver';s.level=5;s=act(s,0,{type:'next'});
    assert.equal(new Set(s.hands.flat()).size,108);
    if(s.phase==='tribute'){
      while(s.tributeStage==='give'){const n=s.turn,options=G.tributeOptions(s.hands[n],s.level),cmd=AI.choose(G.view(s,s.players[n].id));assert.equal(cmd.type,'tribute');assert(options.includes(cmd.card));s=act(s,n,cmd);assert.equal(new Set(s.hands.flat()).size,108);}
      const gifts=s.tributes.slice();assert.equal(gifts.length,finish[1]===2?2:1);for(const gift of gifts)assert(!C.wild(gift.card,5));
      while(s.phase==='tribute'){const n=s.turn,options=G.returnCards(s.hands[n],s.level);assert(options.length);const cmd=AI.choose(G.view(s,s.players[n].id));assert(options.includes(cmd.card));s=act(s,n,cmd);}
      assert(s.hands.every(h=>h.length===27));assert.equal(new Set(s.hands.flat()).size,108);assert.equal(s.turn,gifts[0].from);
    }
  }
  // A deterministic seed with both big jokers on the single tribute giver.
  let found=false;for(let seed=1;seed<200;seed++){let s=start();s.finish=[0,1,2,3];s.phase='roundOver';s=G.apply(s,'p0',{type:'next',epoch:s.epoch},rng(seed));if(s.phase==='play'){assert.equal(s.turn,0);assert.equal(s.tributes.length,0);assert.equal(s.hands[3].filter(id=>C.card(id).rank===16).length,2);found=true;break;}}assert(found);
});
test('level A must be played, partner third passes A; three failed A rounds reset to 2',()=>{
  let s=fixture([[],[],[id(3)],[id(4)]],2,14);s.finish=[0,1];s.playingTeam=0;s.levels=[14,8];s=act(s,2,{type:'play',cards:[id(3)]});assert.equal(s.phase,'matchOver');assert.equal(s.result.matchWinner,0);
  s=fixture([[],[],[id(3)],[id(4)]],3,14);s.finish=[0,1];s.playingTeam=0;s.levels=[14,8];s.attempts=[2,0];s=act(s,3,{type:'play',cards:[id(4)]});assert.equal(s.phase,'roundOver');assert.equal(s.levels[0],2);assert.equal(s.level,2);assert.equal(s.attempts[0],0);
});
test('bot seats can be replaced only in lobby, lobby permissions, private projections never expose other hands',()=>{
  let s=G.create('p0','我','房间');s=act(s,0,{type:'fillBots'});assert.equal(s.players.length,4);assert(s.players.slice(1).every(p=>p.bot&&p.ready));G.addPlayer(s,'friend','好友');assert.equal(s.players[1].id,'friend');assert.equal(s.players.length,4);
  assert.throws(()=>act(s,1,{type:'addBot'}),/房主/);assert.throws(()=>act(s,0,{type:'start'}),/准备/);
  s.players.forEach(p=>{p.ready=true;});s=act(s,0,{type:'start'});assert.throws(()=>G.addPlayer(s,'extra','新朋友'),/开始/);
  for(const p of s.players){const v=G.view(s,p.id);assert.equal(v.hand.length,27);assert.equal(v.hands,undefined);assert.equal(JSON.stringify(v).includes('"hands"'),false);assert.equal(v.players.reduce((n,p)=>n+p.count,0),108);}
});
test('AI finishes immediately, protects partner control and does not split kings for a routine single',()=>{
  let s=fixture([[id(4),id(5),id(6),id(7),id(8)],group(9,2),[id(10)],[id(11)]]);let cmd=AI.choose(G.view(s,'p0'));assert.equal(cmd.cards.length,5);
  s=fixture([[id(15),id(16),id(15,-1,1),id(16,-1,1),id(3),id(4)],group(5,4),[id(9),id(10)],[id(11),id(12)]]);s.last={seat:2,cards:[id(14)],combo:has([id(14)],'single')};cmd=AI.choose(G.view(s,'p0'));assert.equal(cmd.type,'pass');
  s=fixture([[id(15),id(16),id(15,-1,1),id(16,-1,1),id(3),id(4),id(5),id(6)],group(7,4),group(9,4),group(10,4)]);s.last={seat:1,cards:[id(14)],combo:has([id(14)],'single')};cmd=AI.choose(G.view(s,'p0'));assert.equal(cmd.type,'pass');
});
test('AI uses only fair projection: changing hidden enemy hands never changes the decision',()=>{
  let s=start(17);const actor=s.players[s.turn].id,v=G.view(s,actor),a=AI.choose(v);const other=(s.turn+1)%4,partner=(s.turn+2)%4;[s.hands[other],s.hands[partner]]=[s.hands[partner],s.hands[other]];assert.deepEqual(G.view(s,actor),v);assert.deepEqual(AI.choose(G.view(s,actor)),a);
});
test('AI guards an exposed partner single when an opponent has one card left',()=>{
  const s=fixture([[id(16),id(3),id(4),id(5)], [id(14)],[],[id(9),id(10),id(11)]]);s.finish=[2];s.last={seat:2,cards:[id(8)],combo:has([id(8)],'single')};const cmd=AI.choose(G.view(s,'p0'));assert.equal(cmd.type,'play');assert(cmd.combo.high>=16||C.strength(cmd.combo)>0);
});
test('four AI players complete seeded games through tribute, upgrading and card conservation',{timeout:120000},()=>{
  let maxMs=0,decisions=0;for(let seed=1;seed<=4;seed++){let s=start(seed*123),random=rng(seed*197);for(let round=0;round<3;round++){
    if(round)s=G.apply(s,'p0',{type:'next',epoch:s.epoch},random);let steps=0;
    while(s.phase==='play'||s.phase==='tribute'){
      assert(++steps<700,'game must make progress');const actor=s.players[s.turn].id,t=performance.now(),cmd=AI.choose(G.view(s,actor));maxMs=Math.max(maxMs,performance.now()-t);decisions++;s=G.apply(s,actor,{...cmd,epoch:s.epoch},random);
      const total=s.hands.flat().concat(s.played);assert.equal(total.length,108);assert.equal(new Set(total).size,108);
    }
    assert.equal(s.phase,'roundOver');assert.equal(new Set(s.finish).size,4);assert.equal(s.result.winner,s.finish[0]%2);
  }}console.log('Guandan AI decisions:',decisions,'maximum desktop decision:',Math.round(maxMs),'ms');
});
test('AI completes an entire match from 2 through A without hidden-hand access',{timeout:120000},()=>{
  let s=start(867),random=rng(888),rounds=1;while(s.phase!=='matchOver'){
    if(s.phase==='roundOver'){assert(++rounds<=40);s=G.apply(s,'p0',{type:'next',epoch:s.epoch},random);}
    else {const actor=s.players[s.turn].id,cmd=AI.choose(G.view(s,actor));s=G.apply(s,actor,{...cmd,epoch:s.epoch},random);}
  }assert.equal(s.level,14);assert([0,1].includes(s.result.matchWinner));console.log('Full Guandan match:',rounds,'rounds');
});
