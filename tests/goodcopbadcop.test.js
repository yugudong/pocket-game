'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../miniprogram/core/goodcopbadcop'),E=require('../miniprogram/core/goodcopbadcop-equipment');
function act(s,id,c){return G.apply(s,id,{...c,epoch:s.epoch},()=>.31);}
function setup(n=4){let s=G.create('a','甲','无间测试');for(let i=1;i<n;i++)G.addPlayer(s,String.fromCharCode(97+i),'玩家'+i);for(const p of s.players)s=act(s,p.id,{type:'ready',value:true});s=act(s,'a',{type:'start'});for(const p of s.players)s=act(s,p.id,{type:'seen'});return s;}
function fixture(){const s=setup();s.turn=0;for(const [i,p] of s.players.entries()){s.cards[p.id]=[i===0?'agent':i===1?'kingpin':i===2?'honest':'crooked','honest',i===3?'crooked':'honest'].map((role,j)=>({id:i*3+j,role,open:false}));s.hands[p.id]=[];s.active[p.id]=[];}s.deck=E.deck.slice();return s;}
function equipped(key){const s=fixture();s.hands.a=[key];return s;}
function pass(s){for(const p of s.players.filter(p=>!s.dead[p.id]))s=act(s,p.id,{type:'pass'});return s;}
function action(s,id,c){return pass(act(s,id,{type:'declare',...c}));}
function use(s,key,c={},id='a'){return act(s,id,{type:'equipment',key,...c});}
test('4–8 players: balanced ordinary cards, two leaders separately dealt, 19 equipment, private projections',()=>{
  for(let n=4;n<=8;n++){const s=setup(n),cards=Object.values(s.cards).flat();assert.equal(cards.length,n*3);assert.equal(cards.filter(c=>c.role==='agent').length,1);assert.equal(cards.filter(c=>c.role==='kingpin').length,1);assert(!s.players.some(p=>G.side(s,p.id)==='solo'));assert.equal(s.deck.length+n,19);const v=G.view(s,'a');assert.equal(v.own.length,3);assert.equal(v.hand.length,1);assert.equal(v.cards,undefined);assert.equal(v.deck,undefined);assert(v.players.every(p=>p.cards.every(c=>!c.role)));assert.equal(v.players.filter(p=>p.side).length,0);assert.equal(Object.keys(E.equipment).length,18);}
  let s=G.create('a','A','Room');assert.throws(()=>act(s,'a',{type:'start'}),/4～8/);s=setup(8);assert.throws(()=>G.addPlayer(s,'z','Z'),/开局/);
});
test('epochs, ownership, identity confirmation and immutable failed commands',()=>{
  const s=fixture(),copy=JSON.stringify(s);assert.throws(()=>G.apply(s,'a',{type:'declare',action:'equip',epoch:-1}),/更新/);assert.throws(()=>act(s,'b',{type:'declare',action:'equip',reveal:0}),/回合/);assert.throws(()=>use(s,'coffee'),/没有/);assert.equal(JSON.stringify(s),copy);assert.equal(G.side(s,'a'),'honest');assert.equal(G.side(s,'b'),'crooked');s.cards.a=[{role:'crooked'},{role:'crooked'},{role:'agent'}];assert.equal(G.side(s,'a'),'honest');
});
test('response confirmations share epoch; investigation private; phase change rejects stale commands',()=>{
  let s=fixture();s=act(s,'a',{type:'declare',action:'investigate',target:'b',slot:0});const epoch=s.epoch;s=act(s,'a',{type:'pass'});assert.equal(s.epoch,epoch);assert.throws(()=>act(s,'a',{type:'pass'}),/已经/);for(const id of ['b','c','d'])s=G.apply(s,id,{type:'pass',epoch},()=>.31);assert.equal(s.phase,'response');assert.equal(s.pending.type,'end');assert(s.epoch>epoch);assert.equal(G.view(s,'a').known[0].role,'kingpin');assert.deepEqual(G.view(s,'c').known,[]);assert.equal(G.view(s,'a').players[1].cards[0].role,'');s=pass(s);assert.equal(s.turn,1);assert.throws(()=>G.apply(s,'b',{type:'pass',epoch}),/更新/);
});
test('arm reveals exactly one, cannot shoot same turn; aim and end window; equipment draw must discard',()=>{
  let s=fixture();s=action(s,'a',{action:'arm',target:'b',reveal:2});assert.equal(s.guns.a,'b');assert.equal(s.phase,'aim');assert.equal(s.cards.a.filter(c=>c.open).length,1);assert.throws(()=>act(s,'a',{type:'declare',action:'shoot'}),/阶段/);s=act(s,'a',{type:'aim',target:'c'});assert.equal(s.pending.type,'end');s=pass(s);assert.equal(s.turn,1);
  s=fixture();s.hands.a=['coffee'];s=action(s,'a',{action:'equip',reveal:1});assert.equal(s.phase,'choice');assert.equal(s.flow.jobs[0].kind,'discard');assert.throws(()=>use(s,'coffee'),/结算/);assert.throws(()=>act(s,'b',{type:'choose',keep:0}),/等待/);s=act(s,'a',{type:'choose',keep:1});assert.equal(s.hands.a.length,1);assert(s.discard.includes('coffee'));assert.equal(s.pending.type,'end');
});
test('shoot elimination, leader wound/draw, second shot winner, shoot cancelled by dog',()=>{
  let s=fixture();s.guns.a='c';s.hands.c=['coffee'];s=action(s,'a',{action:'shoot'});assert(s.dead.c);assert(!s.guns.a);assert.equal(s.hands.c.length,0);assert(s.cards.c.every(c=>c.open));assert(s.discard.includes('coffee'));s=fixture();s.guns.a='b';s=action(s,'a',{action:'shoot'});assert(s.wounds.kingpin);assert(!s.dead.b);assert.equal(s.hands.b.length,1);s.phase='turn';s.guns.a='b';s=action(s,'a',{action:'shoot'});assert.equal(s.phase,'over');assert.equal(s.winner,'honest');assert(G.view(s,'a').players.every(p=>p.cards.every(c=>c.role)));
  s=fixture();s.guns.a='b';s.hands.c=['k9'];s=act(s,'a',{type:'declare',action:'shoot'});s=use(s,'k9',{target:'a'},'c');s=pass(s);assert.equal(s.phase,'turn');assert(!s.wounds.kingpin);
});
test('blackmail swaps physical cards and wounds, clears knowledge, can create solo winner',()=>{
  let s=equipped('blackmail');s.wounds.kingpin=true;s.cards.b[0].open=true;s.known.a[s.cards.b[0].id]='kingpin';s=use(s,'blackmail',{target:'b',slot:0,other:'c',otherSlot:1});assert.equal(s.cards.c[1].role,'kingpin');assert(s.cards.c[1].open);assert(G.view(s,'c').own[1].wounded);assert.equal(G.side(s,'b'),'honest');assert.deepEqual(s.known.a,{});
  s=fixture();s.hands.c=['blackmail'];s=use(s,'blackmail',{target:'a',slot:0,other:'b',otherSlot:1},'c');assert.equal(s.phase,'over');assert.equal(s.winner,'b');assert.throws(()=>use(equipped('blackmail'),'blackmail',{target:'a',slot:0,other:'b',otherSlot:1}),/另外/);
});
test('all persistent equipment: disguise blocks, planted flips ordinary only, smoke reverses, camera private reciprocal',()=>{
  let s=equipped('disguise');s=use(s,'disguise',{target:'b'});assert(s.active.b.includes('disguise'));assert.throws(()=>act(s,'a',{type:'declare',action:'investigate',target:'b',slot:0}),/调查/);s.hands.a=['planted'];s=use(s,'planted',{target:'c'});assert.equal(G.side(s,'c'),'crooked');s.hands.a=['planted'];s=use(s,'planted',{target:'b'});assert.equal(G.side(s,'b'),'crooked');s.hands.a=['smoke'];s=use(s,'smoke');assert.equal(s.direction,-1);s=action(s,'a',{action:'equip',reveal:0});if(s.phase==='choice')s=act(s,'a',{type:'choose',keep:0});s=pass(s);assert.equal(s.turn,3);
  s=equipped('camera');s=use(s,'camera');s.turn=1;s=action(s,'b',{action:'investigate',target:'a',slot:0});assert.equal(s.phase,'choice');assert.equal(s.flow.jobs[0].actor,'a');assert.equal(G.view(s,'b').known[0].role,'agent');s=act(s,'a',{type:'choose',slot:0});assert.equal(G.view(s,'a').known[0].role,'kingpin');assert.equal(G.view(s,'c').known.length,0);
});
test('revive, heal, serum, coffee and evidence bag including exclusive hand-limit choice',()=>{
  let s=equipped('defibrillator');s.dead.c=true;s.cards.c.forEach(c=>{c.open=true;});s=use(s,'defibrillator',{target:'c'});assert(!s.dead.c);assert(s.cards.c.every(c=>c.open));s.hands.a=['medkit'];s.wounds.kingpin=true;s=use(s,'medkit',{target:'b'});assert(!s.wounds.kingpin);s.hands.a=['serum'];s=use(s,'serum',{target:'d',slot:0});assert(s.cards.d[0].open);assert.equal(G.view(s,'c').players[3].cards[0].role,'crooked');
  s.hands.a=['coffee'];s=use(s,'coffee');s=action(s,'a',{action:'investigate',target:'b',slot:1});s=pass(s);assert.equal(s.turn,0);
  s=equipped('evidenceBag');s.hands.b=['k9'];s.hands.c=['coffee'];s=use(s,'evidenceBag',{target:'b',other:'c'});assert.equal(s.phase,'choice');assert.equal(s.flow.jobs[0].actor,'c');assert.equal(G.view(s,'d').hand.length,0);assert.equal(s.hands.b.length,0);s=act(s,'c',{type:'choose',keep:1});assert.deepEqual(s.hands.c,['k9']);assert.equal(s.phase,'turn');
});
test('taser only own turn and prevents shooting; radio redirects all guns including target gun',()=>{
  let s=equipped('taser');s.guns.b='c';s=use(s,'taser',{target:'b'});assert.equal(s.phase,'choice');s=act(s,'a',{type:'choose',target:'d'});assert.equal(s.guns.a,'d');assert.equal(s.taserLock,'a');assert(!s.guns.b);assert.throws(()=>act(s,'a',{type:'declare',action:'shoot'}),/射击/);s=equipped('radio');s.guns.a='b';s.guns.b='a';s=use(s,'radio',{target:'b'});assert.equal(s.guns.a,'b');assert.equal(s.guns.b,'b');
});
test('restraining and riot shield defer shot and permit additional equipment responses',()=>{
  let s=fixture();s.guns.a='b';s.hands.c=['restraining'];s=act(s,'a',{type:'declare',action:'shoot'});s=use(s,'restraining',{},'c');assert.equal(s.phase,'choice');assert.equal(s.flow.jobs[0].actor,'a');s=act(s,'a',{type:'choose',target:'d'});assert.equal(s.pending.target,'d');assert.equal(s.guns.a,'d');assert.deepEqual(s.passed,[]);s=pass(s);assert(s.dead.d);assert(!s.wounds.kingpin);
  s=fixture();s.guns.a='b';s.hands.d=['shield'];s=act(s,'a',{type:'declare',action:'shoot'});s=use(s,'shield',{},'d');assert.equal(s.flow.jobs[0].actor,'b');assert.deepEqual(s.flow.jobs[0].targets,['c','a']);s=act(s,'b',{type:'choose',target:'c'});s=pass(s);assert(s.dead.c);assert(!s.wounds.kingpin);
});
test('wiretap, polygraph and detector respect hidden cards and private receivers; recursive cameras terminate',()=>{
  let s=equipped('wiretap');s=use(s,'wiretap',{target:'b',slot:0,other:'c',otherSlot:1});assert.equal(G.view(s,'a').known.length,2);assert.equal(G.view(s,'b').known.length,0);s=equipped('polygraph');s=use(s,'polygraph',{target:'b'});assert.equal(G.view(s,'a').known.length,3);assert.equal(G.view(s,'b').known.length,3);assert.equal(G.view(s,'c').known.length,0);
  s=equipped('detector');s.guns.b='a';s.guns.d='a';s=use(s,'detector');assert.equal(s.phase,'choice');s=act(s,'a',{type:'choose',slot:0});s=act(s,'a',{type:'choose',slot:2});assert.equal(s.phase,'turn');assert.equal(G.view(s,'a').known.length,2);
  s=fixture();s.active.a=['camera'];s.active.b=['camera'];s=action(s,'a',{action:'investigate',target:'b',slot:0});let loops=0;while(s.phase==='choice'){assert(++loops<10);s=act(s,s.flow.jobs[0].actor,{type:'choose',slot:0});}assert.equal(loops,2);
});
test('deck recycle, equipment cannot interrupt choice; reset ready and private data',()=>{
  let s=fixture();s.deck=[];s.discard=['k9'];s=action(s,'a',{action:'equip',reveal:0});assert.deepEqual(s.hands.a,['k9']);assert.deepEqual(s.discard,[]);s.phase='over';s=act(s,'a',{type:'again'});assert.equal(s.phase,'lobby');assert(s.players.every(p=>!p.ready));assert.deepEqual(s.cards,{});assert.deepEqual(G.view(s,'a').hand,[]);
});
test('disarm during aim advances to end window; stolen replacement gun cannot resolve a previously declared shot',()=>{
  let s=fixture();s.phase='aim';s.guns.a='b';s.hands.c=['k9'];s=use(s,'k9',{target:'a'},'c');assert.equal(s.phase,'response');assert.equal(s.pending.type,'end');s=pass(s);assert.equal(s.turn,1);
  s=fixture();s.guns.a='b';s.guns.d='c';s.hands.a=['taser'];s.hands.c=['k9'];s=act(s,'a',{type:'declare',action:'shoot'});s=use(s,'k9',{target:'a'},'c');s=use(s,'taser',{target:'d'});s=act(s,'a',{type:'choose',target:'c'});s=pass(s);assert.equal(s.phase,'turn');assert(!s.dead.c);assert.equal(s.taserLock,'a');
  s=equipped('polygraph');s=use(s,'polygraph',{target:'a'});assert.equal(G.view(s,'a').known.length,3);
});
module.exports={setup,fixture,act,pass};
