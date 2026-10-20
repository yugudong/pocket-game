'use strict';
const C=require('./guandan-cards');
const actionKey=m=>C.key(m.combo)+'|'+m.cards.slice().sort((a,b)=>a-b).join(',');
// Two complete groups: lead the ordinary/weaker group and finish on the bomb
// for partner wind, unless somebody could finish immediately by taking it.
// Public impossibility is a proof; a sampled absence is never used as one.
function closingPlan(v,me,legal,model){
  const bias=new Map(),routes=[],enemies=v.players.filter(p=>p.seat%2!==me%2&&p.count>0).map(p=>p.seat);
  if(v.hand.length>20||v.last&&v.last.seat%2===me%2)return {bias,proven:null};
  function prefer(m,value){const key=actionKey(m),prior=bias.get(key);if(prior===undefined||value<prior)bias.set(key,value);}
  for(const first of legal){
    if(first.cards.length>=v.hand.length||v.hand.length-first.cards.length>10)continue;const used=new Set(first.cards),left=v.hand.filter(id=>!used.has(id));
    const bombs=C.classify(left,v.level).filter(c=>C.strength(c)&&C.beats(c,first.combo)).sort((a,b)=>C.strength(b)-C.strength(a)||b.count-a.count||b.high-a.high);if(!bombs.length)continue;
    const last={cards:left,combo:bombs[0]},threats=enemies.filter(seat=>model.couldFinish(first.combo,seat)),threat=threats.length>0,confidence=.5+.5*model.control(last.combo,enemies);
    // Spending the bomb helps only if it actually prevents the whole-hand
    // reply. A larger enemy bomb that beats both routes is not a reason to
    // sacrifice our reserve or undo a wildcard that preserved a natural bomb.
    const protects=threat&&threats.every(seat=>!model.couldFinish(last.combo,seat));
    if(protects){prefer(first,24*confidence);prefer(last,-12*confidence);}else if(!threat){prefer(first,-24*confidence);prefer(last,12*confidence);}
    if(model.unbeatable(last.combo,enemies))routes.push({command:threat?last:first,threat,bomb:last});
  }
  // A safe opening retains the strongest finish and wind. If every opening
  // risks an enemy finish, take control first, then lead the other whole group.
  routes.sort((a,b)=>Number(a.threat)-Number(b.threat)||C.strength(b.bomb.combo)-C.strength(a.bomb.combo)||b.bomb.combo.count-a.bomb.combo.count||b.bomb.combo.high-a.bomb.combo.high||a.command.combo.high-b.command.combo.high||a.command.cards[0]-b.command.cards[0]);
  return {bias,proven:routes.length?{type:'play',...routes[0].command}:null};
}
module.exports={closingPlan,actionKey};
