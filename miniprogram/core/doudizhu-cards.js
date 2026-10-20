'use strict';
// One deck. IDs retain the existing card renderer's mapping, with 2 promoted
// only in ordinary comparisons; sequences always run from 3 through A.
const Base=require('./guandan-cards');
const TYPES={single:'单张',pair:'对子',triple:'三张',tripleSingle:'三带一',triplePair:'三带二',straight:'顺子',pairs:'连对',triples:'飞机',planeSingle:'飞机带单',planePair:'飞机带对',fourSingle:'四带二',fourPair:'四带两对',bomb:'炸弹',rocket:'王炸'};
function card(id){if(!Number.isInteger(id)||id<0||id>=54)throw new Error('无效的牌');return Base.card(id);}
function power(rank){return rank===2?15:rank>=15?rank+1:rank;}
function label(rank){return Base.label(rank);}
function display(id){const c=card(id);return Object.assign(c,{label:label(c.rank),symbol:c.suit<0?'★':['♠','♥','♣','♦'][c.suit],red:c.suit===1||c.suit===3||c.rank===16,wild:false});}
function sorted(ids){return ids.slice().sort((a,b)=>power(card(a).rank)-power(card(b).rank)||a-b);}
function groups(ids){const g={};for(const id of sorted(ids)){const r=card(id).rank;(g[r]||(g[r]=[])).push(id);}return g;}
function subset(g,ranks){const pool={};for(const r of ranks)pool[r]=g[r];return pool;}
function shape(kind,rank,count){return {kind,high:power(rank),count};}
function key(c){return c.kind+':'+c.high+':'+c.count;}
function strength(c){return c.kind==='rocket'?2:c.kind==='bomb'?1:0;}
function beats(a,b){if(!b)return true;if(b.kind==='rocket')return false;if(a.kind==='rocket')return true;if(a.kind==='bomb')return b.kind!=='bomb'||a.high>b.high;return b.kind!=='bomb'&&a.kind===b.kind&&a.count===b.count&&a.high>b.high;}
function classify(ids){
  if(!Array.isArray(ids)||!ids.length||ids.length>20||new Set(ids).size!==ids.length)return [];
  try{ids.forEach(card);}catch(e){return [];}
  const n=ids.length,g=groups(ids),ranks=Object.keys(g).map(Number),out=[];
  const add=(kind,rank)=>out.push(shape(kind,rank,n));
  if(n===1)add('single',ranks[0]);
  if(n===2&&g[15]&&g[16])add('rocket',16);
  if(ranks.length===1&&n>=2&&n<=4)add(n===2?'pair':n===3?'triple':'bomb',ranks[0]);
  for(const r of ranks){
    if(g[r].length===3&&n===4)add('tripleSingle',r);
    if(g[r].length===3&&n===5&&ranks.some(x=>x!==r&&g[x].length===2))add('triplePair',r);
    const rest=ranks.filter(x=>x!==r);
    if(g[r].length===4&&n===6&&!(g[15]&&g[16]))add('fourSingle',r);
    if(g[r].length===4&&n===8&&rest.length===2&&rest.every(x=>g[x].length===2))add('fourPair',r);
  }
  const consecutive=ranks.every(r=>r>=3&&r<=14)&&ranks.every((r,i)=>!i||r===ranks[i-1]+1);
  if(consecutive&&ranks.length>=5&&ranks.every(r=>g[r].length===1))add('straight',ranks[ranks.length-1]);
  if(consecutive&&ranks.length>=3&&ranks.every(r=>g[r].length===2))add('pairs',ranks[ranks.length-1]);
  // Try every possible airplane body; attachments cannot use its ranks. Single
  // wings may include a pair/triple, but may not hide a bomb or the whole rocket.
  for(let len=2;len<=6;len++)for(let start=3;start+len-1<=14;start++){
    const body=Array.from({length:len},(_,i)=>start+i);if(!body.every(r=>g[r]&&g[r].length===3))continue;
    const rest=ranks.filter(r=>!body.includes(r)),left=rest.reduce((n,r)=>n+g[r].length,0),high=body[body.length-1];
    if(n===len*3&&left===0)add('triples',high);
    if(n===len*4&&left===len&&rest.every(r=>g[r].length<=3)&&!(g[15]&&g[16]))add('planeSingle',high);
    if(n===len*5&&rest.length===len&&rest.every(r=>g[r].length===2))add('planePair',high);
  }
  return Array.from(new Map(out.map(c=>[key(c),c])).values());
}
function describe(c){const rank=c.high===15?2:c.high>=16?c.high-1:c.high;return TYPES[c.kind]+' '+c.count+' 张'+(c.kind==='rocket'?'':' · '+label(rank));}
function picks(pool,count,each,limit=80){
  const ranks=Object.keys(pool).map(Number).sort((a,b)=>power(a)-power(b)),out=[];
  function visit(at,left,cards){if(!left){if(!(cards.includes(52)&&cards.includes(53)))out.push(cards);return;}if(out.length>=limit)return;
    for(let i=at;i<ranks.length;i++){const list=pool[ranks[i]],max=each===2?(list.length>=2?2:0):Math.min(list.length,3,left);
      for(let take=each===2?2:1;take<=max;take+=each===2?2:1){if(take>left)continue;visit(i+1,left-take,cards.concat(list.slice(0,take)));if(out.length>=limit)return;}}
  }visit(0,count,[]);return out;
}
function moves(hand,last=null){
  const g=groups(hand),ranks=Object.keys(g).map(Number).sort((a,b)=>power(a)-power(b)),found=new Map();
  const add=(ids,known)=>{for(const combo of known?[known]:classify(ids))if(beats(combo,last)){const id=key(combo)+':'+sorted(ids).join(',');if(!found.has(id))found.set(id,{cards:ids,combo});}};
  for(const r of ranks)for(let n=1;n<=Math.min(4,g[r].length);n++)add(g[r].slice(0,n),shape(['','single','pair','triple','bomb'][n],r,n));
  if(g[15]&&g[16])add([52,53],shape('rocket',16,2));
  for(const r of ranks){
    if(g[r].length>=3)for(const a of ranks.filter(x=>x!==r)){add(g[r].slice(0,3).concat(g[a].slice(0,1)),shape('tripleSingle',r,4));if(g[a].length>=2)add(g[r].slice(0,3).concat(g[a].slice(0,2)),shape('triplePair',r,5));}
    if(g[r].length===4){const pool=subset(g,ranks.filter(x=>x!==r));for(const wing of picks(pool,2,1))add(g[r].concat(wing),shape('fourSingle',r,6));for(const wing of picks(pool,4,2))add(g[r].concat(wing),shape('fourPair',r,8));}
  }
  for(const [copies,min] of [[1,5],[2,3],[3,2]])for(let start=3;start<=14;start++){
    let ids=[];for(let end=start;end<=14&&g[end]&&g[end].length>=copies;end++){
      ids=ids.concat(g[end].slice(0,copies));const len=end-start+1;if(len<min||ids.length>20)continue;add(ids,shape(copies===1?'straight':copies===2?'pairs':'triples',end,ids.length));
      if(copies===3){const pool=subset(g,ranks.filter(r=>r<start||r>end));if(len*4<=20)for(const wing of picks(pool,len,1))add(ids.concat(wing),shape('planeSingle',end,len*4));if(len*5<=20)for(const wing of picks(pool,len*2,2))add(ids.concat(wing),shape('planePair',end,len*5));}
    }
  }
  // Include all valid interpretations of the whole hand even when attachment
  // enumeration was bounded; a bot must never miss an immediate win.
  add(hand.slice());return Array.from(found.values());
}
module.exports={card,power,label,display,sorted,groups,classify,key,strength,beats,describe,moves,TYPES};
