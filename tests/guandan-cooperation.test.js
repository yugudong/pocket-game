'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../miniprogram/core/guandan-cards'),G=require('../miniprogram/core/guandan'),AI=require('../miniprogram/core/guandan-ai'),Observation=require('../miniprogram/core/guandan-observation');
const {publicModel}=require('../miniprogram/core/guandan-ai-public'),{inference,likelihood,shapeProfile}=require('../miniprogram/core/guandan-ai-belief'),{rollCircle}=require('../miniprogram/core/guandan-ai-circle');
const {fragments}=require('../miniprogram/core/wire');
const id=(rank,suit=0,deck=0)=>deck*54+(rank>=15?rank+37:(rank-2)*4+suit),group=(rank,n)=>Array.from({length:n},(_,i)=>id(rank,i%4,Math.floor(i/4)));
function state(hands){let s=G.create('p0','我','配合桌');for(let i=1;i<4;i++)G.addPlayer(s,'p'+i,'玩家'+i);return Object.assign(s,{hands,phase:'play',level:2,dealLevel:2,levels:[2,2],playingTeam:0,round:1,turn:0,finish:[],last:null,passed:[],tablePlays:[null,null,null,null],publicHistory:[],moves:0,played:Array.from({length:108},(_,id)=>id).filter(id=>!hands.flat().includes(id))});}
function act(s,seat,cmd){return G.apply(s,'p'+seat,{...cmd,epoch:s.epoch});}
function shape(cards,level=2){return C.classify(cards,level)[0];}
test('history records only visible choices, faced shape and pre-action public counts; copies survive old saves',()=>{
  let s=state([[id(3),id(4)],[id(5),id(6)],[id(7),id(8)],[id(9),id(10)]]);s=act(s,0,{type:'play',cards:[id(3)]});s=act(s,1,{type:'pass'});const events=Observation.events(G.view(s,'p2'));
  assert.equal(events.length,2);assert.deepEqual(events[0].cards,[id(3)]);assert.deepEqual(events[0].counts,[2,2,2,2]);assert.equal(events[1].owner,0);assert.equal(events[1].faced.kind,'single');assert.deepEqual(events[1].cards,[]);
  const view=G.view(s,'p2');view.publicHistory[0][1].push(107);assert.deepEqual(s.publicHistory[0][1],[id(3)]);delete s.publicHistory;assert.deepEqual(G.view(s,'p2').publicHistory,[]);
});
test('full bounded public history fits the existing UDP envelope and resets for a new deal or lobby',()=>{
  let s=state([group(3,4),group(4,4),group(5,4),group(6,4)]);for(let i=0;i<108;i++){const combo=shape([i]);s.publicHistory.push([i%4,[i],[combo.kind,combo.high,1],(i+3)%4,['single',18,1],[27,27,27,27]]);for(let n=0;n<3;n++)s.publicHistory.push([(i+n+1)%4,[],null,i%4,['single',18,1],[27,27,27,27]]);}
  assert.equal(s.publicHistory.length,432);const v=G.view(s,'p0');assert(fragments(v,'a'.repeat(64),'b'.repeat(64),1).length<=96);assert.equal(v.hands,undefined);
  s.phase='roundOver';s.finish=[0,1,2,3];assert.deepEqual(act(s,0,{type:'next'}).publicHistory,[]);assert.deepEqual(G.view(act(s,0,{type:'again'}),'p0').publicHistory,[]);
});
test('passing against an opponent weakens a gentle reply hypothesis without ruling it out; teammate passes are neutral',()=>{
  const event={seat:1,cards:[],combo:null,owner:0,faced:shape([id(8)]),counts:[8,2,8,8],later:[],age:0},strong=[id(14),id(5)],weak=[id(3),id(4)];
  const can=likelihood(strong,[event],2),cannot=likelihood(weak,[event],2);assert(can<cannot);assert(Number.isFinite(can));assert.equal(likelihood(strong,[{...event,owner:3}],2),0);
  // A rank bomb can be saved: it is weaker negative evidence than declining an
  // ordinary reply that would leave its natural groups intact.
  const bomb=[...group(3,4),id(4),id(5)],normal=[id(14),id(6),id(7),id(9),id(10),id(11)],six={...event,counts:[8,6,8,8]};assert(likelihood(bomb,[six],2)>likelihood(normal,[six],2));
});
test('later public plays reconstruct past holdings instead of creating a permanent void',()=>{
  const event={seat:1,cards:[],combo:null,owner:0,faced:shape([id(8)]),counts:[8,3,8,8],later:[id(14)],age:4};
  const a=likelihood([id(3),id(4)],[event],2),b=likelihood([id(5),id(6)],[event],2);assert(Number.isFinite(a));assert(Math.abs(a-b)<1e-12);
});
test('low single leads favor genuinely loose-card hypotheses rather than repeatedly splitting pairs',()=>{
  const event={seat:1,cards:[id(3)],combo:shape([id(3)]),owner:-1,faced:null,counts:[20,5,20,20],later:[],age:0};
  const loose=[id(4),id(7),id(10),id(13)],paired=[id(3,1),id(7),id(7,1),id(10)];assert(likelihood(loose,[event],2)>likelihood(paired,[event],2));
  const run=shapeProfile([id(3),id(4),id(5),id(6),id(7)],2);assert.equal(run.singles,0);assert.equal(run.runs,1);assert.equal(run.turns,1);
});
test('circle assessment distinguishes a partner reply from a reply that survives the tail player',()=>{
  const own=[...group(3,2),id(4)],front=[...group(7,2),id(5)],partner=[...group(9,2),id(6)],tail=[...group(10,2),id(11)],s=state([own,front,partner,tail]),v=G.view(s,'p0'),profiles=s.hands.map(h=>shapeProfile(h,2)),cmd={type:'play',cards:group(3,2),combo:shape(group(3,2))},moves=h=>C.moves(h,2);
  const cut=rollCircle(v,0,cmd,s.hands,profiles,moves);assert.equal(cut.partnerCanTake,1);assert.equal(cut.partnerReceives,1);assert.equal(cut.partnerSafe,0);assert.equal(cut.teamControl,0);
  const safe=[own,front,partner,[id(10),id(14),id(16)]],kept=rollCircle(v,0,cmd,safe,safe.map(h=>shapeProfile(h,2)),moves);assert.equal(kept.partnerSafe,1);assert.equal(kept.teamControl,1);
});
test('the nearer finisher can gently take a partner pair to run, rather than mechanically passing',()=>{
  const s=state([[...group(6,2),...group(8,2)],[id(14)],[...group(3,8),...group(4,8),id(9),id(10)],[id(16)]]);s.passed=[3];
  s.last={seat:2,cards:group(5,2),combo:shape(group(5,2))};const cmd=AI.choose(G.view(s,'p0'));assert.equal(cmd.type,'play');assert.equal(cmd.combo.kind,'pair');assert.doesNotThrow(()=>act(s,0,cmd));
  assert.equal(require('../tools/fixtures/guandan-ai-1.6.4/guandan-ai').choose(G.view(s,'p0')).type,'pass');
});
test('beliefs use public history, preserve all cards and are identical after cold serialization or hidden-hand substitution',()=>{
  let s=state([[id(3),id(4),id(12)],[id(5),id(6),id(14)],[id(7),id(8),id(13)],[id(9),id(10),id(16)]]);s=act(s,0,{type:'play',cards:[id(3)]});s=act(s,1,{type:'pass'});s=act(s,2,{type:'pass'});s=act(s,3,{type:'pass'});const v=G.view(s,'p0'),model=inference(v,0,publicModel(v,0)),cold=JSON.parse(JSON.stringify(v)),restored=inference(cold,0,publicModel(cold,0));
  assert.deepEqual(model.profile(1),restored.profile(1));assert(model.profile(1).confidence>0);for(const p of model.samples()){assert.equal(new Set(p.hands.flat()).size,s.hands.flat().length);assert(p.hands.flat().every(id=>!v.played.includes(id)));}
  assert.deepEqual(AI.choose(v),AI.choose({...cold,hands:[[107],[106],[105],[104]],secretDeal:[1,2,3]}));
});
test('an opponent pair pass changes current reply estimates without turning a soft inference into a void',()=>{
  const s=state([[id(3),id(4)],group(8,2),[id(9),id(10)],[id(11),id(12)]]),row=[1,[],null,0,['pair',7,2],[2,2,2,2]];s.publicHistory=[row];const v=G.view(s,'p0'),facts=publicModel(v,0),belief=inference(v,0,facts),combo={kind:'pair',high:7,count:2};assert(belief.response(combo,1)>0);assert(belief.response(combo,1)<facts.response(combo,1));
  s.publicHistory=[[1,[],null,3,['pair',7,2],[2,2,2,2]]];const ally=G.view(s,'p0'),neutral=inference(ally,0,publicModel(ally,0));assert.equal(neutral.response(combo,1),facts.response(combo,1));
});
