'use strict';
const C=require('./guandan-cards');
function combinations(n,k){if(k<0||k>n)return 0;k=Math.min(k,n-k);let value=1;for(let i=1;i<=k;i++)value=value*(n-k+i)/i;return value;}
// Estimates use only the private projection and publicly revealed cards. There
// is no persistent belief state, so cold recovery produces the same decision.
function publicModel(v,me){
  const level=v.level,excluded=new Set(v.hand.concat(v.played||[])),owners=new Map();
  if(v.antiTribute)for(const holder of v.antiTribute.holders)for(const id of holder.cards)owners.set(id,holder.seat);
  for(const gift of v.tributes||[]){owners.set(gift.card,gift.to);if(Number.isInteger(gift.returnCard))owners.set(gift.returnCard,gift.from);}
  const known=v.players.map(()=>[]);for(const [id,seat] of owners)if(!excluded.has(id)&&seat!==me&&v.players[seat]&&v.players[seat].count)known[seat].push(id);
  const pool=Array.from({length:108},(_,id)=>id).filter(id=>!excluded.has(id)&&!owners.has(id)),counts=Array(17).fill(0),suits=Array.from({length:4},()=>Array(17).fill(0));let wild=0;
  for(const id of pool){const c=C.card(id);if(C.wild(id,level))wild++;else {counts[c.rank]++;if(c.suit>=0)suits[c.suit][c.rank]++;}}
  const probabilities=new Map(),responses=new Map(),possibleMoves=new Map(),patterns=new Map();
  function draw(available,n,need){if(need<=0)return 1;if(need>available||need>n||pool.length<n)return 0;const key=available+','+n+','+need;if(probabilities.has(key))return probabilities.get(key);let p=0;const denominator=combinations(pool.length,n);for(let i=Math.max(need,n-(pool.length-available));i<=Math.min(n,available);i++)p+=combinations(available,i)*combinations(pool.length-available,n-i)/denominator;p=Math.max(0,Math.min(1,p));probabilities.set(key,p);return p;}
  function pattern(seat,requirements,suit){
    const key=seat+'|'+suit+'|'+requirements.map(r=>r.join(':')).join(',');if(patterns.has(key))return patterns.get(key);const result=patternValue(seat,requirements,suit);patterns.set(key,result);return result;
  }
  function patternValue(seat,requirements,suit){
    if(requirements.reduce((n,r)=>n+r[1],0)>v.players[seat].count)return 0;
    const held=known[seat],n=v.players[seat].count-held.length;if(n<0)return 0;let probability=1,missing=0,heldWild=0;const fixed=Array(17).fill(0);
    for(const id of held){const c=C.card(id);if(C.wild(id,level))heldWild++;else if(suit===undefined||c.suit===suit)fixed[c.rank]++;}
    for(const [rank,need] of requirements){const canWild=rank<15,available=(suit===undefined?counts[rank]:suits[suit][rank]);missing+=Math.max(0,need-fixed[rank]-available);probability*=draw(available+(canWild?wild:0),n,need-fixed[rank]-(canWild?heldWild:0));}
    if(missing>wild+heldWild)return 0;return probability;
  }
  function response(combo,seat,bombs=true){
    const key=C.key(combo)+'|'+seat+'|'+bombs;if(responses.has(key))return responses.get(key);const count=v.players[seat].count;if(count<1)return 0;let survival=1;
    function add(p){survival*=1-Math.min(1,Math.max(0,p));}
    if(known[seat].length===count){const p=C.moves(known[seat],level).some(m=>C.beats(m.combo,combo)&&(bombs||!C.strength(m.combo)))?1:0;responses.set(key,p);return p;}
    const tier=C.strength(combo),ordinary=['single','pair','triple','full'].includes(combo.kind);
    if(!tier&&count>=combo.count){
      if(combo.kind==='single'){
        // Higher ranks are mutually exclusive card types. Counting them as
        // independent events can miss a certain loss against a reported single.
        const held=known[seat];if(held.some(id=>C.power(C.card(id).rank,level)>combo.high))add(1);
        else {let above=C.power(level,level)>combo.high?wild:0;for(let r=2;r<=16;r++)if(C.power(r,level)>combo.high)above+=counts[r];add(draw(above,count-held.length,1));}
      }else if(combo.kind==='pair'&&count===2){
        // Exactly two cards: different natural pairs and wildcard pairs are
        // disjoint combinations, so no independence approximation is needed.
        const held=known[seat];let ways=0;
        if(!held.length){for(let r=2;r<=16;r++)if(C.power(r,level)>combo.high){ways+=combinations(counts[r],2);if(r<15)ways+=wild*counts[r];}if(combo.high<16)ways+=combinations(wild,2);add(ways/combinations(pool.length,2));}
        else {const card=C.card(held[0]);if(C.wild(card.id,level)){for(let r=2;r<=14;r++)if(C.power(r,level)>combo.high)ways+=counts[r];if(combo.high<16)ways+=wild;}
          else if(C.power(card.rank,level)>combo.high)ways=counts[card.rank]+(card.rank<15?wild:0);add(ways/pool.length);}
      }else if(ordinary){for(let r=2;r<=16;r++)if(C.power(r,level)>combo.high){const multi=combo.kind==='pair'?2:3;let p=pattern(seat,[[r,multi]]);if(combo.kind==='full'){let noPair=1;for(let other=2;other<=16;other++)if(other!==r)noPair*=1-pattern(seat,[[other,2]]);p*=1-noPair;}add(p);}}
      else {const length=combo.kind==='straight'?5:combo.kind==='pairs'?3:2,multi=combo.kind==='straight'?1:combo.kind==='pairs'?2:3;for(let high=combo.high+1;high<=14;high++)add(pattern(seat,Array.from({length},(_,i)=>[high-length+1+i===1?14:high-length+1+i,multi])));}
    }
    if(bombs&&count>=4&&tier<4){
      for(let r=2;r<=14;r++){
        const minimum=tier===3?Math.max(6,combo.count+(C.power(r,level)>combo.high?0:1)):tier===2?6:tier===1?Math.max(4,combo.count+(C.power(r,level)>combo.high?0:1)):4;
        if(count>=minimum)add(pattern(seat,[[r,minimum]]));
      }
      if(tier<3&&count>=5)for(let suit=0;suit<4;suit++)for(let high=tier===2?combo.high+1:5;high<=14;high++)add(pattern(seat,Array.from({length:5},(_,i)=>[high-4+i===1?14:high-4+i,1]),suit));
      add(pattern(seat,[[15,2],[16,2]]));
    }
    const p=1-survival;responses.set(key,p);return p;
  }
  const model={known,response,control(combo,seats){return seats.reduce((p,seat)=>p*(1-response(combo,seat)),1);},unbeatable(combo,seats){
    // A conservative proof: even the entire still-available pool must not
    // contain a beating shape small enough for any opponent to hold.
    return seats.every(seat=>{if(!possibleMoves.has(seat))possibleMoves.set(seat,C.moves(pool.concat(known[seat]),level));return !possibleMoves.get(seat).some(m=>m.cards.length<=v.players[seat].count&&C.beats(m.combo,combo));});
  },couldFinish(combo,seat){
    const count=v.players[seat].count;if(!count||count>10)return false;
    if(known[seat].length===count)return C.classify(known[seat],level).some(c=>C.beats(c,combo));
    // Different counts normally cannot finish on this shape, but a whole bomb
    // (including a straight flush) can override that count mismatch.
    if(count!==combo.count&&count<4)return false;
    if(!possibleMoves.has(seat))possibleMoves.set(seat,C.moves(pool.concat(known[seat]),level));
    return possibleMoves.get(seat).some(m=>m.cards.length===count&&C.beats(m.combo,combo));
  },sampleHands(random){
    const hands=known.map(h=>h.slice()),cards=pool.slice();hands[me]=v.hand.slice();if(cards.length!==v.players.reduce((n,p)=>n+(p.seat===me?0:p.count-hands[p.seat].length),0))return null;
    for(let i=cards.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}let at=0;
    for(const p of v.players)if(p.seat!==me)while(hands[p.seat].length<p.count)hands[p.seat].push(cards[at++]);return hands;
  },deals(random){
    const seats=v.players.filter(p=>p.seat!==me),slots=seats.map(p=>p.count-known[p.seat].length);if(slots.some(n=>n<0)||slots.reduce((a,b)=>a+b,0)!==pool.length)return [];
    let possibilities=1,left=pool.length;for(const n of slots){possibilities*=combinations(left,n);left-=n;}
    const result=[];
    if(possibilities<=12){
      const hands=known.map(h=>h.slice());hands[me]=v.hand.slice();
      function assign(at,available){
        if(at===seats.length){result.push(hands.map(h=>h.slice()));return;}
        const seat=seats[at].seat,n=slots[at];
        function take(start,chosen){if(chosen.length===n){const used=new Set(chosen);hands[seat]=known[seat].concat(chosen);assign(at+1,available.filter(id=>!used.has(id)));return;}for(let i=start;i<=available.length-(n-chosen.length);i++)take(i+1,chosen.concat(available[i]));}
        take(0,[]);
      }
      assign(0,pool);return result;
    }
    const seen=new Set();for(let attempt=0;attempt<48&&result.length<6;attempt++){const hands=model.sampleHands(random);if(!hands)return [];const key=hands.map(h=>h.slice().sort((a,b)=>a-b).join(',')).join('|');if(!seen.has(key)){seen.add(key);result.push(hands);}}
    return result;
  }};return model;
}
module.exports={publicModel};
