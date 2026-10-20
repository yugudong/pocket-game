'use strict';
// Identical deals and landlord assignments; swap the challenger between the
// one landlord and BOTH farmers. Fixed bidding isolates play quality.
const path=require('node:path'),G=require('../miniprogram/core/doudizhu'),current=process.argv[5]?require(path.resolve(process.argv[5])):require('../miniprogram/core/doudizhu-ai'),old=require(path.resolve(process.argv[3]||'tools/fixtures/doudizhu-ai-1.6.5/doudizhu-ai.js'));
const pairs=Number(process.argv[2]||30),offset=Number(process.argv[4]||0),rng=s=>()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;},roles={landlord:{games:0,wins:0},farmers:{games:0,wins:0}},timings=[];let wins=0,netUnits=0;
for(let seed=offset+1;seed<=offset+pairs;seed++)for(let side=0;side<2;side++){
  let s=G.create('p0','玩家0','策略对照');for(let i=1;i<3;i++)G.addPlayer(s,'p'+i,'玩家'+i);s.players.forEach(p=>{p.ready=true;});s=G.apply(s,'p0',{type:'start',epoch:s.epoch},rng(seed*1009));const landlord=seed%3;
  while(s.phase==='bid')s=G.apply(s,s.players[s.turn].id,{type:'bid',value:s.turn===landlord?3:0,epoch:s.epoch});let steps=0;
  while(s.phase==='play'){
    if(++steps>260)throw Error('No progress');const actor=s.players[s.turn].id,smart=(s.turn===landlord?0:1)===side,start=performance.now(),cmd=(smart?current:old).choose(G.view(s,actor));if(smart)timings.push(performance.now()-start);s=G.apply(s,actor,{...cmd,epoch:s.epoch});
  }
  const won=s.result.winner===side,row=roles[side===0?'landlord':'farmers'];row.games++;if(won){row.wins++;wins++;}netUnits+=(won?1:-1)*s.result.multiplier;process.stdout.write('.');
}
timings.sort((a,b)=>a-b);console.log('\n'+JSON.stringify({challenger:process.argv[5]||'current',opponent:process.argv[3]||'1.6.5',seedOffset:offset,seedPairs:pairs,games:pairs*2,wins,winRate:Number((wins/pairs/2*100).toFixed(2)),roles,netUnits,decisions:timings.length,averageMs:Number((timings.reduce((a,b)=>a+b,0)/timings.length).toFixed(2)),p95Ms:Number(timings[Math.floor(timings.length*.95)].toFixed(2)),maxMs:Number(timings[timings.length-1].toFixed(2))},null,2));
