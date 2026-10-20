'use strict';
// Replay current policy from public views. Hidden state is saved only for offline
// legal replay, never supplied to choose or used to select a move.
const assert=require('node:assert/strict'),path=require('node:path');
const {probe}=require('./trace_guandan_bombs');
const {initial,key,label,save,root,G,C}=require('./analyze_guandan');
const {planner,variants}=require('../miniprogram/core/guandan-ai-planner');
const {retention}=require('../miniprogram/core/guandan-ai-retention');
const {publicModel}=require('../miniprogram/core/guandan-ai-public');
const {inference}=require('../miniprogram/core/guandan-ai-belief');
function scan(count,offset){
  const ai=probe(),events=[];let decisions=0;
  for(let i=1;i<=count;i++){
    let s=initial(offset+i),step=0;
    while(s.phase==='play'){
      assert(++step<=700);const v=G.view(s,s.players[s.turn].id),cmd=ai.choose(v);decisions++;
      if(!v.last&&cmd.combo&&['single','pair'].includes(cmd.combo.kind)){
        const all=variants(v.hand,v.level,C.moves(v.hand,v.level)),estimate=planner(v.level,v.hand,all),model=inference(v,v.turn,publicModel(v,v.turn)),r=retention(v,v.turn,model,estimate),left=v.hand.filter(id=>!cmd.cards.includes(id)),rows=all.filter(m=>m.combo.kind===cmd.combo.kind&&m.combo.high<cmd.combo.high).map(m=>({m,turns:estimate(v.hand.filter(id=>!m.cards.includes(id)))})),turns=estimate(left);
        if(rows.some(row=>row.turns<=turns)&&left.length&&!C.classify(left,v.level).length){
          const before=r.assess(v.hand),after=r.after(left),layout=estimate.partition(left);
          events.push({seed:offset+i,step,level:v.level,counts:v.players.map(p=>p.count),command:cmd,label:label(cmd,v.level),hand:v.hand,left,turns,before,after,layout,alternatives:rows.filter(row=>row.turns<=turns),detail:ai.diagnosis(),state:s});
        }
      }
      s=G.apply(s,s.players[s.turn].id,{...cmd,epoch:s.epoch});
    }
    if(i%10===0)console.log(i+'/'+count,'suspicious leads',events.length);
  }
  return {seeds:count,offset,decisions,events};
}
if(require.main===module){const tag=process.argv[4]||'current',r=scan(Number(process.argv[2]||60),Number(process.argv[3]||5000));assert(/^[\w.-]+$/.test(tag));save(path.join(root,'dist/validation/guandan-'+tag+'-controls.json'),r);console.log(JSON.stringify({...r,events:r.events.length},null,2));}
module.exports={scan};
