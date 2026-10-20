'use strict';
const C=require('../../../miniprogram/core/guandan-cards');
const {returnCards,tributeOptions}=require('../../../miniprogram/core/guandan');
const {publicModel}=require('./guandan-ai-public');
const {ending}=require('./guandan-ai-endgame');
const {inference}=require('./guandan-ai-belief');
const {teamCircle}=require('./guandan-ai-circle');
const {retention}=require('./guandan-ai-retention');
const {closingPlan,actionKey}=require('./guandan-ai-exit');
const {planner,variants}=require('./guandan-ai-planner');
const {ordinaryLead}=require('./guandan-ai-lead');
function remove(hand,ids){const gone=new Set(ids);return hand.filter(id=>!gone.has(id));}
function profile(hand){const counts={};hand.forEach(id=>{const r=C.card(id).rank;counts[r]=(counts[r]||0)+1;});return counts;}
function damage(hand,move,level,flushes){
  const before=profile(hand),after=profile(remove(hand,move.cards));let cost=0;
  for(const r of Object.keys(before)){
    if(before[r]>=4&&after[r]>0&&after[r]<4)cost+=8+(before[r]-4)*1.5;
    else if(before[r]>=2&&after[r]>0&&after[r]<before[r])cost+=after[r]===1?2.2:1;
  }
  if(move.combo.kind!=='jokers'&&before[15]===2&&before[16]===2&&move.cards.some(id=>C.card(id).rank>=15))cost+=14;
  flushes=flushes||C.moves(hand,level).filter(m=>m.combo.kind==='flush');
  if(C.strength(move.combo)===0&&flushes.some(f=>f.cards.some(id=>move.cards.includes(id))&&!f.cards.every(id=>move.cards.includes(id))))cost+=5;
  cost+=move.cards.filter(id=>C.wild(id,level)).length*1.4;return cost;
}
function choose(v){
  const me=v.players.findIndex(p=>p.id===v.me);if(me<0||v.turn!==me)throw new Error('不是自己的回合');if(v.phase!=='play'&&v.phase!=='tribute')throw new Error('当前不是出牌或贡还阶段');
  const hand=C.sorted(v.hand,v.level),level=v.level,all=variants(hand,level,C.moves(hand,level)),flushes=all.filter(m=>m.combo.kind==='flush'),estimate=planner(level,hand,all);
  if(v.phase==='tribute'){
    const giving=v.tributeStage==='give',eligible=giving?(v.tributeOptions||tributeOptions(hand,level)):(v.returnOptions||returnCards(hand,level));
    const scores=eligible.map(id=>({id,score:estimate(remove(hand,[id]))*12+damage(hand,{cards:[id],combo:{kind:'single'}},level,flushes)+C.power(C.card(id).rank,level)*.15}));scores.sort((a,b)=>a.score-b.score||a.id-b.id);return {type:giving?'tribute':'return',card:scores[0].id};
  }
  const playable=all.filter(m=>C.beats(m.combo,v.last&&v.last.combo)),bestFlush=new Map();for(const m of playable)if(m.combo.kind==='flush'){const key=m.cards.slice().sort((a,b)=>a-b).join(','),previous=bestFlush.get(key);if(!previous||C.preference(m.combo,previous.combo)<0)bestFlush.set(key,m);}
  const legal=playable.filter(m=>{if(!['straight','flush'].includes(m.combo.kind))return true;const best=bestFlush.get(m.cards.slice().sort((a,b)=>a-b).join(','));return !best||m.combo.kind==='flush'&&C.key(m.combo)===C.key(best.combo);}),finish=legal.filter(m=>m.cards.length===hand.length).sort((a,b)=>C.preference(a.combo,b.combo))[0];if(finish)return Object.assign({type:'play'},finish);if(!legal.length)return {type:'pass'};
  const teammate=!!v.last&&v.last.seat%2===me%2,partner=v.players[(me+2)%4],enemies=v.players.filter(p=>p.team!==me%2&&p.count>0),enemySeats=enemies.map(p=>p.seat),danger=Math.min(...enemies.map(p=>p.count)),urgent=danger<=2,model=inference(v,me,publicModel(v,me)),passed=v.passed||[],base=estimate(hand),circle=teamCircle(v,me,model,base);
  const pending=enemies.filter(p=>!passed.includes(p.seat)),matchingDanger=!!v.last&&pending.some(p=>p.count===v.last.combo.count),mustBlock=teammate&&matchingDanger&&model.control(v.last.combo,pending.map(p=>p.seat))<.999;
  // Preserve a partner's lead, but guard against an opponent who can finish
  // before the wind arrives. Already-passed opponents need no fresh guard.
  if(teammate&&!mustBlock&&(!circle.runnerMe||v.last.combo.high>=14||C.strength(v.last.combo)>0))return {type:'pass'};
  const closing=closingPlan(v,me,legal,model);if(closing.proven)return closing.proven;
  const kings=hand.filter(id=>C.card(id).rank>=15);let candidates=legal;
  if(kings.length===4&&!urgent)candidates=candidates.filter(m=>m.combo.kind==='jokers'||!m.cards.some(id=>kings.includes(id)));
  if(teammate&&!mustBlock)candidates=candidates.filter(m=>!C.strength(m.combo)&&m.combo.high<14&&(m.cards.length>=3||circle.runnerMe));
  const lead=ordinaryLead(v,me,candidates,all,model);if(lead)candidates=candidates.filter(m=>lead.has(actionKey(m)));
  if(!candidates.length)return {type:'pass'};
  let scored=candidates.map(m=>{
    const left=remove(hand,m.cards),turns=estimate(left),power=C.strength(m.combo),shapeDamage=damage(hand,m,level,flushes),control=model.control(m.combo,enemySeats),risk=1-control,exit=turns===1&&C.classify(left,level).length>0;
    let score=turns*13+shapeDamage+m.combo.high*.12+power*5-m.cards.length*.5+(closing.bias.get(actionKey(m))||0);
    score+=risk*(hand.length<=10?9:3);
    // Spend a control card when it creates a credible two-play exit.
    if(exit)score-=control*23;
    if(!v.last){
      if(urgent&&enemies.some(p=>p.count===m.cards.length))score+=risk*35;
      if(m.combo.kind==='single'&&m.combo.high>=16&&hand.length>9&&!urgent&&!exit)score+=7;
      if(partner.count>0&&partner.count<=2&&m.cards.length===partner.count&&!power){
        const beforePartner=enemies.filter(p=>(p.seat-me+4)%4<2).map(p=>p.seat),delivery=model.control(m.combo,beforePartner)*model.response(m.combo,partner.seat,false);score-=delivery*17;
      }
    }else {
      if(!urgent&&power>0&&turns>=base-1&&!exit)score+=14;
      if(!urgent&&m.combo.high>=16&&m.cards.length<=2&&hand.length>9&&!exit)score+=5;
      if(urgent||mustBlock){score+=risk*30;score-=power*3;}
      if(teammate&&!mustBlock)score+=14;
      if(!teammate&&!v.players[v.last.seat].count&&turns<=2)score-=control*9;
    }
    return {m,score,turns,shapeDamage,control,exit,left};
  }).sort((a,b)=>a.score-b.score||C.strength(a.m.combo)-C.strength(b.m.combo)||a.m.combo.high-b.m.combo.high||a.m.cards[0]-b.m.cards[0]);
  // Examine one circle for diverse promising shapes. Physical suit variants of
  // the same shape share a rollout: nobody else acts twice before our next turn.
  const shapes=new Set();for(const row of scored){shapes.add(C.key(row.m.combo));if(shapes.size===12)break;}
  const lowByKind=new Map();for(const row of scored)if(!C.strength(row.m.combo)){const previous=lowByKind.get(row.m.combo.kind);if(!previous||row.m.combo.high<previous.m.combo.high)lowByKind.set(row.m.combo.kind,row);}
  for(const row of lowByKind.values())if(shapes.size<18)shapes.add(C.key(row.m.combo));
  // Rank only the bounded set actually examined; an unexamined candidate must
  // not win simply because its possible tail-player penalty was never applied.
  scored=scored.filter(row=>shapes.has(C.key(row.m.combo)));
  const reserve=retention(v,me,model,estimate);
  for(const row of scored){row.circle=circle.evaluate({type:'play',...row.m});row.score+=circle.adjustment(row.circle);row.tail=urgent||mustBlock||row.circle.partnerFinish>=.5?{weak:0,spent:0,penalty:0}:reserve.after(row.left);row.retentionPenalty=row.tail.penalty;row.score+=row.retentionPenalty;}
  scored.sort((a,b)=>a.score-b.score||C.strength(a.m.combo)-C.strength(b.m.combo)||a.m.combo.high-b.m.combo.high||a.m.cards[0]-b.m.cards[0]);
  const best=scored[0],passCircle=v.last?circle.evaluate({type:'pass'}):null;
  // Sampled replies must not override a public, certain exit or an unbeatable
  // guard. In particular, passing here can hand an opponent the first finish.
  if(best.control>.999&&(best.exit||mustBlock)&&model.unbeatable(best.m.combo,enemySeats))return Object.assign({type:'play'},best.m);
  const rescue=best.circle&&passCircle&&(passCircle.enemyFirst-best.circle.enemyFirst>.25||best.circle.partnerFinish-passCircle.partnerFinish>.35);
  // Only preserve a last bomb in a quiet game when it would strand loose
  // singles. Ordinary replies and hands with other stoppers stay eligible;
  // spending one control card is not equivalent to spending the final one.
  if(v.last&&!teammate&&danger>5&&!mustBlock&&!best.exit&&!rescue&&C.strength(best.m.combo)>0&&v.players[v.last.seat].count>5&&best.tail.weak>1.05&&best.tail.controls<.5&&best.tail.spent>.25&&best.retentionPenalty>6&&best.turns>=base-1)return {type:'pass'};
  const endingMove=ending(v,me,scored,model,!mustBlock);if(endingMove)return endingMove;
  if(teammate&&mustBlock&&best.control<=model.control(v.last.combo,enemySeats)+.02&&!best.exit)return {type:'pass'};
  const safeHandoff=circle.runnerMe&&best.circle&&passCircle&&best.turns<base&&best.circle.teamControl>=passCircle.teamControl-.08&&best.circle.enemyFirst<=passCircle.enemyFirst+.03;
  if(teammate&&!mustBlock&&best.turns>=base-1&&!best.exit&&!safeHandoff)return {type:'pass'};
  if(v.last&&!teammate&&!urgent&&!best.exit&&!rescue&&hand.length>6&&best.turns>=base-1&&C.strength(best.m.combo)>0)return {type:'pass'};
  if(v.last&&!teammate&&danger>5&&best.turns>=base&&best.shapeDamage>=7&&!best.exit)return {type:'pass'};
  return Object.assign({type:'play'},best.m);
}
module.exports={choose,planner,damage};
