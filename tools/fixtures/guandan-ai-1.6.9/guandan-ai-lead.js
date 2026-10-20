'use strict';
const C=require('../../../miniprogram/core/guandan-cards');
const {actionKey}=require('./guandan-ai-exit');
// A free lead does not need a bomb to take control: we already have it.
// First shed ordinary groups without breaking our disjoint bomb reserves.
// Immediate exits and public two-play proofs are handled by the caller first.
function ordinaryLead(v,me,candidates,all,model){
  if(v.last)return null;
  const reserved=new Set(),bombs=all.filter(m=>C.strength(m.combo)).slice().sort((a,b)=>C.strength(b.combo)-C.strength(a.combo)||b.cards.length-a.cards.length||b.combo.high-a.combo.high||(actionKey(a)<actionKey(b)?-1:actionKey(a)>actionKey(b)?1:0));
  if(!bombs.length)return null;
  // Preserve natural bombs first. A wildcard need not be locked into making
  // an existing four-card bomb larger when it can complete an ordinary run
  // while leaving that natural bomb intact.
  for(const catalogue of [bombs.filter(m=>m.cards.every(id=>!C.wild(id,v.level))),bombs])for(const move of catalogue)if(move.cards.every(id=>!reserved.has(id)))for(const id of move.cards)reserved.add(id);
  const enemies=v.players.filter(p=>p.seat%2!==me%2&&p.count>0).map(p=>p.seat);
  // With a different card count, a whole-hand reply must be a bomb. If even
  // its weakest possible rank bomb beats every bomb we could lead, starting
  // with our bomb cannot prevent that reply either. Do not waste it in fear
  // of the very same unavoidable larger bomb.
  const unavoidable=new Set(enemies.filter(seat=>{const count=v.players[seat].count;return count>=4&&count<=10&&bombs.every(m=>C.beats({kind:'bomb',high:2,count},m.combo));}));
  const normal=candidates.filter(move=>!C.strength(move.combo)&&move.cards.every(id=>!reserved.has(id))&&enemies.every(seat=>!model.couldFinish(move.combo,seat)||unavoidable.has(seat)&&v.players[seat].count!==move.combo.count));
  // If every ordinary opening adds a one-reply finish risk that our bombs
  // could prevent, or all cards are bombs, retain defensive/exit choices.
  return normal.length?new Set(normal.map(actionKey)):null;
}
module.exports={ordinaryLead};
