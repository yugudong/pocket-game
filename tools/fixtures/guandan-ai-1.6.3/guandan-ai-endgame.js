'use strict';
const C=require('../../../miniprogram/core/guandan-cards');
// Small ending only: average team minimax over possible deals consistent with
// public information. The host's actual hidden hands are never passed in.
function ending(v,me,ranked,model,allowPass=true){
  if(v.hand.length>8||v.players.reduce((n,p)=>n+p.count,0)>16)return null;
  const roots=ranked.slice(0,6).map(r=>({command:{type:'play',...r.m},prior:r.score,values:[]}));
  if(v.last&&allowPass)roots.push({command:{type:'pass'},prior:ranked[0].score+6,values:[]});if(roots.length<2)return null;
  let seed=2166136261;for(const id of v.hand.concat(v.played||[]).sort((a,b)=>a-b))seed=Math.imul(seed^id,16777619)>>>0;seed^=v.turn+v.level*17;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},team=me%2;
  function value(s){
    const finish=s.finish;if(finish.length>=3||finish.length===2&&finish[0]%2===finish[1]%2){const winner=finish[0]%2,partner=(finish[0]+2)%4,place=finish.indexOf(partner);return (winner===team?1:-1)*(place===1?120:place===2?105:90);}
    let score=finish.length?(finish[0]%2===team?60:-60):0;
    for(let seat=0;seat<4;seat++)score+=(seat%2===team?-1:1)*s.hands[seat].length*1.5;return score+(s.turn%2===team?2:-2);
  }
  function advance(s,cmd){
    const hands=s.hands.slice(),finish=s.finish.slice(),actor=s.turn;let last=s.last,passed=s.passed.slice(),turn=-1;
    function next(from){for(let step=1;step<=4;step++)if(hands[(from+step)%4].length)return (from+step)%4;return -1;}
    if(cmd.type==='play'){
      const used=new Set(cmd.cards);hands[actor]=hands[actor].filter(id=>!used.has(id));last={seat:actor,cards:cmd.cards,combo:cmd.combo};passed=[];if(!hands[actor].length)finish.push(actor);turn=next(actor);
    }else {
      passed.push(actor);const challengers=[0,1,2,3].filter(seat=>hands[seat].length&&seat!==last.seat);
      if(challengers.every(seat=>passed.includes(seat))){const owner=last.seat,partner=(owner+2)%4;turn=hands[owner].length?owner:hands[partner].length?partner:next(owner);last=null;passed=[];}else turn=next(actor);
    }
    return {hands,finish,last,passed,turn};
  }
  for(let sample=0;sample<6;sample++){
    const hands=model.sampleHands(random);if(!hands)return null;for(let seat=0;seat<4;seat++)hands[seat]=C.sorted(hands[seat],v.level);const moveCache=new Map();
    function moves(s){const h=s.hands[s.turn],key=h.slice().sort((a,b)=>a-b).join(',');if(!moveCache.has(key))moveCache.set(key,C.moves(h,v.level));const legal=moveCache.get(key).filter(m=>C.beats(m.combo,s.last&&s.last.combo));legal.sort((a,b)=>b.cards.length-a.cards.length||C.strength(a.combo)-C.strength(b.combo)||a.combo.high-b.combo.high);const commands=legal.map(m=>({type:'play',...m}));if(s.last)commands.push({type:'pass'});return commands;}
    for(const root of roots){
      let fuel=44;
      function search(s,depth,alpha,beta){
        const terminal=s.finish.length>=3||s.finish.length===2&&s.finish[0]%2===s.finish[1]%2;if(terminal||depth===0||fuel--<=0)return value(s);
        const maximizing=s.turn%2===team;let best=maximizing?-Infinity:Infinity;
        for(const cmd of moves(s)){const score=search(advance(s,cmd),depth-1,alpha,beta);best=maximizing?Math.max(best,score):Math.min(best,score);if(maximizing)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);if(beta<=alpha||fuel<=0)break;}return best;
      }
      const state={hands,finish:(v.finish||[]).slice(),last:v.last,passed:(v.passed||[]).slice(),turn:me};root.values.push(search(advance(state,root.command),8,-Infinity,Infinity));
    }
  }
  roots.forEach(root=>{const mean=root.values.reduce((a,b)=>a+b,0)/root.values.length;root.score=mean*.8+Math.min(...root.values)*.2-root.prior*.12;});roots.sort((a,b)=>b.score-a.score);return roots[0].command;
}
module.exports={ending};
