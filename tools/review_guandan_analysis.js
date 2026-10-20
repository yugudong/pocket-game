'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {policy,initial,run,key,label,save,root,G,C}=require('./analyze_guandan');
const dir=path.join(root,'dist/validation'),read=name=>JSON.parse(fs.readFileSync(path.join(dir,'guandan-167-analysis-'+name+'.json'),'utf8'));
const full=read('full'),names=process.argv.slice(2);if(!names.length)names.push('no-retention','no-closing','no-flush');
const variants=names.map(name=>read(name)),identity=g=>g.seed+':'+g.team,base=new Map(full.results.map(g=>[identity(g),g]));
const comparisons=variants.map(v=>{const recovered=v.results.filter(g=>g.win&&!base.get(identity(g)).win),sacrificed=v.results.filter(g=>!g.win&&base.get(identity(g)).win);return {variant:v.variant,wins:v.wins,netUpgrade:v.netUpgrade,recoveredLosses:recovered.map(identity),sacrificedWins:sacrificed.map(identity)};});
const five=[];
for(const g of full.results)for(const e of g.history)if(e.seat%2===g.team&&!e.last&&e.command.combo&&e.command.combo.kind==='bomb'&&e.command.cards.length===5){
  const left=e.hand.filter(id=>!e.command.cards.includes(id)),row=e.detail&&e.detail.ranked&&e.detail.ranked.find(r=>key(r)===key(e.command));five.push({seed:g.seed,team:g.team,step:e.step,level:g.level,won:g.win,originalUpgrade:g.upgrade,command:e.label,counts:e.counts,finish:e.finish,hand:e.hand,left,oneGroupLeft:!!C.classify(left,g.level).length,estimatedGroupsLeft:row&&row.turns,proven:!!(e.detail&&e.detail.closing&&e.detail.closing.proven),detail:e.detail});
}
const ai=policy('full'),forks=[];let examined=0;
for(const cmp of comparisons){
  const alternative=policy(cmp.variant);
  for(const id of cmp.recoveredLosses.slice(0,12)){
    const g=base.get(id);let s=initial(g.seed),found=0;
    for(const event of g.history){
      if(event.seat%2===g.team){const v=G.view(s,s.players[s.turn].id),cmd=alternative.choose(v);if(key(cmd)!==key(event.command)){
        const branch=run(g.seed,g.team,ai,{state:s,force:cmd});forks.push({variant:cmp.variant,seed:g.seed,team:g.team,step:event.step,level:g.level,counts:event.counts,hand:event.hand,original:event.label,alternative:label(cmd,g.level),originalWon:g.win,branchWon:branch.win,branchUpgrade:branch.upgrade,branchFinish:branch.finish,detail:event.detail,state:s});found++;if(branch.win||found>=3)break;
      }}
      s=G.apply(s,s.players[s.turn].id,{...event.command,epoch:s.epoch});
    }examined++;if(examined%5===0)console.log('Forked loss games:',examined);
  }
}
const bombForks=[];
for(const b of five.filter(b=>b.left.length&&!b.oneGroupLeft&&!b.proven).slice(0,20)){
  const g=base.get(b.seed+':'+b.team);let s=initial(g.seed);for(const e of g.history){if(e.step===b.step)break;s=G.apply(s,s.players[s.turn].id,{...e.command,epoch:s.epoch});}
  const v=G.view(s,s.players[s.turn].id),legal=C.moves(v.hand,v.level).filter(m=>!C.strength(m.combo)),scored=b.detail&&b.detail.ranked||[],candidates=scored.filter(r=>!C.strength(r.combo)).slice(0,2).map(r=>({type:'play',cards:r.cards,combo:r.combo}));if(!candidates.length)candidates.push(...legal.sort((a,b)=>b.cards.length-a.cards.length||a.combo.high-b.combo.high).slice(0,2).map(m=>({type:'play',...m})));
  for(const cmd of candidates){const branch=run(g.seed,g.team,ai,{state:s,force:cmd});bombForks.push({...b,detail:undefined,state:s,alternative:label(cmd,g.level),originalWon:g.win,branchWon:branch.win,branchUpgrade:branch.upgrade,netGain:(branch.win?1:-1)*branch.upgrade-(g.win?1:-1)*g.upgrade});}
}
const report={baseline:{...full,results:undefined},comparisons,fiveCardBombLeads:{total:five.length,wholeHandFinishes:five.filter(b=>!b.left.length).length,oneGroupLeft:five.filter(b=>b.oneGroupLeft).length,proven:five.filter(b=>b.proven).length,multipleGroupsLeft:five.filter(b=>b.left.length&&!b.oneGroupLeft).length,events:five},counterfactuals:forks,bombCounterfactuals:bombForks};
save(path.join(dir,'guandan-167-loss-review.json'),report);
console.log(JSON.stringify({baseline:report.baseline,comparisons,fiveCardBombLeads:{...report.fiveCardBombLeads,events:undefined},winningSingleMoveReversals:forks.filter(f=>f.branchWon).map(f=>({...f,detail:undefined,state:undefined,hand:undefined})),bombReversals:bombForks.filter(f=>f.netGain>0).map(f=>({...f,detail:undefined,state:undefined,hand:undefined}))},null,2));
