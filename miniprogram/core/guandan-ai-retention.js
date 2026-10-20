'use strict';
const C=require('./guandan-cards');
const {planner}=require('./guandan-ai-planner');
// Evaluate the same disjoint, legal groups used to estimate remaining turns.
// A second greedy layout can invent weak singles by consuming a run card in
// a full house even when the original planner has a better complete layout.
function retention(v,me,model,estimate=planner(v.level,v.hand)){
  const enemies=v.players.filter(p=>p.seat%2!==me%2&&p.count>0).map(p=>p.seat),cache=new Map(),probabilities=new Map();
  function control(combo,bombs=true){const key=C.key(combo)+'|'+bombs;if(!probabilities.has(key))probabilities.set(key,enemies.reduce((p,seat)=>p*(1-model.response(combo,seat,bombs)),1));return probabilities.get(key);}
  function assess(hand){
    hand=C.sorted(hand,v.level);
    const key=hand.slice().sort((a,b)=>a-b).join(',');if(cache.has(key))return cache.get(key);
    const empty={weak:0,controls:0,cost:0,turns:hand.length?1:0};
    if(hand.length<2||C.classify(hand,v.level).length){cache.set(key,empty);return empty;}
    const layout=estimate.partition(hand);let weak=0,controls=0;
    for(const move of layout){
      const combo=move.combo;
      if(C.strength(combo)){controls+=.8+.2*control(combo);continue;}
      if(move.cards.length>1){const strength=control(combo);if(strength>=.75)controls+=strength*.45;continue;}
      const strength=control(combo,false),risk=1-strength;
      if(!C.wild(move.cards[0],v.level)&&risk>=.6)weak+=risk;
      if(strength>=.6)controls+=strength;
    }
    const cost=weak<=1.05?0:Math.max(0,weak-1-controls)*16+weak*2/(1+controls),result={weak,controls,cost,turns:layout.length};cache.set(key,result);return result;
  }
  let before=null;
  function after(hand){
    if(!before)before=assess(v.hand);const next=assess(hand),spent=Math.max(0,before.controls-next.controls),shortfall=Math.max(0,next.weak-Math.max(1,next.controls));
    // Penalize exhausting needed control, not merely using a high card while
    // other stoppers remain. Approximate shape costs are softer in full hands
    // than in short endings and cannot outweigh a whole turn of progress.
    const weight=v.hand.length<=10?1:.25,penalty=weight*Math.max(-18,Math.min(30,next.cost-before.cost+spent*Math.min(2,shortfall)*8));return {...next,spent,shortfall,penalty};
  }
  return {assess,after};
}
module.exports={retention};
