'use strict';
const C=require('./guandan-cards');
const LIMIT=432;
function pack(combo){return combo?[combo.kind,combo.high,combo.count,...(combo.suit===undefined?[]:[combo.suit])]:null;}
function unpack(tuple){if(!Array.isArray(tuple)||!C.TYPES[tuple[0]]||!Number.isFinite(tuple[1])||!Number.isInteger(tuple[2]))return null;const combo={kind:tuple[0],high:tuple[1],count:tuple[2]};if(tuple.length>3)combo.suit=tuple[3];return combo;}
// [actor, played IDs (empty for pass), played shape, previous owner,
//  previous shape, public card counts BEFORE acting]. Never store hidden cards.
function record(state,seat,cards,combo){
  if(!state.publicHistory)state.publicHistory=[];const last=state.last;
  state.publicHistory.push([seat,cards.slice(),pack(combo),last?last.seat:-1,pack(last&&last.combo),state.hands.map(hand=>hand.length)]);
  if(state.publicHistory.length>LIMIT)state.publicHistory=state.publicHistory.slice(-LIMIT);
}
function project(state){return (state.publicHistory||[]).slice(-LIMIT).map(row=>row.map(value=>Array.isArray(value)?value.slice():value));}
function events(view){
  const out=[];for(const row of (view.publicHistory||[]).slice(-LIMIT)){
    if(!Array.isArray(row)||row.length!==6||!Number.isInteger(row[0])||row[0]<0||row[0]>3||!Array.isArray(row[1])||!Array.isArray(row[5])||row[5].length!==4)continue;
    const combo=unpack(row[2]),faced=unpack(row[4]);if(row[1].some(id=>!Number.isInteger(id)||id<0||id>=108)||row[1].length&&!combo||!row[1].length&&!faced)continue;
    out.push({seat:row[0],cards:row[1].slice(),combo,owner:row[3],faced,counts:row[5].slice()});
  }return out;
}
module.exports={record,project,events,LIMIT};
