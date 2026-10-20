'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../miniprogram/core/guandan'),C=require('../miniprogram/core/guandan-cards'),AI=require('../miniprogram/core/guandan-ai'),D=require('../miniprogram/core/doudizhu');
const {definition}=require('../miniprogram/core/guandan-page');
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function act(s,seat,command){return G.apply(s,s.players[seat].id,{...command,epoch:s.epoch});}
function next(seed,finish=[0,1,2,3]){let s=G.create('p0','房主','测试桌');for(let i=1;i<4;i++)G.addPlayer(s,'p'+i,'玩家'+i);s.players.forEach(p=>p.ready=true);s=act(s,0,{type:'start'});s.phase='roundOver';s.finish=finish;s.level=5;return G.apply(s,'p0',{type:'next',epoch:s.epoch},rng(seed));}
function find(predicate,finish){for(let seed=1;seed<1000;seed++){const s=next(seed,finish);if(predicate(s))return s;}throw new Error('fixture not found');}
function page(s,seat=0){const def=definition(true),p={...def,data:JSON.parse(JSON.stringify(def.data)),alive:true,visible:true,setData(patch){Object.assign(this.data,patch);}};let state=s;const status=()=>({mode:'host',game:'guandan',connected:true,busy:false,view:{...G.view(state,state.players[seat].id),players:G.view(state,state.players[seat].id).players.map(p=>({...p,online:true}))}});p.session={status,invitation:()=>null};p.render(status());return {p,status,update(s){state=s;p.render(status());}};}
function conserved(s){assert.equal(s.hands.flat().length,108);assert.equal(new Set(s.hands.flat()).size,108);}
test('giver selects an actual highest-card suit, rejects others, preserves cards through both exchanges and cold serialization',()=>{
  let s=find(s=>s.tributeStage==='give');const giver=s.turn,options=G.tributeOptions(s.hands[giver],s.level),before=JSON.parse(JSON.stringify(s.hands));assert(new Set(options.map(id=>C.card(id).suit)).size>1);
  assert.throws(()=>act(s,(giver+1)%4,{type:'tribute',card:options[0]}),/轮到/);assert.throws(()=>act(s,giver,{type:'tribute',card:s.hands[giver].find(id=>!options.includes(id))}),/最大/);assert.throws(()=>G.apply(s,s.players[giver].id,{type:'tribute',card:options[0],epoch:s.epoch-1}),/更新/);
  for(let seat=0;seat<4;seat++){const v=G.view(s,'p'+seat);assert.equal(v.remainingHands,undefined);assert.equal(v.hands,undefined);assert.equal(!!v.tributeOptions,seat===giver);}
  s=JSON.parse(JSON.stringify(s));assert.deepEqual(s.hands,before);const picked=options.at(-1);s=act(s,giver,{type:'tribute',card:picked});assert.equal(s.tributeStage,'return');const gift=s.tributes[0];assert.equal(gift.card,picked);assert(!s.hands[giver].includes(picked));assert(s.hands[gift.to].includes(picked));conserved(s);
  const returned=G.returnCards(s.hands[gift.to],s.level)[0];s=act(s,gift.to,{type:'return',card:returned});assert.equal(s.phase,'play');assert.equal(s.tributes[0].returnCard,returned);assert(s.hands[giver].includes(returned));assert(s.hands.every(h=>h.length===27));conserved(s);
});
test('double tribute waits for all suit choices and sends the stronger gift to head finisher',()=>{
  let s=find(s=>s.tributeStage==='give',[0,2,1,3]),before=JSON.parse(JSON.stringify(s.hands));
  while(s.tributeStage==='give'){const giver=s.turn,cmd=AI.choose(G.view(s,s.players[giver].id));assert.equal(cmd.type,'tribute');assert(G.tributeOptions(s.hands[giver],s.level).includes(cmd.card));s=act(s,giver,cmd);if(s.tributeStage==='give')assert.deepEqual(s.hands,before);conserved(s);}
  assert.equal(s.tributes.length,2);assert.equal(s.tributes[0].to,0);assert.equal(s.tributes[1].to,2);assert(C.power(C.card(s.tributes[0].card).rank,s.level)>=C.power(C.card(s.tributes[1].card).rank,s.level));
  while(s.phase==='tribute'){const seat=s.turn,cmd=AI.choose(G.view(s,s.players[seat].id));assert.equal(cmd.type,'return');s=act(s,seat,cmd);conserved(s);}
  assert(s.tributes.every(g=>Number.isInteger(g.returnCard)));assert(s.hands.every(h=>h.length===27));
});
test('anti-tribute publishes exactly the two dealt big jokers and holders, with one holder or split holders',()=>{
  for(const [finish,count] of [[[0,1,2,3],1],[[0,2,1,3],2]]){
    const s=find(s=>s.antiTribute&&s.antiTribute.holders.length===count,finish);assert.equal(s.phase,'play');assert.equal(s.turn,finish[0]);assert.deepEqual(s.tributes,[]);
    for(const holder of s.antiTribute.holders){assert(holder.cards.every(id=>C.card(id).rank===16&&s.hands[holder.seat].includes(id)));}
    for(const player of s.players){const v=G.view(s,player.id);assert.equal(v.antiTribute.holders.flatMap(h=>h.cards).length,2);assert.equal(v.remainingHands,undefined);}
    const {p,status}=page(s);assert(p.data.roundInfoOpen);assert.equal(p.data.roundInfoTitle,'本副抗贡');assert.equal(p.data.antiHolders.length,count);assert(p.data.antiHolders.every(h=>h.name&&h.cards.every(c=>c.label==='大王')));p.closeRoundInfo();p.render(status());assert(!p.data.roundInfoOpen);p.showRoundInfo();assert(p.data.roundInfoOpen);
  }
});
test('tribute UI chooses one eligible suit, sends it, displays exact gift and return cards, and marks received cards',async()=>{
  let s=find(s=>s.tributeStage==='give');const giver=s.turn,{p,update}=page(s,giver),options=p.data.exchangeOptions;let sent;p.action=cmd=>sent=cmd;
  p.selectCard({currentTarget:{dataset:{id:s.hands[giver].find(id=>!options.includes(id))}}});assert.deepEqual(p.data.selected,[]);
  for(const id of options.slice(0,2))p.selectCard({currentTarget:{dataset:{id}}});assert.deepEqual(p.data.selected,[options[1]]);p.play();assert.deepEqual(sent,{type:'tribute',card:options[1]});s=act(s,giver,sent);update(s);assert(p.data.roundInfoOpen);assert.equal(p.data.tributeRows[0].card.id,options[1]);
  const receiver=s.turn,{p:receiving}=page(s,receiver);assert.equal(receiving.data.handColumns.flatMap(c=>c.cards).find(c=>c.id===options[1]).exchangeMark,'贡');
  const returned=G.returnCards(s.hands[receiver],s.level)[0];s=act(s,receiver,{type:'return',card:returned});update(s);assert.equal(p.data.tributeRows[0].returnCard.id,returned);assert.equal(p.data.handColumns.flatMap(c=>c.cards).find(c=>c.id===returned).exchangeMark,'还');
});
test('only round or match end reveals all remaining hands; next round and lobby hide them again',()=>{
  let s=next(3);while(s.phase==='tribute'){const seat=s.turn;s=act(s,seat,AI.choose(G.view(s,s.players[seat].id)));}s.hands=[[],[4,5],[],[58,59,60]];s.finish=[0,2,1,3];s.phase='roundOver';s.result={winner:0,double:true,finish:s.finish,upgrade:3};s.level=8;
  for(const phase of ['roundOver','matchOver']){s.phase=phase;for(const player of s.players){const v=G.view(s,player.id);assert.deepEqual(v.remainingHands,s.hands.map(h=>C.sorted(h,5)));v.remainingHands[1].pop();assert.equal(s.hands[1].length,2);}const {p}=page(s);assert.equal(p.data.remainingRows.length,4);assert.equal(p.data.remainingRows.find(p=>p.id==='p1').count,2);assert.equal(p.data.remainingRows.find(p=>p.id==='p1').role,'双下');assert(p.data.remainingRows[0].count>0);assert(!p.data.canArrange);}
  s.phase='roundOver';const restarted=act(s,0,{type:'next'});assert.equal(G.view(restarted,'p0').remainingHands,undefined);s=act(s,0,{type:'again'});assert.equal(G.view(s,'p0').remainingHands,undefined);
  let d=D.create('p0','地主','斗地主');for(let i=1;i<3;i++)D.addPlayer(d,'p'+i,'农民'+i);d.players.forEach(p=>p.ready=true);d=D.apply(d,'p0',{type:'start',epoch:d.epoch},rng(1));assert.equal(D.view(d,'p0').remainingHands,undefined);d=D.apply(d,d.players[d.turn].id,{type:'bid',value:3,epoch:d.epoch});assert.equal(D.view(d,'p0').remainingHands,undefined);d.hands=[[0],[4,8],[]];d.phase='roundOver';
  for(const player of d.players){const v=D.view(d,player.id);assert.deepEqual(v.remainingHands,[[0],[4,8],[]]);v.remainingHands[0].pop();assert.equal(d.hands[0].length,1);}d=D.apply(d,'p0',{type:'next',epoch:d.epoch});assert.equal(D.view(d,'p0').remainingHands,undefined);
});
