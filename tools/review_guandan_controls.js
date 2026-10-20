'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {probe}=require('./trace_guandan_bombs'),{G,C,key,label,save,root}=require('./analyze_guandan'),native=require('../miniprogram/core/guandan-ai'),old=require('./fixtures/guandan-ai-1.6.9/guandan-ai');
const {publicModel}=require('../miniprogram/core/guandan-ai-public'),{inference}=require('../miniprogram/core/guandan-ai-belief');
const ai=probe(),original=require('../dist/validation/guandan-169-controls.json'),events=[];let matched=0;
for(const e of original.events){
  const v=G.view(e.state,e.state.players[e.state.turn].id),prior=old.choose(v),cmd=ai.choose(v);assert.equal(key(prior),key(e.command));
  if(matched<30){assert.equal(key(cmd),key(native.choose(JSON.parse(JSON.stringify(v)))));matched++;}
  const model=inference(v,v.turn,publicModel(v,v.turn)),seats=v.players.filter(p=>p.seat%2!==v.turn%2&&p.count).map(p=>p.seat),ordinaryControl=seats.reduce((n,s)=>n*(1-model.response(prior.combo,s,false)),1);
  if(ordinaryControl>=.6)events.push({seed:e.seed,step:e.step,kind:prior.combo.kind,ordinaryControl,counts:e.counts,before:label(prior,v.level),after:label(cmd,v.level),changed:key(prior)!==key(cmd),priorCardsRetained:prior.cards.every(id=>!cmd.cards.includes(id)),ending:!!ai.diagnosis().ending});
}
const report={baselineVersion:'1.6.9',newVersion:'1.6.10',baselineSelfGames:original.seeds,baselineDecisions:original.decisions,screenedFreeLeads:original.events.length,description:'Screening is deliberately broad: a stronger single/pair, some weaker same-kind move, no larger independently estimated remainder. Not every screened lead is an error.',probeMatchesNative:matched,ordinaryControlLeads:events.length,changed:events.filter(e=>e.changed).length,priorControlCardsRetained:events.filter(e=>e.changed&&e.priorCardsRetained).length,events};
save(path.join(root,'dist/validation/guandan-1.6.10-control-review.json'),report);console.log(JSON.stringify({...report,events:undefined},null,2));
