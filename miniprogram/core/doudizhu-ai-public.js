'use strict';
const C=require('./doudizhu-cards');
const team=(seat,landlord)=>seat===landlord?0:1;
function combinations(n,k){if(k<0||k>n)return 0;let v=1;k=Math.min(k,n-k);for(let i=1;i<=k;i++)v=v*(n-k+i)/i;return v;}
function publicModel(v,me){
  const excluded=new Set(v.hand.concat(v.played||[])),known=v.players.map(()=>[]);
  if(v.landlord!==me&&v.players[v.landlord])known[v.landlord]=(v.bottom||[]).filter(id=>!excluded.has(id));
  const fixed=new Set(known.flat()),pool=Array.from({length:54},(_,id)=>id).filter(id=>!excluded.has(id)&&!fixed.has(id)),counts=C.groups(pool),responses=new Map(),possible=new Map();
  function draw(available,n,need){if(need<=0)return 1;if(need>available||need>n||n>pool.length||n<0)return 0;let p=0;const denominator=combinations(pool.length,n);for(let i=Math.max(need,n-pool.length+available);i<=Math.min(n,available);i++)p+=combinations(available,i)*combinations(pool.length-available,n-i)/denominator;return Math.max(0,Math.min(1,p));}
  function pattern(seat,requirements){
    const held=C.groups(known[seat]),n=v.players[seat].count-known[seat].length;let p=1,total=0;
    for(const [rank,need] of requirements){const missing=Math.max(0,need-(held[rank]||[]).length);total+=missing;p*=draw((counts[rank]||[]).length,n,missing);}return total>n?0:p;
  }
  function rocketProbability(seat){const needed=[52,53].filter(id=>!known[seat].includes(id)),n=v.players[seat].count-known[seat].length;if(needed.length>n||needed.some(id=>!pool.includes(id)))return 0;return needed.reduce((p,id,i)=>p*(n-i)/(pool.length-i),1);}
  function response(combo,seat,bombs=true){
    const key=C.key(combo)+'|'+seat+'|'+bombs;if(responses.has(key))return responses.get(key);const count=v.players[seat].count;if(!count||combo.kind==='rocket')return 0;
    if(known[seat].length===count)return C.moves(known[seat],combo).some(m=>bombs||!C.strength(m.combo))?1:0;
    let survival=1,exactPair=false;const add=p=>{survival*=1-Math.max(0,Math.min(1,p));},held=known[seat],n=count-held.length,tier=C.strength(combo);
    if(!tier&&count>=combo.count){
      if(combo.kind==='single'){
        const above=pool.filter(id=>C.power(C.card(id).rank)>combo.high).length;add(held.some(id=>C.power(C.card(id).rank)>combo.high)?1:draw(above,n,1));
      }else if(combo.kind==='pair'&&count===2){
        let ways=0;const denominator=combinations(pool.length,n);
        for(let rank=2;rank<=14;rank++)if(C.power(rank)>combo.high){const fixed=held.filter(id=>C.card(id).rank===rank).length;if(fixed===held.length)ways+=combinations((counts[rank]||[]).length,2-fixed);}
        // Natural pairs and a whole rocket are disjoint two-card holdings.
        add((denominator?ways/denominator:0)+(bombs?rocketProbability(seat):0));exactPair=true;
      }else if(['pair','triple','tripleSingle','triplePair','fourSingle','fourPair'].includes(combo.kind)){
        const need=combo.kind==='pair'?2:combo.kind.startsWith('four')?4:3;
        for(let rank=2;rank<=14;rank++)if(C.power(rank)>combo.high)add(pattern(seat,[[rank,need]]));
      }else {
        const multi=combo.kind==='straight'?1:combo.kind==='pairs'?2:3,length=combo.kind==='planeSingle'?combo.count/4:combo.kind==='planePair'?combo.count/5:combo.count/multi;
        for(let high=Math.max(combo.high+1,3+length-1);high<=14;high++)add(pattern(seat,Array.from({length},(_,i)=>[high-length+1+i,multi])));
      }
    }
    if(bombs){if(count>=4&&tier<2)for(let rank=2;rank<=14;rank++)if(!tier||C.power(rank)>combo.high)add(pattern(seat,[[rank,4]]));
      if(count>=2&&!exactPair&&(combo.kind!=='single'||combo.high===17))add(rocketProbability(seat));}
    const value=1-survival;responses.set(key,value);return value;
  }
  function sampleHands(random){
    const hands=known.map(h=>h.slice()),cards=pool.slice();hands[me]=v.hand.slice();if(cards.length!==v.players.reduce((n,p)=>n+(p.seat===me?0:p.count-hands[p.seat].length),0))return null;
    for(let i=cards.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}let at=0;
    for(const p of v.players)if(p.seat!==me){if(hands[p.seat].length>p.count)return null;while(hands[p.seat].length<p.count)hands[p.seat].push(cards[at++]);}return hands;
  }
  function deals(random,limit=8){
    const others=v.players.filter(p=>p.seat!==me),slots=others.map(p=>p.count-known[p.seat].length);if(slots.some(n=>n<0)||slots.reduce((a,b)=>a+b,0)!==pool.length)return [];
    const result=[],possibilities=combinations(pool.length,slots[0]);
    if(possibilities<=24){
      function take(start,chosen){if(chosen.length===slots[0]){const used=new Set(chosen),hands=known.map(h=>h.slice());hands[me]=v.hand.slice();hands[others[0].seat].push(...chosen);hands[others[1].seat].push(...pool.filter(id=>!used.has(id)));result.push(hands);return;}for(let i=start;i<=pool.length-(slots[0]-chosen.length);i++)take(i+1,chosen.concat(pool[i]));}take(0,[]);
    }else {const seen=new Set();for(let tries=0;tries<limit*6&&result.length<limit;tries++){const hands=sampleHands(random);if(!hands)break;const key=hands.map(h=>h.slice().sort((a,b)=>a-b).join(',')).join('|');if(!seen.has(key)){seen.add(key);result.push(hands);}}}return result;
  }
  return {known,pool,response,sampleHands,deals,control(combo,seats){return seats.reduce((p,seat)=>p*(1-response(combo,seat)),1);},unbeatable(combo,seats){
    return seats.every(seat=>{if(!possible.has(seat))possible.set(seat,C.moves(pool.concat(known[seat])));return !possible.get(seat).some(m=>m.cards.length<=v.players[seat].count&&C.beats(m.combo,combo));});
  }};
}
module.exports={publicModel,team,combinations};
