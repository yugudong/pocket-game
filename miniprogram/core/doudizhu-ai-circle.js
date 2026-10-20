'use strict';
const C=require('./doudizhu-cards'),{team}=require('./doudizhu-ai-public'),{breakCost}=require('./doudizhu-ai-belief');
// Forecast the other two seats. A simulated player may inspect only its own
// hypothetical cards, public counts and estimated hand profiles.
function rollCircle(v,me,command,deal,profiles,getMoves){
  const hands=deal.map(h=>h.slice()),initial=hands.map(h=>h.length),mine=team(me,v.landlord),partner=me===v.landlord?-1:[0,1,2].find(s=>s!==me&&s!==v.landlord);
  let turn=me,last=v.last,passed=(v.passed||[]).slice(),winner=-1,resolved=false,partnerShed=0,enemyShed=0;
  const canTake=partner>=0&&command.type==='play'&&getMoves(hands[partner]).some(m=>C.beats(m.combo,command.combo)&&(!C.strength(m.combo)||m.cards.length===hands[partner].length));
  function act(actor,cmd){
    if(cmd.type==='play'){const used=new Set(cmd.cards);hands[actor]=hands[actor].filter(id=>!used.has(id));last={seat:actor,combo:cmd.combo};passed=[];
      if(actor===partner)partnerShed+=cmd.cards.length;if(team(actor,v.landlord)!==mine)enemyShed+=cmd.cards.length;if(!hands[actor].length)winner=actor;turn=(actor+1)%3;
    }else {passed.push(actor);if(passed.length===2){turn=last.seat;last=null;passed=[];resolved=true;}else turn=(actor+1)%3;}
  }
  function reply(actor){
    const hand=hands[actor],legal=getMoves(hand).filter(m=>C.beats(m.combo,last.combo)),finish=legal.find(m=>m.cards.length===hand.length);if(finish)return {type:'play',...finish};
    const ordinary=legal.filter(m=>!C.strength(m.combo)).map(m=>({m,cost:breakCost(hand,m)})).sort((a,b)=>a.cost-b.cost||a.m.combo.high-b.m.combo.high),owner=last.seat,allied=team(actor,v.landlord)===team(owner,v.landlord);
    if(allied){
      const danger=hands[v.landlord].length===last.combo.count&&!passed.includes(v.landlord);
      if(danger){const guard=ordinary.slice().sort((a,b)=>b.m.combo.high-a.m.combo.high).find(row=>row.m.combo.high>=15);if(guard)return {type:'play',...guard.m};}
      const turns=profiles[actor].turns*hand.length/Math.max(1,initial[actor]),ownerTurns=profiles[owner].turns*hands[owner].length/Math.max(1,initial[owner]);
      const runner=turns+1<ownerTurns&&hand.length<=hands[owner].length+2||hand.length<=4&&hands[owner].length>=hand.length+4;
      const gentle=ordinary.find(row=>row.cost<4&&row.m.combo.high<14);return runner&&gentle?{type:'play',...gentle.m}:{type:'pass'};
    }
    if(ordinary.length){
      const threat=[0,1,2].some(s=>team(s,v.landlord)!==team(actor,v.landlord)&&hands[s].length===last.combo.count);
      const row=threat?ordinary.slice().sort((a,b)=>b.m.combo.high-a.m.combo.high||a.cost-b.cost)[0]:ordinary[0];if(row.cost>=8&&hands[owner].length>4&&hand.length>5&&!threat)return {type:'pass'};return {type:'play',...row.m};
    }
    const ally=actor===v.landlord?-1:[0,1,2].find(s=>s!==actor&&s!==v.landlord);
    if(legal.length&&(hands[owner].length<=5||hand.length<=5||ally>=0&&hands[ally].length<=2)){legal.sort((a,b)=>C.strength(a.combo)-C.strength(b.combo)||a.combo.high-b.combo.high);return {type:'play',...legal[0]};}return {type:'pass'};
  }
  act(me,command);for(let n=0;n<2&&winner<0&&!resolved&&turn!==me;n++){const actor=turn;act(actor,reply(actor));}
  const owner=last?last.seat:turn,teamWin=winner>=0&&team(winner,v.landlord)===mine;
  return {teamWin:teamWin?1:0,enemyWin:winner>=0&&!teamWin?1:0,teamControl:teamWin||winner<0&&team(owner,v.landlord)===mine?1:0,ownControl:owner===me?1:0,partnerCanTake:canTake?1:0,partnerReceives:partnerShed?1:0,partnerSafe:partnerShed&&(teamWin||winner<0&&owner===partner)?1:0,partnerFinish:partner>=0&&winner===partner?1:0,allyShed:partnerShed,enemyShed};
}
function teamCircle(v,me,model,ownTurns){
  const partner=me===v.landlord?null:v.players.find(p=>p.seat!==me&&p.seat!==v.landlord),profiles=v.players.map(p=>model.profile(p.seat));profiles[me]={...profiles[me],turns:ownTurns};
  const runnerMe=!!partner&&(ownTurns+1<profiles[partner.seat].turns&&v.hand.length<=partner.count+2||v.hand.length<=4&&partner.count>=v.hand.length+4);
  const runnerPartner=!!partner&&!runnerMe&&(profiles[partner.seat].turns+1<ownTurns||partner.count<=3&&v.hand.length>=partner.count+3),cache=new Map();
  const confidence=.35+.4*Math.min(1,model.observations.reduce((n,es)=>n+es.length,0)/5);
  function evaluate(command){
    const key=command.type==='pass'?'pass':C.key(command.combo);if(cache.has(key))return cache.get(key);
    const totals={teamWin:0,enemyWin:0,teamControl:0,ownControl:0,partnerCanTake:0,partnerReceives:0,partnerSafe:0,partnerFinish:0,allyShed:0,enemyShed:0};
    for(const p of model.samples()){const row=rollCircle(v,me,command,p.hands,profiles,model.moves);for(const name of Object.keys(totals))totals[name]+=row[name]*p.weight;}
    cache.set(key,totals);return totals;
  }
  function adjustment(row){return confidence*(row.enemyWin*135-row.teamWin*100+(1-row.teamControl)*6-row.partnerSafe*(runnerPartner?15:4)-row.allyShed*.65+row.enemyShed*.35);}
  return {runnerMe,runnerPartner,profiles,evaluate,adjustment};
}
module.exports={rollCircle,teamCircle};
