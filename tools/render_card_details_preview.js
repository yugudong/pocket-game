'use strict';
const fs=require('node:fs'),path=require('node:path'),{render}=require('./render_mini_preview');
const G=require('../miniprogram/core/guandan'),C=require('../miniprogram/core/guandan-cards'),AI=require('../miniprogram/core/guandan-ai'),D=require('../miniprogram/core/doudizhu'),{definition}=require('../miniprogram/core/guandan-page');
const out=path.resolve(__dirname,'../dist/validation');
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function act(s,seat,cmd){return G.apply(s,s.players[seat].id,{...cmd,epoch:s.epoch});}
let base=G.create('p0','你','周末掼蛋');for(let i=1;i<4;i++)G.addPlayer(base,'p'+i,'朋友'+i);base.players.forEach(p=>p.ready=true);base=act(base,0,{type:'start'});base.finish=[0,2,1,3];base.phase='roundOver';base.level=5;
function find(pred){for(let seed=1;seed<1000;seed++){const s=G.apply(base,'p0',{type:'next',epoch:base.epoch},rng(seed));if(pred(s))return s;}throw new Error('fixture missing');}
const give=find(s=>s.tributeStage==='give');let exchange=give;while(exchange.tributeStage==='give')exchange=act(exchange,exchange.turn,AI.choose(G.view(exchange,exchange.players[exchange.turn].id)));
let done=exchange;while(done.phase==='tribute')done=act(done,done.turn,AI.choose(G.view(done,done.players[done.turn].id)));
const anti=find(s=>s.antiTribute&&s.antiTribute.holders.length===2);
const result=JSON.parse(JSON.stringify(done));result.hands[0]=[];result.hands[2]=[];result.finish=[0,2,1,3];result.phase='roundOver';result.turn=-1;result.result={winner:0,double:true,upgrade:3,finish:result.finish};
let ddz=D.create('p0','你','周末斗地主');for(let i=1;i<3;i++)D.addPlayer(ddz,'p'+i,'朋友'+i);ddz.players.forEach(p=>p.ready=true);ddz=D.apply(ddz,'p0',{type:'start',epoch:ddz.epoch},rng(3));ddz=D.apply(ddz,ddz.players[ddz.turn].id,{type:'bid',value:3,epoch:ddz.epoch});ddz.hands[(ddz.landlord+1)%3]=[];ddz.phase='roundOver';ddz.turn=-1;ddz.result={winner:1,winnerSeat:(ddz.landlord+1)%3,spring:'',bid:3,multiplier:2,deltas:[-12,6,6]};
const scenes=[['guandan-give',give,give.turn],['guandan-exchange',exchange,0],['guandan-exchange-done',done,0],['guandan-anti',anti,0],['guandan-result',result,0],['doudizhu-endcards',ddz,0]];
for(const [width,height] of [[844,390],[667,375],[568,320]])for(const [name,s,seat] of scenes){
  const def=name.startsWith('doudizhu')?require('../miniprogram/core/doudizhu-page').definition(true):definition(true),p={...def,data:JSON.parse(JSON.stringify(def.data)),alive:true,viewport:{width,height},setData(patch){Object.assign(this.data,patch);},session:{invitation:()=>null}},v=(s.game==='doudizhu'?D:G).view(s,s.players[seat].id);v.players=v.players.map(p=>({...p,online:true}));p.render({mode:'host',game:s.game,connected:true,busy:false,view:v});p.setData({loading:false});if(name==='guandan-exchange-done')p.showRoundInfo();fs.writeFileSync(path.join(out,name+'-'+width+'-preview.html'),render(s.game+'-table',p.data));
}
console.log('Saved card exchange, anti-tribute and remaining-hand previews');
