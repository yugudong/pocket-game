'use strict';
const C=require('./doudizhu-cards'),{team}=require('./doudizhu-ai-public');
function winner(s){return s.hands.findIndex(h=>!h.length);}
function value(s,landlord,mine){
  const won=winner(s);if(won>=0)return team(won,landlord)===mine?120:-120;
  const counts=s.hands.map(h=>h.length),farmers=counts.filter((n,i)=>i!==landlord),advantage=counts[landlord]-Math.min(...farmers);
  return (mine===1?1:-1)*advantage*2+(team(s.turn,landlord)===mine?2:-2);
}
function advance(s,cmd){
  const hands=s.hands.slice(),actor=s.turn;let last=s.last,passed=s.passed.slice(),turn=(actor+1)%3;
  if(cmd.type==='play'){const used=new Set(cmd.cards);hands[actor]=hands[actor].filter(id=>!used.has(id));last={seat:actor,combo:cmd.combo};passed=[];}
  else {passed.push(actor);if(passed.length===2){turn=last.seat;last=null;passed=[];}}
  return {hands,last,passed,turn};
}
const actionKey=cmd=>cmd.type==='pass'?'pass':C.key(cmd.combo)+'|'+cmd.cards.map(id=>C.card(id).rank).sort((a,b)=>a-b).join(',');
function searchSample(state,commands,landlord,mine,nodeLimit=400,maxDepth=10){
  const aborted={},cache=new Map(),memo=new Map(),children=commands.map(cmd=>advance(state,cmd));let nodes=0,depth=0,scores=children.map(s=>value(s,landlord,mine));
  function actions(s){const hand=s.hands[s.turn],key=hand.join(',');if(!cache.has(key))cache.set(key,C.moves(hand));const legal=cache.get(key).filter(m=>C.beats(m.combo,s.last&&s.last.combo)).sort((a,b)=>b.cards.length-a.cards.length||a.combo.high-b.combo.high),seen=new Set(),out=[];
    for(const m of legal){const cmd={type:'play',...m},k=actionKey(cmd);if(!seen.has(k)){seen.add(k);out.push(cmd);}}if(s.last)out.push({type:'pass'});return out;
  }
  function search(s,left,alpha,beta){
    if(nodes>=nodeLimit)throw aborted;nodes++;if(winner(s)>=0||!left)return value(s,landlord,mine);
    const key=left+'|'+s.turn+'|'+(s.last?s.last.seat+':'+C.key(s.last.combo):'lead')+'|'+s.passed.join(',')+'|'+s.hands.map(h=>h.join(',')).join('/');if(memo.has(key))return memo.get(key);
    const maximizing=team(s.turn,landlord)===mine,originalAlpha=alpha,originalBeta=beta;let best=maximizing?-Infinity:Infinity,complete=true;
    for(const cmd of actions(s)){const score=search(advance(s,cmd),left-1,alpha,beta);best=maximizing?Math.max(best,score):Math.min(best,score);if(maximizing)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);if(beta<=alpha){complete=false;break;}}
    if(complete&&best>originalAlpha&&best<originalBeta)memo.set(key,best);return best;
  }
  for(let next=1;next<=maxDepth;next++){try{const result=children.map(s=>search(s,next-1,-Infinity,Infinity));scores=result;depth=next;if(children.every(s=>winner(s)>=0))break;}catch(e){if(e!==aborted)throw e;break;}}
  return {scores,depth,nodes};
}
function ending(v,me,ranked,model,allowPass=true){
  if(v.hand.length>7||v.players.reduce((n,p)=>n+p.count,0)>13)return null;
  const roots=[],seen=new Set();for(const row of ranked){const command={type:'play',...row.m},key=actionKey(command);if(!seen.has(key)){seen.add(key);roots.push({command,prior:row.score,values:[]});}if(roots.length===8)break;}
  if(v.last&&allowPass)roots.push({command:{type:'pass'},prior:ranked[0].score+6,values:[]});if(roots.length<2)return null;
  const samples=model.samples();if(!samples.length)return null;
  for(const p of samples){const state={hands:p.hands.map(h=>C.sorted(h)),last:v.last,passed:(v.passed||[]).slice(),turn:me},result=searchSample(state,roots.map(r=>r.command),v.landlord,team(me,v.landlord),Math.floor(2400/samples.length));roots.forEach((root,i)=>root.values.push(result.scores[i]));}
  roots.forEach(root=>{const mean=root.values.reduce((n,x,i)=>n+x*samples[i].weight,0);root.score=mean*.85+Math.min(...root.values)*.15-root.prior*.1;});const anchor=roots[0];roots.sort((a,b)=>b.score-a.score);
  // Sparse perfect-information rollouts can overvalue a speculative pass or
  // handoff. Require a meaningful margin over the established best play; when
  // they agree, retain the caller's bomb-saving and teammate-pass safeguards.
  if(roots[0]===anchor||roots[0].score-anchor.score<12)return null;return roots[0].command;
}
module.exports={ending,searchSample,advance,actionKey};
