'use strict';
// Reproducible paired deals; team parity is reversed for each seed.
const G=require('../miniprogram/core/guandan'),C=require('../miniprogram/core/guandan-cards'),AI=process.argv[6]?require(require('node:path').resolve(process.argv[6])):require('../miniprogram/core/guandan-ai');
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function baseline(v){const me=v.players.findIndex(p=>p.id===v.me),moves=C.moves(v.hand,v.level).filter(m=>C.beats(m.combo,v.last&&v.last.combo));if(!moves.length)return {type:'pass'};const finish=moves.find(m=>m.cards.length===v.hand.length);if(finish)return {type:'play',...finish};if(v.last&&v.last.seat%2===me%2)return {type:'pass'};moves.sort((a,b)=>v.last?(C.strength(a.combo)-C.strength(b.combo)||a.combo.count-b.combo.count||a.combo.high-b.combo.high):(b.cards.length-a.cards.length||C.strength(a.combo)-C.strength(b.combo)||a.combo.high-b.combo.high));return {type:'play',...moves[0]};}
const opponent=process.argv[3]?require(require('node:path').resolve(process.argv[3])).choose:baseline;
const seeds=Number(process.argv[2]||12),offset=Number(process.argv[4]||0),mixed=process.argv[5]==='mixed';let wins=0,games=0,points=0,decisions=0,totalMs=0,maxMs=0;const timings=[];
for(let seed=1;seed<=seeds;seed++)for(let smartTeam=0;smartTeam<2;smartTeam++){
  let s=G.create('p0','玩家0','基准');for(let n=1;n<4;n++)G.addPlayer(s,'p'+n,'玩家'+n);s.players.forEach(p=>{p.ready=true;});s=G.apply(s,'p0',{type:'start',epoch:s.epoch},rng((seed+offset)*1009));if(mixed){s.level=2+(seed+offset-1)%13;s.levels=[s.level,s.level];s.dealLevel=s.level;}let steps=0;
  while(s.phase==='play'){
    if(++steps>700)throw new Error('No progress');const actor=s.players[s.turn].id,v=G.view(s,actor),t=performance.now(),smart=s.turn%2===smartTeam,cmd=smart?AI.choose(v):opponent(v),elapsed=performance.now()-t;
    if(smart){decisions++;totalMs+=elapsed;maxMs=Math.max(maxMs,elapsed);timings.push(elapsed);}s=G.apply(s,actor,{...cmd,epoch:s.epoch});
  }
  games++;if(s.result.winner===smartTeam){wins++;points+=s.result.upgrade;}else points-=s.result.upgrade;
  process.stdout.write('.');
}
timings.sort((a,b)=>a-b);
console.log('\n'+JSON.stringify({challenger:process.argv[6]||'current',opponent:process.argv[3]||'simple',seedOffset:offset,levels:mixed?'2-A':'2',seedPairs:seeds,games,wins,winRate:Math.round(wins/games*100)+'%',netUpgrade:points,decisions,averageMs:Math.round(totalMs/decisions*100)/100,p95Ms:Math.round(timings[Math.floor(timings.length*.95)]*100)/100,maxMs:Math.round(maxMs)},null,2));
