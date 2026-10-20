'use strict';
const C=require('./doudizhu-cards'),LIMIT=162;
const pack=c=>c?[c.kind,c.high,c.count]:null;
function unpack(a){return Array.isArray(a)&&C.TYPES[a[0]]&&Number.isFinite(a[1])&&Number.isInteger(a[2])?{kind:a[0],high:a[1],count:a[2]}:null;}
// Public actions only; counts and faced shape are captured BEFORE the move.
function record(s,seat,cards,combo){
  if(!s.publicHistory)s.publicHistory=[];s.publicHistory.push([seat,cards.slice(),pack(combo),s.last?s.last.seat:-1,pack(s.last&&s.last.combo),s.hands.map(h=>h.length)]);
  if(s.publicHistory.length>LIMIT)s.publicHistory=s.publicHistory.slice(-LIMIT);
}
function project(s){return (s.publicHistory||[]).slice(-LIMIT).map(row=>row.map(x=>Array.isArray(x)?x.slice():x));}
function events(v){
  const out=[];for(const row of (v.publicHistory||[]).slice(-LIMIT)){
    if(!Array.isArray(row)||row.length!==6||!Number.isInteger(row[0])||row[0]<0||row[0]>2||!Array.isArray(row[1])||!Array.isArray(row[5])||row[5].length!==3||!Number.isInteger(row[3])||row[3]<-1||row[3]>2)continue;
    const combo=unpack(row[2]),faced=unpack(row[4]);if(row[1].some(id=>!Number.isInteger(id)||id<0||id>=54)||row[1].length&&!combo||!row[1].length&&(!faced||row[3]<0))continue;
    out.push({seat:row[0],cards:row[1].slice(),combo,owner:row[3],faced,counts:row[5].slice()});
  }return out;
}
module.exports={record,project,events,LIMIT};
