'use strict';
const C=require('../../../miniprogram/core/guandan-cards');
function groups(hand){const out={};for(const id of hand){const rank=C.card(id).rank;(out[rank]||(out[rank]=[])).push(id);}return out;}
// A short-turn hand is not necessarily an easy exit: loose low singles may
// still need a bomb/stopper to regain the lead. Assess disjoint groups, never
// count the same king as both a joker bomb and a second independent stopper.
function retention(v,me,model){
  const enemies=v.players.filter(p=>p.seat%2!==me%2&&p.count>0).map(p=>p.seat),cache=new Map(),probabilities=new Map();
  function control(combo,bombs=true){const key=C.key(combo)+'|'+bombs;if(!probabilities.has(key))probabilities.set(key,enemies.reduce((p,seat)=>p*(1-model.response(combo,seat,bombs)),1));return probabilities.get(key);}
  function assess(hand){
    hand=C.sorted(hand,v.level);
    const key=hand.slice().sort((a,b)=>a-b).join(',');if(cache.has(key))return cache.get(key);
    const empty={weak:0,controls:0,cost:0};
    // Removing a whole hand or leaving one playable group is a valid finish,
    // including a low last single. Do not turn this into blanket bomb saving.
    if(hand.length<2||C.classify(hand,v.level).length){cache.set(key,empty);return empty;}
    const moves=C.moves(hand,v.level),available=new Set(hand),packed=[];let controls=0;
    // Reserve bombs first. A straight flush is also an ordinary straight; if
    // that weaker interpretation packs first, it hides a real re-entry card.
    const bombs=moves.filter(m=>C.strength(m.combo)).sort((a,b)=>C.strength(b.combo)-C.strength(a.combo)||b.cards.length-a.cards.length||b.combo.high-a.combo.high);
    for(const m of bombs)if(m.cards.every(id=>available.has(id))){controls+=.8+.2*control(m.combo);for(const id of m.cards)available.delete(id);}
    const ordinary=moves.filter(m=>m.cards.length>1&&!C.strength(m.combo)).sort((a,b)=>b.cards.length-a.cards.length||a.combo.high-b.combo.high||a.cards[0]-b.cards[0]);
    for(const m of ordinary)if(m.cards.every(id=>available.has(id))){packed.push(m);for(const id of m.cards)available.delete(id);}
    let weak=0;for(const cards of Object.values(groups(Array.from(available))))if(cards.length===1&&!C.wild(cards[0],v.level)){
      const combo={kind:'single',high:C.power(C.card(cards[0]).rank,v.level),count:1},risk=1-control(combo,false);if(risk>=.6)weak+=risk;
    }
    for(const m of packed){const strength=control(m.combo);if(strength>=.75)controls+=strength*.45;}
    for(const id of available){const combo={kind:'single',high:C.power(C.card(id).rank,v.level),count:1},strength=control(combo,false);if(strength>=.6)controls+=strength;}
    const cost=weak<=1.05?0:Math.max(0,weak-1-controls)*16+weak*2/(1+controls),result={weak,controls,cost};cache.set(key,result);return result;
  }
  let before=null;
  function after(hand){
    if(!before)before=assess(v.hand);const next=assess(hand),spent=Math.max(0,before.controls-next.controls);
    const penalty=Math.max(-18,Math.min(30,next.cost-before.cost+spent*Math.min(2,Math.max(0,next.weak-1))*8));return {...next,spent,penalty};
  }
  return {assess,after};
}
module.exports={retention};
