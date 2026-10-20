'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const r=require('../miniprogram/core/avalon');
function room(n=5,config){const s=r.create('p0','玩家0','测试圆桌');for(let i=1;i<n;i++)r.addPlayer(s,'p'+i,'玩家'+i);if(config)s.config=config;s.players.forEach(p=>p.ready=true);return s;}
function act(s,id,type,extra={}){return r.apply(s,id,Object.assign({type,epoch:s.epoch},extra),()=>.42);}
function start(n=5,config){let s=act(room(n,config),'p0','start');for(const p of s.players)s=act(s,p.id,'seen');return act(s,'p0','begin');}
function mission(s,fails=0){const evil=s.players.filter(p=>r.ROLES[s.roles[p.id]].side==='evil'),good=s.players.filter(p=>r.ROLES[s.roles[p.id]].side==='good');
  const size=r.SIZES[s.players.length][s.quest];const team=evil.slice(0,fails).concat(good,evil.slice(fails)).slice(0,size).map(p=>p.id);
  s=act(s,s.players[s.leader].id,'propose',{team});const epoch=s.epoch;
  for(const p of s.players)s=r.apply(s,p.id,{type:'vote',epoch,approve:true});
  for(const id of team)s=act(s,id,'quest',{success:!evil.slice(0,fails).some(p=>p.id===id)});return s;
}
test('5–10 player decks, side counts, complete game to assassination and reveal',()=>{
  for(let n=5;n<=10;n++)for(const targetMerlin of [true,false]){
    let s=start(n);assert.equal(Object.values(s.roles).filter(x=>r.ROLES[x].side==='evil').length,r.EVILS[n]);
    for(let i=0;i<3;i++){s=mission(s);if(i<2)s=act(s,'p0','next');}
    assert.equal(s.phase,'assassinate');const assassin=s.players.find(p=>s.roles[p.id]==='assassin').id;
    const target=s.players.find(p=>targetMerlin?s.roles[p.id]==='merlin':s.roles[p.id]==='loyal').id;
    assert.equal(r.view(s,assassin).targets.length,n-r.EVILS[n]);s=act(s,assassin,'assassinate',{target});
    assert.equal(s.winner,targetMerlin?'evil':'good');assert.equal(r.view(s,'p0').revealed.length,n);
    s=act(s,'p0','again');assert.equal(s.phase,'lobby');assert.deepEqual(s.roles,{});assert(s.players.every(p=>!p.ready));assert.equal(r.view(s,'p0').private,null);
  }
});
test('3 failed quests end the game without assassination',()=>{let s=start();for(let i=0;i<3;i++){s=mission(s,1);if(i<2)s=act(s,'p0','next');}assert.equal(s.phase,'over');assert.equal(s.winner,'evil');});
test('strict majority, ties rejected, leader rotates, fifth rejection loses',()=>{
  let s=start(6),leader=s.leader;
  for(let i=0;i<5;i++){
    s=act(s,s.players[s.leader].id,'propose',{team:s.players.slice(0,2).map(p=>p.id)});const epoch=s.epoch;
    for(let j=0;j<6;j++)s=r.apply(s,'p'+j,{type:'vote',epoch,approve:j<3});
    if(i<4){assert.equal(s.phase,'team');assert.equal(s.leader,(leader+i+1)%6);}else{assert.equal(s.phase,'over');assert.equal(s.winner,'evil');}
  }
});
test('fourth quest has two-fail threshold only for 7+ players',()=>{
  for(let n=5;n<=10;n++)for(const fails of [1,2]){let s=start(n);s.quest=3;s=mission(s,fails);assert.equal(s.results[0].success,n>=7&&fails===1);}
});
test('private information for every role, including Mordred and Oberon',()=>{
  let s=start(10,{percival:true,morgana:true,mordred:true,oberon:true});
  for(const p of s.players){const v=r.view(s,p.id),role=s.roles[p.id],known=v.private.known.map(k=>s.roles[k.id]);
    assert.equal(v.roles,undefined);assert.equal(v.revealed,undefined);assert.equal(v.cards,undefined);assert.equal(v.votes,undefined);
    assert.equal(v.private.role,role);assert(!v.private.known.some(k=>k.id===p.id));
    if(role==='merlin'){assert(known.includes('oberon'));assert(!known.includes('mordred'));assert(known.includes('assassin'));}
    else if(role==='percival')assert.deepEqual(known.sort(),['merlin','morgana']);
    else if(role==='oberon'||role==='loyal')assert.deepEqual(known,[]);
    else {assert(!known.includes('oberon'));assert(known.every(x=>r.ROLES[x].side==='evil'));}
  }
});
test('votes and mission card choices are concealed until resolution',()=>{
  let s=start();s=act(s,s.players[s.leader].id,'propose',{team:s.players.slice(0,2).map(p=>p.id)});s=act(s,'p1','vote',{approve:false});
  const v=r.view(s,'p0');assert.equal(v.myVote,null);assert.equal(v.voteCount,1);assert.equal(v.history.length,0);
  for(const p of s.players.filter(p=>p.id!=='p1'))s=act(s,p.id,'vote',{approve:true});assert.equal(s.history[0].votes.p1,false);
  s=act(s,s.team[0],'quest',{success:true});const q=r.view(s,s.team[1]);assert.equal(q.cardCount,1);assert.equal(q.submitted,false);assert.equal(q.myCard,undefined);assert.equal(q.cards,undefined);
});
test('authority, stale epoch, duplicate inputs, good sabotage and malformed teams rejected atomically',()=>{
  let s=start();const old=JSON.stringify(s);assert.throws(()=>act(s,'p1','next'));assert.throws(()=>r.apply(s,'p0',{type:'propose',epoch:s.epoch-1,team:[]}));assert.equal(JSON.stringify(s),old);
  const captain=s.players[s.leader].id;assert.throws(()=>act(s,captain,'propose',{team:['p0','p0']}));
  const good=s.players.find(p=>r.ROLES[s.roles[p.id]].side==='good').id;
  s=act(s,captain,'propose',{team:[good,s.players.find(p=>p.id!==good).id]});const voteEpoch=s.epoch;s=act(s,'p0','vote',{approve:true});assert.throws(()=>act(s,'p0','vote',{approve:true}));
  for(const p of s.players.filter(p=>p.id!=='p0'))s=act(s,p.id,'vote',{approve:true});assert.throws(()=>r.apply(s,'p1',{type:'vote',epoch:voteEpoch,approve:true}));
  assert.throws(()=>act(s,good,'quest',{success:false}));assert.throws(()=>act(s,'stranger','quest',{success:true}));
});
test('configuration must fit counts, readiness and identity confirmation required',()=>{
  let s=room();s.players[1].ready=false;assert.throws(()=>act(s,'p0','start'));s.players[1].ready=true;
  s=act(s,'p0','config',{key:'mordred',value:true});assert(s.players.every(p=>!p.ready));s.players.forEach(p=>p.ready=true);assert.throws(()=>act(s,'p0','start'));
  s=act(room(),'p0','start');assert.throws(()=>act(s,'p0','begin'));assert.throws(()=>act(s,'p1','begin'));
  assert.throws(()=>r.addPlayer(s,'p6','迟到的人'));assert.throws(()=>r.removePlayer(s,'p1'));
});
module.exports={room,start,act,mission};
