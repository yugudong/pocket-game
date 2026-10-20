'use strict';
const C=require('./guandan-cards'),Observation=require('./guandan-observation');
function shapeProfile(hand,level,moves=C.moves(hand,level)){
  const ranks=Array(17).fill(0);let wilds=0;for(const id of hand){if(C.wild(id,level))wilds++;else ranks[C.card(id).rank]++;}
  let singles=0,pairs=0,triples=0,bombs=0,runs=0,remaining=new Set(hand),turns=0;const sorted=moves.slice().sort((a,b)=>b.cards.length-a.cards.length||C.strength(a.combo)-C.strength(b.combo)||a.combo.high-b.combo.high);
  while(remaining.size){const move=sorted.find(m=>m.cards.every(id=>remaining.has(id)));if(!move){turns+=remaining.size;singles+=remaining.size;break;}for(const id of move.cards)remaining.delete(id);turns++;
    if(move.combo.kind==='single')singles++;else if(move.combo.kind==='pair')pairs++;else if(move.combo.kind==='triple')triples++;else if(move.combo.kind==='full'){triples++;pairs+=.5;}else if(C.strength(move.combo))bombs++;else runs++;
  }
  return {singles,pairs,triples,bombs,runs,wilds,turns};
}
function evidence(view,me){
  const history=Observation.events(view),later=Array.from({length:4},()=>[]),selected=Array.from({length:4},()=>[]);
  for(let i=history.length-1;i>=0;i--){const e=history[i],seat=e.seat;
    const usefulPass=!e.cards.length&&e.owner%2!==seat%2;
    const usefulPlay=e.cards.length&&(e.owner<0||['single','pair'].includes(e.combo.kind));
    if(seat!==me&&view.players[seat].count&&selected[seat].length<3&&(usefulPass||usefulPlay))selected[seat].push({...e,later:later[seat].slice(),age:history.length-1-i});
    later[seat].push(...e.cards);
  }return selected;
}
function likelihood(hand,observations,level){
  let log=0;for(const e of observations){
    const before=hand.concat(e.later,e.cards);if(before.length!==e.counts[e.seat]||new Set(before).size!==before.length)continue;
    const decay=Math.pow(.83,e.later.length/3)*Math.pow(.985,e.age);let probability=1;
    const ranks={};let wilds=0;for(const id of before){const rank=C.card(id).rank;ranks[rank]=(ranks[rank]||0)+1;if(C.wild(id,level))wilds++;}
    if(!e.cards.length){
      if(e.owner%2===e.seat%2)continue;
      let ordinary=false,gentle=false,bomb=false,finishes=false;
      if(e.faced.kind==='single'||e.faced.kind==='pair'){
        const need=e.faced.count;for(let rank=2;rank<=16;rank++)if(C.power(rank,level)>e.faced.high){const natural=(ranks[rank]||0)-(rank===level?wilds:0),available=natural+(rank<15?wilds:0);
          // A standalone wildcard keeps its level rank, rather than acting as
          // any other single. Pairs can use substitutions as usual.
          const can=need===1?(ranks[rank]||0)>0:available>=need;if(can){ordinary=true;if((ranks[rank]||0)<4&&natural>=need)gentle=true;}
        }
        for(let rank=2;rank<=14;rank++)if((ranks[rank]||0)-(rank===level?wilds:0)+wilds>=4)bomb=true;
        if((ranks[15]||0)===2&&(ranks[16]||0)===2)bomb=true;
        finishes=before.length===need&&ordinary;
        // Straight flushes are uncommon; only look for them when no ordinary
        // reply or rank bomb already explains the pass.
        if(!ordinary&&!bomb)bomb=C.moves(before,level).some(m=>C.strength(m.combo)&&C.beats(m.combo,e.faced));
      }else {
        const replies=C.moves(before,level).filter(m=>C.beats(m.combo,e.faced));ordinary=replies.some(m=>!C.strength(m.combo));bomb=replies.some(m=>C.strength(m.combo));finishes=replies.some(m=>m.cards.length===before.length);
        gentle=replies.some(m=>!C.strength(m.combo)&&!m.cards.some(id=>{const n=ranks[C.card(id).rank];return n>=4&&m.cards.filter(x=>C.card(x).rank===C.card(id).rank).length<n;})&&!m.cards.some(id=>C.wild(id,level)));
      }
      if(!finishes&&(ordinary||bomb)&&before.length<=10)finishes=C.classify(before,level).some(combo=>C.beats(combo,e.faced));
      if(finishes)probability=.12;
      else if(ordinary){
        probability=gentle?(e.counts[e.owner]<=e.faced.count?.32:.55):.82;
      }else if(bomb)probability=e.counts[e.owner]<=e.faced.count?.8:.97;
    }else {
      const urgent=e.counts.some((n,seat)=>seat%2!==e.seat%2&&n>0&&n<=2);
      if(!urgent&&e.combo.kind==='single'&&e.combo.high<=13){const n=ranks[C.card(e.cards[0]).rank];if(n>=4)probability*=.55;else if(n>=2)probability*=.72;}
      if(e.owner<0&&!urgent){const profile={singles:0,pairs:0,triples:0,bombs:0};for(const n of Object.values(ranks)){if(n===1)profile.singles++;else if(n===2)profile.pairs++;else if(n===3)profile.triples++;else if(n>=4)profile.bombs++;}const total=profile.singles+profile.pairs+profile.triples+profile.bombs+1;
        if(e.combo.kind==='single')probability*=.65+.35*(profile.singles+1)/total;
        else if(e.combo.kind==='pair')probability*=.65+.35*(profile.pairs+1)/total;
      }
    }
    log+=Math.log(Math.max(.08,probability))*decay;
  }return log;
}
function inference(view,me,facts){
  const observations=evidence(view,me),hasEvidence=observations.some(es=>es.length),moveCache=new Map();let particles=null,profiles=null;
  let seed=2166136261;for(const id of view.hand.concat(view.played||[]).sort((a,b)=>a-b))seed=Math.imul(seed^id,16777619)>>>0;seed^=view.turn+view.level*17;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  function moves(hand){const key=hand.slice().sort((a,b)=>a-b).join(',');if(!moveCache.has(key))moveCache.set(key,C.moves(hand,view.level));return moveCache.get(key);}
  function weight(hands){let log=0;for(let seat=0;seat<4;seat++)if(seat!==me)log+=likelihood(hands[seat],observations[seat],view.level);return Math.exp(log*.7);}
  function samples(){
    if(particles)return particles;particles=[];const seen=new Set();for(let attempt=0;attempt<32&&particles.length<8;attempt++){
      const hands=facts.sampleHands(random);if(!hands)break;const key=hands.map(h=>h.slice().sort((a,b)=>a-b).join(',')).join('|');if(seen.has(key))continue;seen.add(key);particles.push({hands,weight:weight(hands)});
    }
    const total=particles.reduce((n,p)=>n+p.weight,0)||1;for(const p of particles)p.weight/=total;return particles;
  }
  function profile(seat){
    if(!profiles){profiles=Array.from({length:4},()=>({singles:0,pairs:0,triples:0,bombs:0,runs:0,wilds:0,turns:0,confidence:0}));
      for(const p of samples())for(let seat=0;seat<4;seat++)if(seat!==me){const values=shapeProfile(p.hands[seat],view.level,moves(p.hands[seat]));for(const key of Object.keys(values))profiles[seat][key]+=values[key]*p.weight;}
      const effective=1/(samples().reduce((n,p)=>n+p.weight*p.weight,0)||1);
      for(let seat=0;seat<4;seat++)profiles[seat].confidence=Math.min(.6,observations[seat].length*.18)*Math.min(1,effective/4);
      profiles[me]={...shapeProfile(view.hand,view.level,moves(view.hand)),confidence:1};
    }return profiles[seat];
  }
  const replies=new Map();
  function response(combo,seat,bombs=true){
    const prior=facts.response(combo,seat,bombs);if(!hasEvidence||!observations[seat].length||facts.known[seat].length===view.players[seat].count)return prior;
    const key=C.key(combo)+'|'+seat+'|'+bombs;if(replies.has(key))return replies.get(key);const sampled=samples();if(!sampled.length)return prior;
    const posterior=sampled.reduce((n,p)=>n+(moves(p.hands[seat]).some(m=>C.beats(m.combo,combo)&&(bombs||!C.strength(m.combo)))?p.weight:0),0),confidence=profile(seat).confidence,value=prior*(1-confidence)+posterior*confidence;replies.set(key,value);return value;
  }
  return Object.assign({},facts,{response,control(combo,seats){return seats.reduce((p,seat)=>p*(1-response(combo,seat)),1);},profile,samples,moves,observations,dealWeight:weight});
}
module.exports={inference,shapeProfile,evidence,likelihood};
