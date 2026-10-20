'use strict';
// Offline diagnosis only. Variants are compiled in memory; runtime sources and
// uploaded packages are never patched. Every policy still receives G.view.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),core=path.join(root,'miniprogram/core'),analysisCore=path.join(root,'tools/fixtures/guandan-ai-1.6.7'),G=require(path.join(core,'guandan')),C=require(path.join(core,'guandan-cards'));
const old=require('./fixtures/guandan-ai-1.6.6/guandan-ai');
function replaceOnce(source,from,to){assert(source.includes(from),'Missing instrumentation anchor: '+from);return source.replace(from,to);}
function policy(name){
  if(name==='old')return old;
  // Historical 1.6.7 ablations remain reproducible after runtime upgrades.
  let source=fs.readFileSync(path.join(analysisCore,'guandan-ai.js'),'utf8');
  if(['no-retention','old-equivalent'].includes(name))source=replaceOnce(source,"const {retention}=require('./guandan-ai-retention');","const retention=()=>({after:()=>({weak:0,spent:0,penalty:0})});");
  if(['no-closing','old-equivalent'].includes(name))source=replaceOnce(source,"const {closingPlan,actionKey}=require('./guandan-ai-exit');","const {actionKey}=require('./guandan-ai-exit');const closingPlan=()=>({bias:new Map(),proven:null});");
  if(['no-flush','old-equivalent'].includes(name)){
    const from=source.indexOf('  const playable='),to=source.indexOf('  const teammate=',from);assert(from>=0&&to>from);
    source=source.slice(0,from)+"  const legal=all.filter(m=>C.beats(m.combo,v.last&&v.last.combo)),finish=legal.filter(m=>m.cards.length===hand.length).sort((a,b)=>C.strength(a.combo)-C.strength(b.combo))[0];if(finish)return Object.assign({type:'play'},finish);if(!legal.length)return {type:'pass'};\n"+source.slice(to);
  }
  if(name==='no-reserve-pass')source=replaceOnce(source,"if(v.last&&!teammate&&!urgent&&!mustBlock&&!best.exit&&!rescue&&v.players[v.last.seat].count>5&&best.tail.weak>1.05&&best.tail.spent>.25&&best.retentionPenalty>6)return {type:'pass'};",'');
  if(name==='no-ending-penalty')source=replaceOnce(source,"const {ending}=require('./guandan-ai-endgame');","const {ending:rawEnding}=require('./guandan-ai-endgame');const ending=(v,me,rows,...rest)=>rawEnding(v,me,rows.map(r=>({...r,retentionPenalty:0})),...rest);");
  if(name==='no-retention-score')source=replaceOnce(source,'row.score+=row.retentionPenalty;','');
  source='let diagnosis={};\n'+source;
  source=replaceOnce(source,'function choose(v){','function choose(v){diagnosis={};');
  source=replaceOnce(source,'const closing=closingPlan(v,me,legal,model);','const closing=closingPlan(v,me,legal,model);diagnosis.closing={proven:closing.proven,bias:Array.from(closing.bias)};');
  source=replaceOnce(source,'const best=scored[0],passCircle=',"diagnosis.ranked=scored.map(r=>({cards:r.m.cards,combo:r.m.combo,score:r.score,turns:r.turns,shapeDamage:r.shapeDamage,control:r.control,exit:r.exit,tail:r.tail,circle:r.circle}));diagnosis.context={base,urgent,mustBlock,teammate};const best=scored[0],passCircle=");
  source=replaceOnce(source,"if(endingMove)return endingMove;","if(endingMove){diagnosis.ending=endingMove;return endingMove;}");
  source+='\nmodule.exports.diagnosis=()=>diagnosis;\n';
  const modulePath=path.join(analysisCore,'guandan-analysis-'+name+'.js'),m=new Module(modulePath,module);m.filename=modulePath;m.paths=Module._nodeModulePaths(analysisCore);m._compile(source,modulePath);return m.exports;
}
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function initial(seed){let s=G.create('p0','玩家0','复盘');for(let i=1;i<4;i++)G.addPlayer(s,'p'+i,'玩家'+i);s.players.forEach(p=>p.ready=true);s=G.apply(s,'p0',{type:'start',epoch:s.epoch},rng(seed*1009));s.level=2+(seed-1)%13;s.levels=[s.level,s.level];s.dealLevel=s.level;return s;}
function key(cmd){return cmd.type==='pass'?'pass':C.key(cmd.combo)+'|'+cmd.cards.slice().sort((a,b)=>a-b).join(',');}
function label(cmd,level){return cmd.type==='pass'?'不出':C.describe(cmd.combo,level)+' ['+cmd.cards.map(id=>{const c=C.display(id,level);return c.symbol+c.label+(c.wild?'配':'');}).join(' ')+']';}
function run(seed,team,ai,options={}){
  let s=options.state||initial(seed),steps=0;const history=[],counters={};
  while(s.phase==='play'){
    assert(++steps<=700);const seat=s.turn,v=G.view(s,s.players[seat].id),smart=seat%2===team,cmd=options.force&&steps===1?options.force:(smart?ai:old).choose(v);
    if(options.trace){const detail=smart&&ai.diagnosis?ai.diagnosis():null;history.push({step:steps,seat,counts:s.hands.map(h=>h.length),finish:s.finish.slice(),last:s.last,command:cmd,label:label(cmd,s.level),hand:smart?v.hand:undefined,detail});if(detail&&detail.closing&&detail.closing.proven)counters.proven=(counters.proven||0)+1;}
    s=G.apply(s,s.players[seat].id,{...cmd,epoch:s.epoch});
  }
  return {seed,team,level:s.dealLevel,win:s.result.winner===team,upgrade:s.result.upgrade,finish:s.finish,remaining:s.hands.map(h=>h.length),steps,history:options.trace?history:undefined,counters};
}
function summary(games){const wins=games.filter(g=>g.win).length,grades={win:{1:0,2:0,3:0},loss:{1:0,2:0,3:0}},pairs={bothWin:0,split:0,bothLose:0};for(const g of games)grades[g.win?'win':'loss'][g.upgrade]++;for(let i=0;i<games.length;i+=2){const n=Number(games[i].win)+Number(games[i+1].win);pairs[n===2?'bothWin':n===1?'split':'bothLose']++;}return {games:games.length,wins,winRate:wins/games.length*100,netUpgrade:games.reduce((n,g)=>n+(g.win?1:-1)*g.upgrade,0),grades,pairs};}
function save(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
if(require.main===module){
  const name=process.argv[2]||'full',count=Number(process.argv[3]||100),offset=Number(process.argv[4]||1800),out=process.argv[5]||path.join(root,'dist/validation/guandan-167-analysis-'+name+'.json'),ai=policy(name),games=[];
  for(let i=1;i<=count;i++){for(let team=0;team<2;team++)games.push(run(offset+i,team,ai,{trace:name==='full'}));if(i%10===0)console.log(name,i+'/'+count);}
  const report={variant:name,offset,...summary(games),results:games};save(out,report);console.log(JSON.stringify({...report,results:undefined},null,2));
}
module.exports={policy,initial,run,key,label,summary,save,root,G,C};
