'use strict';
// Frozen 1.6.2 strategy for paired benchmarks; excluded from the mini-program.
const C=require('../../miniprogram/core/guandan-cards');
const {returnCards,tributeOptions}=require('../../miniprogram/core/guandan');
function remove(hand,ids){const gone=new Set(ids);return hand.filter(id=>!gone.has(id));}
function profile(hand,level){const counts={};hand.forEach(id=>{const r=C.card(id).rank;counts[r]=(counts[r]||0)+1;});return counts;}
function damage(hand,move,level,flushes){
  const before=profile(hand,level),after=profile(remove(hand,move.cards),level);let cost=0;
  for(const r of Object.keys(before))if(before[r]>=4&&after[r]>0&&after[r]<4)cost+=5;
  if(move.combo.kind!=='jokers'&&before[15]===2&&before[16]===2&&move.cards.some(id=>C.card(id).rank>=15))cost+=9;
  flushes=flushes||C.moves(hand,level).filter(m=>m.combo.kind==='flush');
  if(C.strength(move.combo)===0&&flushes.some(f=>f.cards.some(id=>move.cards.includes(id))&&!f.cards.every(id=>move.cards.includes(id))))cost+=3;
  cost+=move.cards.filter(id=>C.wild(id,level)).length*1.2;return cost;
}
// Bounded partition search estimates how many legal plays remain. The budget bounds
// foreground latency and the input is exclusively the player's private projection.
function planner(level){
  const memo=new Map();let budget=70;
  function estimate(hand){
    if(!hand.length)return 0;const k=hand.slice().sort((a,b)=>a-b).join(',');if(memo.has(k))return memo.get(k);
    const all=C.moves(hand,level);if(all.some(m=>m.cards.length===hand.length)){memo.set(k,1);return 1;}
    if(--budget<0){let left=hand.slice(),turns=0;while(left.length){const best=C.moves(left,level).sort((a,b)=>b.cards.length-a.cards.length||C.strength(a.combo)-C.strength(b.combo))[0];left=remove(left,best.cards);turns++;}memo.set(k,turns);return turns;}
    // Only partition on the first card: every complete partition has such a move.
    const anchor=hand[0],choices=all.filter(m=>m.cards.includes(anchor)).sort((a,b)=>b.cards.length-a.cards.length||a.combo.high-b.combo.high).slice(0,hand.length<=12?10:5);
    let best=hand.length;for(const m of choices)best=Math.min(best,1+estimate(remove(hand,m.cards)));memo.set(k,best);return best;
  }
  return estimate;
}
function choose(v){
  const me=v.players.findIndex(p=>p.id===v.me);if(me<0||v.turn!==me)throw new Error('不是自己的回合');const hand=v.hand,level=v.level;
  if(v.phase==='tribute'){
    const giving=v.tributeStage==='give',eligible=giving?(v.tributeOptions||tributeOptions(hand,level)):(v.returnOptions||returnCards(hand,level)),estimate=planner(level),flushes=C.moves(hand,level).filter(m=>m.combo.kind==='flush');const scores=eligible.map(id=>({id,score:estimate(remove(hand,[id]))*12+damage(hand,{cards:[id],combo:{kind:'single'}},level,flushes)+C.power(C.card(id).rank,level)*.15}));scores.sort((a,b)=>a.score-b.score||a.id-b.id);return {type:giving?'tribute':'return',card:scores[0].id};
  }
  const all=C.moves(hand,level),legal=all.filter(m=>C.beats(m.combo,v.last&&v.last.combo)),flushes=all.filter(m=>m.combo.kind==='flush');
  const finish=legal.filter(m=>m.cards.length===hand.length).sort((a,b)=>C.strength(a.combo)-C.strength(b.combo)||a.combo.high-b.combo.high)[0];if(finish)return Object.assign({type:'play'},finish);
  if(!legal.length)return {type:'pass'};
  const teammate=v.last&&v.last.seat%2===me%2,partner=v.players[(me+2)%4],enemies=v.players.filter(p=>p.team!==me%2&&p.count>0),danger=Math.min(...enemies.map(p=>p.count)),urgent=danger<=2;
  const mustBlock=teammate&&v.last.combo.high<17&&((v.last.combo.kind==='single'&&enemies.some(p=>p.count===1))||(v.last.combo.kind==='pair'&&enemies.some(p=>p.count===2)));
  // Let a partner's winning hand stand. Overtake only to finish, take wind, or
  // move a much larger batch without spending a control card.
  if(teammate&&!mustBlock&&(partner.count<=6||v.last.combo.high>=14||C.strength(v.last.combo)>0))return {type:'pass'};
  let candidates=legal;
  const kings=hand.filter(id=>C.card(id).rank>=15);
  if(kings.length===4&&!urgent){candidates=candidates.filter(m=>m.combo.kind==='jokers'||!m.cards.some(id=>kings.includes(id)));if(!candidates.length)return {type:'pass'};}
  if(teammate){candidates=candidates.filter(m=>mustBlock?(C.strength(m.combo)>0||m.combo.high>=16):(C.strength(m.combo)===0&&m.combo.high<14&&m.cards.length>=3));if(!candidates.length)return {type:'pass'};}
  const estimate=planner(level),base=estimate(hand),remainingUnseen=Array.from({length:108},(_,id)=>id).filter(id=>!hand.includes(id)&&!v.played.includes(id));
  const scored=candidates.map(m=>{
    const left=remove(hand,m.cards),turns=estimate(left),power=C.strength(m.combo),shapeDamage=damage(hand,m,level,flushes);
    let score=turns*13+shapeDamage+m.combo.high*.12+power*5-m.cards.length*.5;
    if(!v.last){
      // Avoid feeding a one-card opponent a low single when we can lead a set.
      if(urgent&&m.combo.kind==='single'&&m.combo.high<16)score+=23;
      if(partner.count===1&&m.combo.kind==='single'&&m.combo.high<=10&&!urgent)score-=8;
      if(m.combo.kind==='single'&&m.combo.high>=16&&hand.length>5&&!urgent)score+=6;
    }else {
      if(!urgent&&power>0&&turns>=base-1)score+=14;
      if(!urgent&&m.combo.high>=16&&m.cards.length<=2&&hand.length>7)score+=5;
      if(urgent&&(!teammate||mustBlock)){
        const above=remainingUnseen.filter(id=>C.power(C.card(id).rank,level)>m.combo.high).length;
        if(m.combo.kind==='single'||m.combo.kind==='pair')score+=above*1.6;
        score-=power*6;
      }
    }
    return {m,score,turns};
  }).sort((a,b)=>a.score-b.score||C.strength(a.m.combo)-C.strength(b.m.combo)||a.m.combo.high-b.m.combo.high||a.m.cards[0]-b.m.cards[0]);
  const best=scored[0];
  if(v.last&&!teammate&&!urgent&&C.strength(best.m.combo)>0&&hand.length>6&&best.turns>=base-1)return {type:'pass'};
  return Object.assign({type:'play'},best.m);
}
module.exports={choose,planner,damage};
