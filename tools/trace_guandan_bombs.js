'use strict';
// Current-runtime diagnosis only; compile instrumentation in memory.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {initial,key,label,save,root,G,C}=require('./analyze_guandan'),core=path.join(root,'miniprogram/core'),native=require(path.join(core,'guandan-ai')),old=require('./fixtures/guandan-ai-1.6.6/guandan-ai');
function probe(){
  let source=fs.readFileSync(path.join(core,'guandan-ai.js'),'utf8');
  function inject(from,to){assert(source.includes(from),from);source=source.replace(from,to);}
  inject('function choose(v){','function choose(v){diagnosis={};');
  inject('const closing=closingPlan(v,me,legal,model);','const closing=closingPlan(v,me,legal,model);diagnosis.closing={proven:closing.proven,bias:Array.from(closing.bias)};');
  inject('return {m,score,turns,shapeDamage,control,exit,left};','return {m,score,baseScore:score,turns,shapeDamage,control,exit,left};');
  inject('const best=scored[0],passCircle=',"diagnosis.context={base,urgent,mustBlock,teammate};diagnosis.ranked=scored.slice(0,16).map(r=>({cards:r.m.cards,combo:r.m.combo,score:r.score,baseScore:r.baseScore,turns:r.turns,shapeDamage:r.shapeDamage,control:r.control,exit:r.exit,tail:r.tail,circle:r.circle}));const best=scored[0],passCircle=");
  inject('if(endingMove)return endingMove;','if(endingMove){diagnosis.ending=endingMove;return endingMove;}');
  const file=path.join(core,'guandan-bomb-probe.js'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(core);m._compile("'use strict';let diagnosis={};\n"+source+'\nmodule.exports.diagnosis=()=>diagnosis;\n',file);return m.exports;
}
function scan(mode,count,offset,allRankBombs=false){
  const ai=probe(),events=[];let decisions=0,games=0,matched=0;
  function inspect(s,seed,team,step){const v=G.view(s,s.players[s.turn].id),cmd=ai.choose(v);if(matched<30){assert.equal(key(cmd),key(native.choose(JSON.parse(JSON.stringify(v)))));matched++;}decisions++;
    if(!s.last&&cmd.combo&&cmd.combo.kind==='bomb'&&(allRankBombs||cmd.cards.length===5)){const left=v.hand.filter(id=>!cmd.cards.includes(id));events.push({seed,team,step,seat:s.turn,level:s.level,counts:s.hands.map(h=>h.length),finish:s.finish.slice(),command:cmd,label:label(cmd,v.level),hand:v.hand,left,wholeHand:!left.length,oneGroupLeft:!!C.classify(left,s.level).length,detail:ai.diagnosis(),state:s});}
    return cmd;
  }
  for(let i=1;i<=count;i++){
    const seed=offset+i;
    if(mode==='opening'){const s=initial(seed);inspect(s,seed,s.turn%2,1);games++;}
    else for(const team of mode==='self'?[-1]:[0,1]){let s=initial(seed),step=0,start=events.length;while(s.phase==='play'){assert(++step<=700);const smart=team<0||s.turn%2===team,cmd=smart?inspect(s,seed,team,step):old.choose(G.view(s,s.players[s.turn].id));s=G.apply(s,s.players[s.turn].id,{...cmd,epoch:s.epoch});}for(const e of events.slice(start))e.result=s.result;games++;}
    if(i%(mode==='opening'?100:10)===0)console.log(mode,i+'/'+count,'recorded bomb leads',events.length);
  }
  return {mode,offset,seeds:count,games,decisions,allRankBombs,probeMatchesNative:matched,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(core,'guandan-ai.js'))).digest('hex'),totalBombLeads:events.length,fourBombLeads:events.filter(e=>e.command.cards.length===4).length,fiveBombLeads:events.filter(e=>e.command.cards.length===5).length,wholeHand:events.filter(e=>e.wholeHand).length,twoGroupExit:events.filter(e=>e.oneGroupLeft).length,multiGroup:events.filter(e=>e.left.length&&!e.oneGroupLeft).length,beforeFirstFinish:events.filter(e=>!e.finish.length).length,events};
}
if(require.main===module){const mode=process.argv[2]||'self',count=Number(process.argv[3]||50),offset=Number(process.argv[4]||2600),tag=process.argv[5]||'current';assert(['opening','self','mixed'].includes(mode));assert(/^[\w.-]+$/.test(tag));const report=scan(mode,count,offset,process.argv[6]==='all');save(path.join(root,'dist/validation/guandan-'+tag+'-five-bombs-'+mode+'.json'),report);console.log(JSON.stringify({...report,events:undefined},null,2));}
module.exports={probe,scan};
