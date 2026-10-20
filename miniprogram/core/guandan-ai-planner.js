'use strict';
const C=require('./guandan-cards');
function profile(hand){const counts={};hand.forEach(id=>{const r=C.card(id).rank;counts[r]=(counts[r]||0)+1;});return counts;}
// Rank-equivalent cards have different value when one suit completes a flush.
function variants(hand,level,all){
  const protectedCards=new Map(),out=all.slice(),seen=new Set(all.map(m=>C.key(m.combo)+'|'+m.cards.slice().sort((a,b)=>a-b).join(',')));
  for(const m of all)if(m.combo.kind==='flush')for(const id of m.cards)protectedCards.set(id,(protectedCards.get(id)||0)+1);
  for(const m of all){
    if(m.cards.length<2||C.strength(m.combo)>0)continue;const requirements=new Map(),wilds=m.cards.filter(id=>C.wild(id,level));for(const id of m.cards)if(!C.wild(id,level)){const r=C.card(id).rank;requirements.set(r,(requirements.get(r)||0)+1);}
    for(const reversed of [false,true]){
      let cards=wilds.slice();for(const [rank,n] of requirements){const pool=hand.filter(id=>!C.wild(id,level)&&C.card(id).rank===rank).sort((a,b)=>(protectedCards.get(a)||0)-(protectedCards.get(b)||0)||(reversed?b-a:a-b));cards.push(...pool.slice(0,n));}
      const key=C.key(m.combo)+'|'+cards.slice().sort((a,b)=>a-b).join(',');if(!seen.has(key)){seen.add(key);out.push({cards,combo:m.combo});}
    }
  }
  // A wildcard may replace an available natural card as well as fill a gap.
  // Keep a small beam of substitutions that preserve a bomb, pair or flush.
  const counts=profile(hand),wilds=hand.filter(id=>C.wild(id,level));
  for(const original of out.slice()){
    if(!wilds.length||original.cards.length<2||['bomb','jokers'].includes(original.combo.kind))continue;
    let beam=[original];for(let depth=0;depth<wilds.length;depth++){
      const next=[];for(const m of beam){const used=profile(m.cards);for(const wild of wilds)if(!m.cards.includes(wild))for(const id of m.cards){
        const rank=C.card(id).rank;if(rank>=15||C.wild(id,level))continue;const remaining=counts[rank]-used[rank],gain=(rank===level?0:remaining===3&&counts[rank]>=4?8:remaining===1?2.2:0)+(protectedCards.get(id)||0)*5;if(!gain)continue;
        const cards=m.cards.map(card=>card===id?wild:card),key=C.key(m.combo)+'|'+cards.slice().sort((a,b)=>a-b).join(',');if(seen.has(key))continue;seen.add(key);next.push({cards,combo:m.combo,gain});
      }}next.sort((a,b)=>b.gain-a.gain||a.cards[0]-b.cards[0]);beam=next.slice(0,3);out.push(...beam.map(m=>({cards:m.cards,combo:m.combo})));if(!beam.length)break;
    }
  }
  return out;
}
// Bounded partitions of actual card masks, retaining suit/wildcard identities.
// Reusing a move catalogue avoids rebuilding every recursive hand. Singletons
// provide a legal upper bound even after the search budget is exhausted.
function planner(level,initial,initialMoves){
  let root=initial,entries,index,memo,plans;const classified=new Map();let budget=1800;
  function initialize(hand){
    root=hand.slice();index=new Map(root.map((id,i)=>[id,1<<i]));const catalog=initialMoves||variants(root,level,C.moves(root,level)),seen=new Set();entries=[];
    function add(cards){const mask=cards.reduce((n,id)=>n|index.get(id),0);if(!seen.has(mask)){seen.add(mask);entries.push({mask,count:cards.length});}}
    for(const m of catalog)add(m.cards);
    // Include all physical pairs/triples, not just generator representatives.
    // Otherwise taking one suit could incorrectly strand another valid pair.
    for(let rank=2;rank<=16;rank++){const pool=root.filter(id=>C.card(id).rank===rank||rank<15&&C.wild(id,level));for(let a=0;a<pool.length;a++)for(let b=a+1;b<pool.length;b++){add([pool[a],pool[b]]);if(rank<15)for(let c=b+1;c<pool.length;c++)add([pool[a],pool[b],pool[c]]);}}
    entries.sort((a,b)=>b.count-a.count||a.mask-b.mask);memo=new Map([[0,0]]);plans=new Map([[0,[]]]);
  }
  if(root)initialize(root);
  function greedy(mask){const layout=[];while(mask){const best=entries.find(m=>(mask&m.mask)===m.mask);mask^=best.mask;layout.push(best.mask);}return layout;}
  function solve(mask,size){
    if(memo.has(mask))return memo.get(mask);const legal=entries.filter(m=>(mask&m.mask)===m.mask);if(legal[0].count===size){memo.set(mask,1);plans.set(mask,[mask]);return 1;}
    let layout=greedy(mask),best=layout.length;plans.set(mask,layout);if(best<=2||--budget<0){memo.set(mask,best);return best;}
    const anchor=mask&-mask,choices=legal.filter(m=>m.mask&anchor).slice(0,size<=12?32:9);
    for(const m of choices){if(1+Math.ceil((size-m.count)/legal[0].count)>=best)continue;const count=1+solve(mask^m.mask,size-m.count);if(count<best){best=count;layout=[m.mask,...plans.get(mask^m.mask)];plans.set(mask,layout);}if(best===2)break;}
    memo.set(mask,best);return best;
  }
  function estimate(hand){if(!root)initialize(hand);const mask=hand.reduce((mask,id)=>mask|index.get(id),0);if(hand.length<=10&&C.classify(hand,level).length){memo.set(mask,1);plans.set(mask,[mask]);return 1;}return solve(mask,hand.length);}
  // Keep a legal witness for the exact same estimate. Residual evaluation
  // must not greedily split a run that the turn planner already kept intact.
  estimate.partition=function(hand){estimate(hand);const mask=hand.reduce((mask,id)=>mask|index.get(id),0);return plans.get(mask).map(part=>{if(!classified.has(part)){const cards=root.filter(id=>part&index.get(id)),combo=C.classify(cards,level).sort((a,b)=>C.strength(b)-C.strength(a)||b.high-a.high)[0];classified.set(part,{cards,combo});}const move=classified.get(part);return {cards:move.cards.slice(),combo:{...move.combo}};});};
  return estimate;
}
module.exports={planner,variants};
