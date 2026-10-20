'use strict';
const C=require('../../../miniprogram/core/guandan-cards');
function terminal(s){return s.finish.length>=3||s.finish.length===2&&s.finish[0]%2===s.finish[1]%2;}
function value(s,team){
  const finish=s.finish;if(terminal(s)){const winner=finish[0]%2,partner=(finish[0]+2)%4,place=finish.indexOf(partner);return (winner===team?1:-1)*(place===1?120:place===2?105:90);}
  let score=finish.length?(finish[0]%2===team?60:-60):0;for(let seat=0;seat<4;seat++)score+=(seat%2===team?-1:1)*s.hands[seat].length*1.5;return score+(s.turn%2===team?2:-2);
}
function advance(s,cmd){
  const hands=s.hands.slice(),finish=s.finish.slice(),actor=s.turn;let last=s.last,passed=s.passed.slice(),turn=-1;
  function next(from){for(let step=1;step<=4;step++)if(hands[(from+step)%4].length)return (from+step)%4;return -1;}
  if(cmd.type==='play'){
    const used=new Set(cmd.cards);hands[actor]=hands[actor].filter(id=>!used.has(id));last={seat:actor,cards:cmd.cards,combo:cmd.combo};passed=[];if(!hands[actor].length)finish.push(actor);turn=next(actor);
  }else {
    passed.push(actor);const challengers=[0,1,2,3].filter(seat=>hands[seat].length&&seat!==last.seat);
    if(challengers.every(seat=>passed.includes(seat))){const owner=last.seat,partner=(owner+2)%4;turn=hands[owner].length?owner:hands[partner].length?partner:next(owner);last=null;passed=[];}else turn=next(actor);
  }
  return {hands,finish,last,passed,turn};
}
function actionKey(command){return command.type==='pass'?'pass':C.key(command.combo)+'|'+command.cards.map(id=>id%54).sort((a,b)=>a-b).join(',');}
// A depth is accepted only after every root move completes. Exhausting fuel in
// one branch must not make a partly searched maximum look like a proven result.
function searchSample(state,commands,level,team,nodeLimit=400,maxDepth=10){
  const aborted={},moveCache=new Map(),memo=new Map(),children=commands.map(cmd=>advance(state,cmd));let nodes=0,depth=0,scores=children.map(s=>value(s,team));
  function moves(s){
    const h=s.hands[s.turn],key=h.join(',');if(!moveCache.has(key))moveCache.set(key,C.moves(h,level));
    const legal=moveCache.get(key).filter(m=>C.beats(m.combo,s.last&&s.last.combo));legal.sort((a,b)=>b.cards.length-a.cards.length||C.strength(a.combo)-C.strength(b.combo)||a.combo.high-b.combo.high);
    const seen=new Set(),out=[];for(const m of legal){const command={type:'play',...m},k=actionKey(command);if(!seen.has(k)){seen.add(k);out.push(command);}}if(s.last)out.push({type:'pass'});return out;
  }
  function search(s,left,alpha,beta){
    if(nodes>=nodeLimit)throw aborted;nodes++;if(terminal(s)||left===0)return value(s,team);
    const key=left+'|'+s.turn+'|'+s.finish.join(',')+'|'+s.passed.slice().sort().join(',')+'|'+(s.last?s.last.seat+':'+C.key(s.last.combo):'lead')+'|'+s.hands.map(h=>h.join(',')).join('/');if(memo.has(key))return memo.get(key);
    const maximizing=s.turn%2===team,originalAlpha=alpha,originalBeta=beta;let best=maximizing?-Infinity:Infinity,complete=true;
    for(const cmd of moves(s)){const score=search(advance(s,cmd),left-1,alpha,beta);best=maximizing?Math.max(best,score):Math.min(best,score);if(maximizing)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);if(beta<=alpha){complete=false;break;}}
    if(complete&&best>originalAlpha&&best<originalBeta)memo.set(key,best);return best;
  }
  for(let next=1;next<=maxDepth;next++){
    try {const values=children.map(s=>search(s,next-1,-Infinity,Infinity));scores=values;depth=next;if(children.every(terminal))break;}
    catch(error){if(error!==aborted)throw error;break;}
  }
  return {scores,depth,nodes};
}
// Small ending only: evaluate possible deals, never the host's hidden hands.
// Very small deal spaces are exhaustive; larger ones use distinct public samples.
function ending(v,me,ranked,model,allowPass=true){
  if(v.hand.length>8||v.players.reduce((n,p)=>n+p.count,0)>16)return null;
  const roots=[],seen=new Set();for(const row of ranked){const command={type:'play',...row.m},key=actionKey(command);if(seen.has(key))continue;seen.add(key);roots.push({command,prior:row.score,retentionPenalty:row.retentionPenalty||0,values:[]});if(roots.length===8)break;}
  if(v.last&&allowPass)roots.push({command:{type:'pass'},prior:ranked[0].score+6,values:[]});if(roots.length<2)return null;
  let seed=2166136261;for(const id of v.hand.concat(v.played||[]).sort((a,b)=>a-b))seed=Math.imul(seed^id,16777619)>>>0;seed^=v.turn+v.level*17;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},deals=model.deals(random);if(!deals.length)return null;const weights=deals.map(deal=>model.dealWeight?model.dealWeight(deal):1),total=weights.reduce((a,b)=>a+b,0)||1;
  for(const deal of deals){
    const hands=deal.map(h=>C.sorted(h,v.level)),state={hands,finish:(v.finish||[]).slice(),last:v.last,passed:(v.passed||[]).slice(),turn:me};
    const result=searchSample(state,roots.map(root=>root.command),v.level,me%2,Math.floor(3000/deals.length));roots.forEach((root,i)=>root.values.push(result.scores[i]));
  }
  roots.forEach(root=>{const mean=root.values.reduce((n,value,i)=>n+value*weights[i],0)/total;root.score=mean*.8+Math.min(...root.values)*.2-root.prior*.12-(root.retentionPenalty||0)*.5;});roots.sort((a,b)=>b.score-a.score);return roots[0].command;
}
module.exports={ending,searchSample};
