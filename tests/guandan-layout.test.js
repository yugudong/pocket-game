'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const G=require('../miniprogram/core/guandan'),C=require('../miniprogram/core/guandan-cards'),Hand=require('../miniprogram/core/guandan-hand'),{definition}=require('../miniprogram/core/guandan-page');
function start(){let s=G.create('p','玩家','牌桌');for(const cmd of [{type:'fillBots'},{type:'ready',value:true},{type:'start'}])s=G.apply(s,'p',{...cmd,epoch:s.epoch},()=>.3);s.turn=0;return s;}
function page(table=true){const d=definition(table);return {...d,data:JSON.parse(JSON.stringify(d.data)),alive:true,visible:true,setData(patch){Object.assign(this.data,patch);}};}
function setup(s,p=page(),storage=new Map()){const status=()=>({mode:'host',game:'guandan',connected:true,busy:false,message:'',view:G.view(s,'p')});p.session={sid:'a'.repeat(64),status,invitation:()=>null,p:{read:k=>storage.get(k),write:(k,v)=>storage.set(k,JSON.parse(JSON.stringify(v)))}};p.render(status());return {p,status,storage};}
test('manual columns survive unrelated turns, losing played cards, cold-page recovery, and reset on a fresh deal',()=>{
  const s=start(),{p,status,storage}=setup(s);s.turn=1;p.render(status());const selected=[s.hands[0][0],s.hands[0].find(id=>C.card(id).rank!==C.card(s.hands[0][0]).rank)];selected.forEach(id=>p.selectCard({currentTarget:{dataset:{id}}}));p.arrange();assert.deepEqual(p.columns.find(c=>c.manual).cards,selected);assert.equal(p.data.selected.length,0);
  s.epoch++;p.render(status());assert.deepEqual(p.columns.find(c=>c.manual).cards,selected);s.hands[0]=s.hands[0].filter(id=>id!==selected[0]);s.epoch++;p.render(status());assert.deepEqual(p.columns.find(c=>c.manual).cards,[selected[1]]);
  const recovered=setup(s,page(),storage).p;assert.deepEqual(recovered.columns,p.columns);const before=s.hands[0].slice();s.round++;s.epoch++;p.render(status());assert(p.columns.every(c=>!c.manual));assert.deepEqual(p.columns.flatMap(c=>c.cards).sort((a,b)=>a-b),before.sort((a,b)=>a-b));
});
test('reconciliation removes duplicate/foreign/stale IDs and grouping preserves all owned cards',()=>{
  const hand=[0,1,54,55,4,5,58,52,106],columns=Hand.automatic(hand,2),grouped=Hand.combine(columns,[0,4,52]);assert.equal(grouped.filter(c=>c.manual).length,1);assert.equal(new Set(grouped.flatMap(c=>c.cards)).size,hand.length);assert.deepEqual(grouped.flatMap(c=>c.cards).sort((a,b)=>a-b),hand.slice().sort((a,b)=>a-b));const restored=Hand.reconcile([{cards:[0,0,107],manual:true},...grouped],hand,2);assert.equal(new Set(restored.flatMap(c=>c.cards)).size,hand.length);assert.equal(restored.flatMap(c=>c.cards).length,hand.length);
});
test('compact projection fits all cards and preserves long logical groups across screen sizes',()=>{
  const hand=Array.from({length:27},(_,id)=>id),dense=Array.from({length:6},(_,i)=>({cards:hand.slice(i*2,i*2+2),manual:true})).concat(hand.slice(12).map(id=>({cards:[id],manual:false}))),groups=[Hand.automatic(hand,2),[{cards:hand,manual:true}],dense];
  for(const [width,height] of [[844,390],[667,375],[568,320]])for(const columns of groups){
    const layout=Hand.fit(columns,{width,height}),cards=layout.columns.flatMap(c=>c.cards.map(card=>card.id));
    assert.deepEqual(cards.slice().sort((a,b)=>a-b),hand);
    assert(layout.columns.every(c=>c.height+6<=layout.height));
    assert(layout.columns.every(c=>c.cards.length<=6));
    assert.equal(layout.height,128);
    assert.equal(layout.height,Hand.fit([],{width,height}).height);
    assert.equal(layout.height,Hand.fit([{cards:[0],manual:true}],{width,height}).height);
    const total=layout.columns.length*layout.cardWidth+(layout.columns.length-1)*layout.gap;
    assert(total<=width-layout.left-layout.right-8+0.01);
    assert(layout.height+layout.bottom<height/2);
    if(columns.length===1&&columns[0].manual){assert(layout.columns.length>1);assert(layout.columns.every(c=>c.groupKey===hand[0]));}
  }
  const s=start(),{p,status}=setup(s);p.viewport={width:568,height:320};p.columns=[{cards:s.hands[0].slice(),manual:true}];p.render(status());
  assert(p.data.handColumns.length>1);p.selectColumn({currentTarget:{dataset:{id:p.data.handColumns[1].groupKey}}});assert.equal(p.data.selected.length,27);
  global.wx={};p.onResize({size:{windowWidth:844,windowHeight:390}});assert.equal(p.viewport.width,844);assert.equal(p.data.selected.length,27);assert.equal(p.columns.length,1);
});
test('whole-column selection toggles, automatic reset works and local sorting is usable offline',()=>{
  const s=start(),{p,status}=setup(s),column=p.columns[0];p.selectColumn({currentTarget:{dataset:{id:column.cards[0]}}});assert.deepEqual(p.data.selected,column.cards);p.selectColumn({currentTarget:{dataset:{id:column.cards[0]}}});assert.equal(p.data.selected.length,0);
  const ids=[s.hands[0][0],s.hands[0][s.hands[0].length-1]];p.session.status=()=>({...status(),connected:false});p.render(p.session.status());ids.forEach(id=>p.selectCard({currentTarget:{dataset:{id}}}));p.arrange();assert(p.columns.some(c=>c.manual));p.autoArrange();assert(p.columns.every(c=>!c.manual));assert.equal(p.data.canAct,false); // Local grouping remains usable without sending a command.
});
test('counts appear at ten or less; latest plays are mapped to each seat and no history is displayed',()=>{
  const s=start();s.hands[1]=s.hands[1].slice(0,11);s.hands[2]=s.hands[2].slice(0,10);s.hands[3]=s.hands[3].slice(0,1);s.tablePlays=[{type:'play',cards:[0],combo:C.classify([0],2)[0]},{type:'pass'},null,null];s.last={seat:0,cards:[0],combo:C.classify([0],2)[0]};const {p}=setup(s);assert.deepEqual(p.data.players.map(p=>p.showCount),[false,false,true,true]);assert.equal(p.data.players[0].outCards[0].id,0);assert.equal(p.data.players[1].outType,'pass');assert.equal(p.data.logs,undefined);
  const template=fs.readFileSync('miniprogram/pages/guandan-table/guandan-table.wxml','utf8');assert(!template.includes('牌桌记录'));assert(!template.includes('{{view.hand.length}}'));assert(template.includes("item.showCount"));
});
test('native page orientation routes once on start, recovers directly into table and returns to portrait lobby',()=>{
  const urls=[];global.wx={redirectTo:o=>urls.push(o.url)};const s=start(),lobby=page(false),a=setup(s,lobby);lobby.allowRoute=true;lobby.render(a.status());lobby.render(a.status());assert.deepEqual(urls,['/pages/guandan-table/guandan-table?resume=1']);
  const table=setup(s,page(true)).p;table.allowRoute=true;table.render(table.session.status());assert.equal(urls.length,1);s.phase='lobby';table.render(table.session.status());assert.equal(urls[1],'/pages/guandan/guandan');
  assert.equal(JSON.parse(fs.readFileSync('miniprogram/pages/guandan-table/guandan-table.json')).pageOrientation,'landscape');assert.equal(JSON.parse(fs.readFileSync('miniprogram/pages/guandan/guandan.json')).pageOrientation,'portrait');
});
test('each current-trick action is public, persists in saved state and clears for a new lead; old saves still project',()=>{
  let s=start();const cmd=(seat,c)=>{s=G.apply(s,s.players[seat].id,{...c,epoch:s.epoch});};const lead=C.moves(s.hands[0],2).find(m=>m.combo.kind==='single'&&m.combo.high<14);cmd(0,{type:'play',...lead});const beat=C.moves(s.hands[1],2).find(m=>m.combo.kind==='single'&&C.beats(m.combo,s.last.combo));cmd(1,{type:'play',...beat});cmd(2,{type:'pass'});const v=G.view(s,'p');assert.equal(v.tablePlays[0].type,'play');assert.equal(v.tablePlays[1].type,'play');assert.equal(v.tablePlays[2].type,'pass');assert(v.tablePlays.filter(Boolean).flatMap(x=>x.cards||[]).every(id=>v.played.includes(id)));assert.deepEqual(G.view(JSON.parse(JSON.stringify(s)),'p').tablePlays,v.tablePlays);assert.equal(v.hands,undefined);
  const legacy=JSON.parse(JSON.stringify(s));delete legacy.tablePlays;assert.deepEqual(G.view(legacy,'p').tablePlays[1].cards,beat.cards);cmd(3,{type:'pass'});cmd(0,{type:'pass'});assert.equal(s.last,null);assert(s.tablePlays.every(x=>x===null));assert.equal(s.turn,1);
});
