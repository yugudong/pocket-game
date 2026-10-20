'use strict';
const C=require('./doudizhu-cards'),O=require('./doudizhu-observation'),{team}=require('./doudizhu-ai-public');
function evidence(v,me){
  const history=O.events(v),later=v.players.map(()=>[]),selected=v.players.map(()=>[]);
  for(let i=history.length-1;i>=0;i--){const e=history[i],seat=e.seat;
    const informative=e.cards.length?e.owner<0||['single','pair','tripleSingle','triplePair'].includes(e.combo.kind):team(seat,v.landlord)!==team(e.owner,v.landlord);
    if(seat!==me&&selected[seat].length<3&&informative)selected[seat].push({...e,later:later[seat].slice(),age:history.length-1-i});later[seat].push(...e.cards);
  }return selected;
}
function breakCost(hand,move){
  const before=C.groups(hand),used=C.groups(move.cards);let damage=0;
  for(const [rank,cards] of Object.entries(used))if(cards.length<before[rank].length)damage+=before[rank].length===4?10:before[rank].length===3?3:2;
  if(before[15]&&before[16]&&move.cards.includes(52)!==move.cards.includes(53))damage+=10;return damage;
}
function shapeProfile(hand,getMoves=C.moves){
  const counts=C.groups(hand),profile={singles:0,pairs:0,triples:0,bombs:0,runs:0,turns:0};
  for(const g of Object.values(counts))profile[g.length===1?'singles':g.length===2?'pairs':g.length===3?'triples':'bombs']++;
  const left={};for(const [rank,cards] of Object.entries(counts))left[rank]=cards.length;
  const catalog=getMoves(hand).map(m=>({m,req:Object.entries(C.groups(m.cards)).map(([rank,cards])=>[rank,cards.length])})).sort((a,b)=>b.m.cards.length-a.m.cards.length||C.strength(a.m.combo)-C.strength(b.m.combo)||a.m.combo.high-b.m.combo.high);
  let remaining=hand.length;while(remaining){const row=catalog.find(e=>e.req.every(([r,n])=>left[r]>=n));if(!row){profile.turns+=remaining;break;}for(const [r,n] of row.req)left[r]-=n;remaining-=row.m.cards.length;profile.turns++;if(['straight','pairs','triples','planeSingle','planePair'].includes(row.m.combo.kind))profile.runs++;}return profile;
}
function likelihood(hand,observations,landlord,getMoves=C.moves){
  let value=0;for(const e of observations){const before=hand.concat(e.later,e.cards);if(before.length!==e.counts[e.seat]||new Set(before).size!==before.length)continue;
    const decay=Math.pow(.83,e.later.length/3)*Math.pow(.985,e.age);let probability=1;
    if(!e.cards.length){
      if(team(e.seat,landlord)===team(e.owner,landlord))continue;
      const replies=getMoves(before).filter(m=>C.beats(m.combo,e.faced)),ordinary=replies.filter(m=>!C.strength(m.combo));
      if(replies.some(m=>m.cards.length===before.length))probability=.1;
      else if(ordinary.length)probability=ordinary.some(m=>breakCost(before,m)<4)?(e.counts[e.owner]<=e.faced.count?.28:.55):.83;
      else if(replies.length)probability=e.counts[e.owner]<=e.faced.count?.77:.97;
    }else {
      const urgent=e.counts.some((n,seat)=>team(seat,landlord)!==team(e.seat,landlord)&&n<=2);
      if(!urgent&&e.combo.kind==='single'&&e.combo.high<=13){const count=C.groups(before)[C.card(e.cards[0]).rank].length;probability*=count===4?.5:count>=2?.72:1;}
      if(!urgent&&e.owner<0&&['single','pair'].includes(e.combo.kind)){const groups=Object.values(C.groups(before)),matches=groups.filter(g=>g.length===e.combo.count).length;probability*=.65+.35*(matches+1)/(groups.length+1);}
    }value+=Math.log(Math.max(.08,probability))*decay;
  }return value;
}
function inference(v,me,facts){
  const observations=evidence(v,me),cache=new Map(),replies=new Map();let particles=null,profiles=null,seed=2166136261;
  for(const id of v.hand.concat(v.played||[]).sort((a,b)=>a-b))seed=Math.imul(seed^id,16777619)>>>0;seed^=v.turn+v.landlord*17;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  function moves(hand){const key=hand.slice().sort((a,b)=>a-b).join(',');if(!cache.has(key))cache.set(key,C.moves(hand));return cache.get(key);}
  function weight(hands){return Math.exp(observations.reduce((n,es,seat)=>n+(seat===me?0:likelihood(hands[seat],es,v.landlord,moves)),0)*.7);}
  function samples(){if(particles)return particles;particles=facts.deals(random,8).map(hands=>({hands,weight:weight(hands)}));const total=particles.reduce((n,p)=>n+p.weight,0)||1;particles.forEach(p=>{p.weight/=total;});return particles;}
  function profile(seat){
    if(!profiles){profiles=v.players.map(()=>({singles:0,pairs:0,triples:0,bombs:0,runs:0,turns:0,confidence:0}));
      for(const p of samples())for(let s=0;s<3;s++)if(s!==me){const row=shapeProfile(p.hands[s],moves);for(const key of Object.keys(row))profiles[s][key]+=row[key]*p.weight;}
      const effective=1/(samples().reduce((n,p)=>n+p.weight*p.weight,0)||1);for(let s=0;s<3;s++)profiles[s].confidence=Math.min(.55,observations[s].length*.18)*Math.min(1,effective/4);
      profiles[me]={...shapeProfile(v.hand,moves),confidence:1};
    }return profiles[seat];
  }
  function response(combo,seat,bombs=true){
    const prior=facts.response(combo,seat,bombs);if(!observations[seat].length||facts.known[seat].length===v.players[seat].count)return prior;
    const key=C.key(combo)+'|'+seat+'|'+bombs;if(replies.has(key))return replies.get(key);const ps=samples();if(!ps.length)return prior;
    const empirical=ps.reduce((n,p)=>n+(moves(p.hands[seat]).some(m=>C.beats(m.combo,combo)&&(bombs||!C.strength(m.combo)))?p.weight:0),0),confidence=profile(seat).confidence,result=prior*(1-confidence)+empirical*confidence;replies.set(key,result);return result;
  }
  return {...facts,response,control(combo,seats){return seats.reduce((p,s)=>p*(1-response(combo,s)),1);},moves,samples,profile,observations,dealWeight:weight};
}
module.exports={inference,likelihood,evidence,shapeProfile,breakCost};
