'use strict';
const C=require('../../../miniprogram/core/guandan-cards');
function breakCost(hand,move,level){
  const before={},used={};for(const id of hand){const r=C.card(id).rank;before[r]=(before[r]||0)+1;}for(const id of move.cards){const r=C.card(id).rank;used[r]=(used[r]||0)+1;}
  let cost=0;for(const rank of Object.keys(used))if(used[rank]<before[rank])cost+=before[rank]>=4?10:before[rank]>=2?2:0;return cost+move.cards.filter(id=>C.wild(id,level)).length;
}
// Simulate the next active players in seat order. Each player chooses from its
// own hypothetical hand and PUBLIC counts; policy never inspects enemy cards.
function rollCircle(view,me,command,deal,profiles,getMoves){
  const hands=deal.map(h=>h.slice()),finish=(view.finish||[]).slice(),initialFinish=finish.slice(),initial=hands.map(h=>h.length),team=me%2,partner=(me+2)%4;
  let last=view.last,passed=(view.passed||[]).slice(),turn=me,resolved=false,partnerPlayed=0,enemyShed=0;
  const canPartnerTake=command.type==='play'&&getMoves(hands[partner]).some(m=>!C.strength(m.combo)&&C.beats(m.combo,command.combo));
  function done(){return finish.length>=3||finish.length===2&&finish[0]%2===finish[1]%2;}
  function next(from){for(let d=1;d<=4;d++)if(hands[(from+d)%4].length)return (from+d)%4;return -1;}
  function act(actor,cmd){
    if(cmd.type==='play'){
      const used=new Set(cmd.cards);hands[actor]=hands[actor].filter(id=>!used.has(id));last={seat:actor,combo:cmd.combo};passed=[];
      if(actor===partner)partnerPlayed+=cmd.cards.length;else if(actor%2!==team)enemyShed+=cmd.cards.length;
      if(!hands[actor].length)finish.push(actor);turn=next(actor);
    }else {
      passed.push(actor);const challengers=[0,1,2,3].filter(seat=>hands[seat].length&&seat!==last.seat);
      if(challengers.every(seat=>passed.includes(seat))){const owner=last.seat,p=(owner+2)%4;turn=hands[owner].length?owner:hands[p].length?p:next(owner);last=null;passed=[];resolved=true;}else turn=next(actor);
    }
  }
  function reply(actor){
    const hand=hands[actor],legal=getMoves(hand).filter(m=>C.beats(m.combo,last&&last.combo));
    const finishMove=legal.find(m=>m.cards.length===hand.length);if(finishMove)return {type:'play',...finishMove};
    const ordinary=legal.filter(m=>!C.strength(m.combo)).map(m=>({m,cost:breakCost(hand,m,view.level)})).sort((a,b)=>a.cost-b.cost||a.m.combo.high-b.m.combo.high),owner=last.seat,allied=owner%2===actor%2;
    if(allied){
      const danger=[0,1,2,3].some(seat=>seat%2!==actor%2&&hands[seat].length===last.combo.count&&!passed.includes(seat));
      if(danger){const guard=ordinary.find(row=>row.m.combo.high>=16);if(guard)return {type:'play',...guard.m};}
      const actorTurns=profiles[actor].turns*hand.length/Math.max(1,initial[actor]),ownerTurns=profiles[owner].turns*hands[owner].length/Math.max(1,initial[owner]);
      const runner=hand.length<=6&&hands[owner].length>=hand.length+4||actorTurns+1<ownerTurns;
      const gentle=ordinary.find(row=>row.cost<4&&row.m.combo.high<14);if(runner&&hands[owner].length&&gentle)return {type:'play',...gentle.m};return {type:'pass'};
    }
    if(ordinary.length){const best=ordinary[0];if(best.cost>=8&&hands[owner].length>5&&hand.length>6)return {type:'pass'};return {type:'play',...best.m};}
    if(legal.length&&(hands[owner].length<=5||hand.length<=6||hands[(actor+2)%4].length<=2)){
      legal.sort((a,b)=>C.strength(a.combo)-C.strength(b.combo)||a.combo.count-b.combo.count||a.combo.high-b.combo.high);return {type:'play',...legal[0]};
    }return {type:'pass'};
  }
  act(me,command);for(let n=0;n<3&&!done()&&!resolved&&turn!==me&&turn>=0;n++){const actor=turn;act(actor,reply(actor));}
  const owner=last?last.seat:turn,first=finish.length?finish[0]%2:-1,partnerFinished=!initialFinish.includes(partner)&&finish.includes(partner),enemyFinished=finish.filter(seat=>seat%2!==team&&!initialFinish.includes(seat)).length;
  return {teamControl:owner>=0&&owner%2===team?1:0,ownControl:owner===me?1:0,partnerCanTake:canPartnerTake?1:0,partnerReceives:partnerPlayed?1:0,partnerSafe:partnerPlayed&&(owner===partner||partnerFinished&&first===team)?1:0,partnerFinish:partnerFinished?1:0,enemyFirst:!initialFinish.length&&first>=0&&first!==team?1:0,enemyFinish:enemyFinished,allyShed:partnerPlayed,enemyShed,teamWin:done()&&first===team?1:0};
}
function teamCircle(view,me,model,ownTurns){
  const partner=(me+2)%4,myCount=view.players[me].count,partnerCount=view.players[partner].count,profiles=view.players.map(p=>model.profile(p.seat));profiles[me]={...profiles[me],turns:ownTurns};
  const runnerMe=partnerCount>0&&(ownTurns+1<profiles[partner].turns&&myCount<=partnerCount+3||myCount<=6&&partnerCount>=myCount+4);
  const runnerPartner=partnerCount>0&&!runnerMe&&(profiles[partner].turns+1<ownTurns&&partnerCount<=myCount+3||partnerCount<=6&&myCount>=partnerCount+4),cache=new Map();
  function evaluate(command){
    const key=command.type==='pass'?'pass':C.key(command.combo);if(cache.has(key))return cache.get(key);const totals={teamControl:0,ownControl:0,partnerCanTake:0,partnerReceives:0,partnerSafe:0,partnerFinish:0,enemyFirst:0,enemyFinish:0,allyShed:0,enemyShed:0,teamWin:0};
    for(const sample of model.samples()){const result=rollCircle(view,me,command,sample.hands,profiles,model.moves);for(const name of Object.keys(totals))totals[name]+=result[name]*sample.weight;}
    cache.set(key,totals);return totals;
  }
  const evidenceCount=model.observations.reduce((n,es)=>n+es.length,0),confidence=.4+.4*Math.min(1,evidenceCount/5);
  function adjustment(result){return confidence*(result.enemyFirst*70+result.enemyFinish*8+(1-result.teamControl)*5-result.partnerFinish*22-result.partnerSafe*(runnerPartner?16:4)-result.allyShed*.6+result.enemyShed*.2);}
  return {runnerMe,runnerPartner,evaluate,adjustment,profiles};
}
module.exports={rollCircle,teamCircle};
