'use strict';
const SUITS=['♠','♥','♣','♦'];
const NAMES={11:'J',12:'Q',13:'K',14:'A',15:'小王',16:'大王'};
const TYPES={single:'单张',pair:'对子',triple:'三张',full:'三带二',straight:'顺子',pairs:'三连对',triples:'钢板',flush:'同花顺',bomb:'炸弹',jokers:'四大天王'};
function card(id){if(!Number.isInteger(id)||id<0||id>=108)throw new Error('无效的牌');const n=id%54;return {id,rank:n<52?2+Math.floor(n/4):n-37,suit:n<52?n%4:-1};}
function power(rank,level){return rank>=15?rank+2:rank===level?16:rank;}
function wild(id,level){const c=card(id);return c.rank===level&&c.suit===1;}
function label(rank){return NAMES[rank]||String(rank);}
function display(id,level){const c=card(id);return Object.assign(c,{label:label(c.rank),symbol:c.suit<0?'★':SUITS[c.suit],red:c.suit===1||c.suit===3||c.rank===16,wild:wild(id,level)});}
function sorted(ids,level){return ids.slice().sort((a,b)=>power(card(a).rank,level)-power(card(b).rank,level)||card(a).suit-card(b).suit||a-b);}
function combo(kind,high,count,suit){const c={kind,high,count};if(suit!==undefined)c.suit=suit;return c;}
function key(c){return c.kind+':'+c.high+':'+c.count+':'+(c.suit===undefined?'':c.suit);}
function sequence(start,length){return Array.from({length},(_,i)=>start+i===1?14:start+i);}
function fits(ids,level,requirements,suit){
  let jokers=false;const counts={},w=ids.filter(id=>wild(id,level)).length;
  for(const id of ids){if(wild(id,level))continue;const c=card(id);if(c.rank>=15)jokers=true;if(suit!==undefined&&c.suit!==suit)return false;counts[c.rank]=(counts[c.rank]||0)+1;}
  if(jokers)return false;let missing=0;
  for(const r of Object.keys(counts))if(!requirements[r]||counts[r]>requirements[r])return false;
  for(const r of Object.keys(requirements))missing+=requirements[r]-(counts[r]||0);
  return missing===w;
}
function classify(ids,level){
  if(!Array.isArray(ids)||!ids.length||ids.length>10||new Set(ids).size!==ids.length)return [];
  ids.forEach(card);const n=ids.length,out=[];
  if(n===1)return[combo('single',power(card(ids[0]).rank,level),1)];
  if(n===4&&ids.every(id=>card(id).rank>=15)&&new Set(ids.map(id=>card(id).rank)).size===2)return[combo('jokers',99,4)];
  if(n===2&&ids.every(id=>card(id).rank===card(ids[0]).rank)&&card(ids[0]).rank>=15)out.push(combo('pair',power(card(ids[0]).rank,level),2));
  for(let r=2;r<=14;r++)if(fits(ids,level,{[r]:n})){
    if(n===2)out.push(combo('pair',power(r,level),n));
    if(n===3)out.push(combo('triple',power(r,level),n));
    if(n>=4)out.push(combo('bomb',power(r,level),n));
  }
  if(n===5){
    for(let r=2;r<=14;r++)for(let p=2;p<=16;p++)if(r!==p){
      // Jokers may form the natural pair in a full house, but cannot be substituted.
      const pair=ids.filter(id=>card(id).rank===p&&!wild(id,level));
      if(p>=15){if(pair.length===2&&fits(ids.filter(id=>!pair.includes(id)),level,{[r]:3}))out.push(combo('full',power(r,level),5));}
      else if(fits(ids,level,{[r]:3,[p]:2}))out.push(combo('full',power(r,level),5));
    }
  }
  for(const spec of [{kind:'straight',length:5,multi:1},{kind:'pairs',length:3,multi:2},{kind:'triples',length:2,multi:3}]){
    if(n!==spec.length*spec.multi)continue;
    for(let start=1;start<=15-spec.length;start++){
      const req={};sequence(start,spec.length).forEach(r=>{req[r]=spec.multi;});
      if(fits(ids,level,req))out.push(combo(spec.kind,start+spec.length-1,n));
      if(spec.kind==='straight')for(let suit=0;suit<4;suit++)if(fits(ids,level,req,suit))out.push(combo('flush',start+4,n,suit));
    }
  }
  return Array.from(new Map(out.map(c=>[key(c),c])).values());
}
function strength(c){return c.kind==='jokers'?4:c.kind==='bomb'?(c.count>=6?3:1):c.kind==='flush'?2:0;}
function preference(a,b){if(a.kind==='flush'||b.kind==='flush')return a.kind!==b.kind?(a.kind==='flush'?-1:1):b.high-a.high||(a.suit||0)-(b.suit||0);return strength(a)-strength(b)||a.high-b.high;}
function beats(a,b){
  if(!b)return true;const sa=strength(a),sb=strength(b);if(sa!==sb)return sa>sb;
  if(sa===4)return false;if(a.kind!==b.kind||a.count!==b.count)return a.kind==='bomb'&&b.kind==='bomb'&&a.count>b.count;
  return a.high>b.high;
}
function describe(c,level){if(!c)return '';const rank=c.high===16?level:c.high===17?15:c.high===18?16:c.high;return TYPES[c.kind]+(c.kind==='jokers'?'':(c.kind==='bomb'?' '+c.count+' 张':'')+' · '+label(rank));}
// Build every shape and rank, choosing representative physical cards. Suit alternatives
// retain straight flushes; legality for arbitrary user-selected cards uses classify().
function moves(hand,level){
  const groups={},ws=hand.filter(id=>wild(id,level)),out=[],seen=new Set();
  for(const id of sorted(hand,level)){if(wild(id,level))continue;const c=card(id);(groups[c.rank]||(groups[c.rank]=[])).push(id);}
  function add(ids,c){if(!ids)return;const k=key(c)+'|'+ids.slice().sort((a,b)=>a-b).join(',');if(!seen.has(k)){seen.add(k);out.push({cards:ids,combo:c});}}
  function take(req,suit,reverse=false){let chosen=[],need=0;for(const r of Object.keys(req)){let pool=(groups[r]||[]).filter(id=>suit===undefined||card(id).suit===suit);if(reverse)pool=pool.slice().reverse();const n=req[r];chosen=chosen.concat(pool.slice(0,n));need+=Math.max(0,n-pool.length);}return need<=ws.length?chosen.concat(ws.slice(0,need)):null;}
  hand.forEach(id=>add([id],combo('single',power(card(id).rank,level),1)));
  for(let r=2;r<=16;r++){
    const maximum=r>=15?Math.min(2,(groups[r]||[]).length):Math.min(10,(groups[r]||[]).length+ws.length);
    for(let n=2;n<=maximum;n++){
      if(r>=15&&n!==2)continue;const ids=r>=15?(groups[r]||[]).length>=n?groups[r].slice(0,n):null:take({[r]:n});
      add(ids,combo(n===2?'pair':n===3?'triple':'bomb',power(r,level),n));
    }
    if(r<=14&&maximum>=3)for(let p=2;p<=16;p++)if(p!==r&&Math.max(0,3-(groups[r]||[]).length)+Math.max(0,2-(groups[p]||[]).length)<=ws.length){const ids=take({[r]:3,[p]:2});if(ids&&(p<15||(groups[p]||[]).length>=2))add(ids,combo('full',power(r,level),5));}
  }
  for(const spec of [{kind:'straight',length:5,multi:1},{kind:'pairs',length:3,multi:2},{kind:'triples',length:2,multi:3}])for(let start=1;start<=15-spec.length;start++){
    const req={};sequence(start,spec.length).forEach(r=>{req[r]=spec.multi;});const c=combo(spec.kind,start+spec.length-1,spec.length*spec.multi);
    add(take(req),c);add(take(req,undefined,true),c);
    if(spec.kind==='straight')for(let suit=0;suit<4;suit++)add(take(req,suit),combo('flush',start+4,5,suit));
  }
  const js=hand.filter(id=>card(id).rank>=15);if(js.length===4)add(js,combo('jokers',99,4));
  return out;
}
module.exports={card,power,wild,label,display,sorted,classify,key,beats,strength,preference,describe,moves,TYPES};
