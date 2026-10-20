'use strict';
const fs=require('node:fs'),path=require('node:path'),{policy,initial,run,key,label,save,root,G,C}=require('./analyze_guandan');
const dir=path.join(root,'dist/validation'),full=JSON.parse(fs.readFileSync(path.join(dir,'guandan-167-analysis-full.json'),'utf8')),ai=policy('full'),old=policy('old'),noRetention=policy('no-retention'),events=[];let openingLeads=0,largeFive=0;
for(const g of full.results){let s=initial(g.seed);
  for(const e of g.history){
    if(e.seat%2===g.team&&!e.last&&e.hand.length===27)openingLeads++;
    if(e.seat%2===g.team&&!e.last&&e.hand.length>=20&&e.step<=20&&e.command.cards.length===5&&(e.command.combo.high>=13||C.strength(e.command.combo))){
      largeFive++;const v=G.view(s,s.players[s.turn].id),rows=e.detail&&e.detail.ranked||[],selected=rows.find(r=>key(r)===key(e.command)),alternatives=[],o=old.choose(v),n=noRetention.choose(v);
      for(const [source,cmd] of [['old',o],['no-retention',n]])if(key(cmd)!==key(e.command)&&!alternatives.some(x=>key(x.command)===key(cmd)))alternatives.push({source,command:cmd});
      const lower=selected&&rows.filter(r=>r.combo.kind===e.command.combo.kind&&r.combo.high<e.command.combo.high&&r.turns<=selected.turns&&r.shapeDamage<=selected.shapeDamage).sort((a,b)=>a.combo.high-b.combo.high||a.score-b.score)[0];
      if(lower){const cmd={type:'play',cards:lower.cards,combo:lower.combo};if(!alternatives.some(x=>key(x.command)===key(cmd)))alternatives.push({source:'lower-same-kind-no-extra-groups-or-damage',command:cmd});}
      const branches=alternatives.map(a=>{const branch=run(g.seed,g.team,ai,{state:s,force:a.command});return {source:a.source,command:a.command,label:label(a.command,v.level),won:branch.win,upgrade:branch.upgrade,netGain:(branch.win?1:-1)*branch.upgrade-(g.win?1:-1)*g.upgrade};});
      events.push({seed:g.seed,team:g.team,step:e.step,seat:e.seat,level:g.level,counts:e.counts,hand:e.hand,original:e.label,originalWin:g.win,originalUpgrade:g.upgrade,selected,lower,branches,state:s});
    }
    s=G.apply(s,s.players[s.turn].id,{...e.command,epoch:s.epoch});
  }
}
const report={openingLeads,largeFiveEarlyLeads:largeFive,withEquivalentLowerShape:events.filter(e=>e.lower).length,events};save(path.join(dir,'guandan-167-opening-review.json'),report);
console.log(JSON.stringify({...report,events:events.map(e=>({seed:e.seed,team:e.team,step:e.step,counts:e.counts,original:e.original,originalWin:e.originalWin,originalUpgrade:e.originalUpgrade,selected:e.selected&&{turns:e.selected.turns,score:e.selected.score,tail:e.selected.tail},lower:e.lower&&{label:label({type:'play',...e.lower},e.level),turns:e.lower.turns,score:e.lower.score,tail:e.lower.tail},branches:e.branches}))},null,2));
