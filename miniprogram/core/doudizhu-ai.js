'use strict';
const C=require('./doudizhu-cards');
const {publicModel}=require('./doudizhu-ai-public'),{inference}=require('./doudizhu-ai-belief'),{teamCircle}=require('./doudizhu-ai-circle'),{ending}=require('./doudizhu-ai-endgame');
const remove=(hand,cards)=>{const ids=new Set(cards);return hand.filter(id=>!ids.has(id));};
function signature(hand){return Object.entries(C.groups(hand)).map(([r,g])=>r+':'+g.length).join(',');}
// Preserve the proven decomposition order; cache generated physical moves so
// recursive plans and greedy fallbacks do not regenerate the same hand.
function planner(initial,initialMoves){
  const catalog=new Map();
  if(initial)catalog.set(C.sorted(initial).join(','),initialMoves||C.moves(initial));
  function moves(hand){const key=C.sorted(hand).join(',');if(!catalog.has(key))catalog.set(key,C.moves(hand));return catalog.get(key).slice();}
  const memo=new Map();let budget=260;
  function estimate(hand,depth=0){
    if(!hand.length)return 0;const key=signature(hand);if(memo.has(key))return memo.get(key);
    const all=moves(hand);if(all.some(m=>m.cards.length===hand.length)){memo.set(key,1);return 1;}
    const ranked=all.sort((a,b)=>b.cards.length-a.cards.length||C.strength(a.combo)-C.strength(b.combo)||a.combo.high-b.combo.high);
    // Once the search budget is spent, a deterministic decomposition still
    // accounts for pairs, runs and wings rather than charging each single.
    let left=hand,greedy=0;while(left.length){const options=left===hand?ranked:moves(left);options.sort((a,b)=>b.cards.length-a.cards.length||a.combo.high-b.combo.high);left=remove(left,options[0].cards);greedy++;}
    let best=greedy;if(depth<5&&budget-->0){const seen=new Set();for(const m of ranked){const rest=remove(hand,m.cards),k=signature(rest);if(seen.has(k))continue;seen.add(k);if(seen.size>5)break;best=Math.min(best,1+estimate(rest,depth+1));if(best===2)break;}}
    memo.set(key,best);return best;
  }return estimate;
}
function bid(hand,current){
  const g=C.groups(hand),bombs=Object.values(g).filter(x=>x.length===4).length,rocket=!!g[15]&&!!g[16];
  const value=bombs*2.1+(rocket?4:0)+(g[16]?1.6:0)+(g[15]?1:0)+(g[2]?g[2].length*.9:0)+(g[14]?g[14].length*.35:0);
  const wanted=value>=6.5?3:value>=4.2?2:value>=2.2?1:0;return wanted>current?wanted:0;
}
function choose(v){
  const me=v.players.findIndex(p=>p.id===v.me);if(me<0||me!==v.turn)throw new Error('人机尚未轮到');
  if(v.phase==='bid')return {type:'bid',value:bid(v.hand,v.bid)};if(v.phase!=='play')throw new Error('当前不是出牌阶段');
  const hand=C.sorted(v.hand),all=C.moves(hand),legal=all.filter(m=>C.beats(m.combo,v.last&&v.last.combo));if(!legal.length)return {type:'pass'};
  const winning=legal.filter(m=>m.cards.length===hand.length).sort((a,b)=>C.strength(a.combo)-C.strength(b.combo)||a.combo.high-b.combo.high);if(winning.length)return Object.assign({type:'play'},winning[0]);
  const farmer=me!==v.landlord,partner=farmer?v.players.find(p=>p.seat!==me&&p.seat!==v.landlord):null,teammate=!!v.last&&farmer&&v.last.seat!==v.landlord;
  const enemies=v.players.filter(p=>farmer?p.seat===v.landlord:p.seat!==me),danger=Math.min(...enemies.map(p=>p.count)),urgent=danger<=2;
  const estimate=planner(hand,all),base=estimate(hand),g=C.groups(hand),enemySeats=enemies.map(p=>p.seat),model=inference(v,me,publicModel(v,me)),circle=teamCircle(v,me,model,base),passed=v.passed||[],unseen=Array.from({length:54},(_,id)=>id).filter(id=>!hand.includes(id)&&!(v.played||[]).includes(id));
  const block=teammate&&!passed.includes(v.landlord)&&v.players[v.landlord].count===v.last.combo.count&&model.response(v.last.combo,v.landlord)>0;
  if(teammate&&!block&&(partner.count<=5&&!circle.runnerMe||v.last.combo.high>=14||C.strength(v.last.combo)))return {type:'pass'};
  let candidates=legal;
  if(teammate&&!block){candidates=candidates.filter(m=>!C.strength(m.combo)&&m.combo.high<14&&(m.cards.length>=4||circle.runnerMe));if(!candidates.length)return {type:'pass'};}
  let scored=candidates.map(m=>{
    const rest=remove(hand,m.cards),turns=estimate(rest),used=C.groups(m.cards);let damage=0;
    for(const [r,ids] of Object.entries(used)){if(g[r].length===4&&ids.length<4)damage+=urgent?2:11;else if(g[r].length>=2&&ids.length<g[r].length)damage+=(g[r].length-ids.length)*1.5;}
    if(g[15]&&g[16]&&m.cards.includes(52)!==m.cards.includes(53))damage+=urgent?2:10;
    const control=model.control(m.combo,enemySeats),exit=turns===1&&C.classify(rest).length>0;
    // Keep the established own-hand and reported-card defenses as the anchor.
    // Sparse hypotheses may break ties; they cannot replace those safeguards.
    let score=turns*14+damage+C.strength(m.combo)*9+m.combo.high*.15-m.cards.length*.45;
    if(!v.last){if(urgent&&m.combo.kind==='single'&&m.combo.high<16)score+=22;if(partner&&partner.count===1&&m.combo.kind==='single'&&m.combo.high<=10&&!urgent)score-=12;if(m.combo.kind==='single'&&m.combo.high>=15&&hand.length>5&&!urgent)score+=7;}
    else if(urgent){if(['single','pair'].includes(m.combo.kind))score+=unseen.filter(id=>C.power(C.card(id).rank)>m.combo.high).length*2;score-=C.strength(m.combo)*7;}
    else if(C.strength(m.combo)&&turns>=base-1)score+=18;
    return {m,score,turns,damage,control,exit};
  }).sort((a,b)=>a.score-b.score||C.strength(a.m.combo)-C.strength(b.m.combo)||a.m.combo.high-b.m.combo.high||a.m.cards[0]-b.m.cards[0]);
  // Bound by distinct shapes, retaining low leads for partner delivery. Every
  // retained candidate receives the same circle evaluation before comparison.
  const shapes=new Set();for(const row of scored){shapes.add(C.key(row.m.combo));if(shapes.size===12)break;}
  const low=new Map();for(const row of scored)if(!C.strength(row.m.combo)){const old=low.get(row.m.combo.kind);if(!old||row.m.combo.high<old.m.combo.high)low.set(row.m.combo.kind,row);}for(const row of low.values())if(shapes.size<18)shapes.add(C.key(row.m.combo));
  scored=scored.filter(row=>shapes.has(C.key(row.m.combo)));for(const row of scored){row.circle=circle.evaluate({type:'play',...row.m});row.score+=Math.max(-6,Math.min(6,circle.adjustment(row.circle)));}scored.sort((a,b)=>a.score-b.score||a.m.cards[0]-b.m.cards[0]);
  const best=scored[0],passCircle=v.last?circle.evaluate({type:'pass'}):null,proven=scored.find(row=>row.exit&&model.unbeatable(row.m.combo,enemySeats));if(proven)return {type:'play',...proven.m};
  if(block&&model.unbeatable(best.m.combo,enemySeats))return {type:'play',...best.m};
  const end=ending(v,me,scored,model,!block);if(end)return end;
  if(teammate&&block&&best.control<=model.control(v.last.combo,enemySeats)+.02&&!best.exit)return {type:'pass'};
  const safeHandoff=circle.runnerMe&&passCircle&&best.turns<base&&best.circle.teamControl>=passCircle.teamControl-.08&&best.circle.enemyWin<=passCircle.enemyWin+.02;
  if(teammate&&!block&&best.turns>=base-1&&!best.exit&&!safeHandoff)return {type:'pass'};
  const rescue=passCircle&&(passCircle.enemyWin-best.circle.enemyWin>.25||best.circle.teamWin-passCircle.teamWin>.35);
  if(v.last&&!teammate&&!urgent&&!best.exit&&!rescue&&C.strength(best.m.combo)&&hand.length>6&&best.turns>=base-1)return {type:'pass'};
  return Object.assign({type:'play'},best.m);
}
module.exports={choose,planner,bid};
