'use strict';
// Static layout fixtures only, not a WeChat runtime emulator.
const fs=require('node:fs'),path=require('node:path'),{render}=require('./render_mini_preview');
const G=require('../miniprogram/core/goodcopbadcop');let def;global.Page=d=>{def=d;};require('../miniprogram/pages/goodcopbadcop/goodcopbadcop');
const out=path.resolve(__dirname,'../dist/validation');
function page(s,id='a'){const p={...def,data:JSON.parse(JSON.stringify(def.data)),alive:true,visible:true,setData(v){Object.assign(this.data,v);},session:{invitation:()=>null}};if(s)p.render({game:'goodcopbadcop',mode:'host',connected:true,busy:false,message:'',view:{...G.view(s,id),players:G.view(s,id).players.map(p=>({...p,online:true}))}});p.setData({loading:false});return p;}
function save(name,p){for(const w of [390,320])fs.writeFileSync(path.join(out,'goodcopbadcop-'+name+'-'+w+'-preview.html'),render('goodcopbadcop',p.data));}
const entry=page();save('entry',entry);
let s=G.create('a','小陈','周末无间风云');for(const [i,id] of ['b','c','d'].entries())G.addPlayer(s,id,['阿杰','小林','小周'][i]);save('waiting',page(s));for(const p of s.players)s=G.apply(s,p.id,{type:'ready',value:true,epoch:s.epoch});s=G.apply(s,'a',{type:'start',epoch:s.epoch},()=>.31);s.turn=0;let p=page(s);p.setData({privateOpen:true});save('identity',p);
s.phase='turn';s.hands.a=['blackmail'];p=page(s);p.selectAction({currentTarget:{dataset:{action:'arm'}}});p.selectTarget({currentTarget:{dataset:{id:'b'}}});p.revealSlot({currentTarget:{dataset:{slot:0}}});save('action',p);
s.phase='response';s.pending={type:'shoot',target:'b'};s.guns.a='b';s.hands.a=['blackmail'];s.hands.c=['shield'];p=page(s);p.toggleEquipment();p.equipTarget({currentTarget:{dataset:{field:'targetA',id:'b'}}});p.equipTarget({currentTarget:{dataset:{field:'targetB',id:'c'}}});save('response',p);
s.phase='choice';s.flow={returnPhase:'response',jobs:[{kind:'discard',actor:'a',label:'选择保留一张装备'}]};s.hands.a=['blackmail','camera'];p=page(s);save('hidden-choice',p);p.setData({privateOpen:true});save('choice',p);
s.phase='over';s.flow=null;s.winner='honest';s.reason='主谋第二次中弹';p=page(s);save('result',p);
let long=G.create('a','这是一个十六字的最长中文昵称啊','最长房间名的八人无间风云调查桌');for(const id of ['b','c','d','e','f','g','h'])G.addPlayer(long,id,'这是一个十六字的最长中文昵称啊');for(const p of long.players)long=G.apply(long,p.id,{type:'ready',value:true,epoch:long.epoch});long=G.apply(long,'a',{type:'start',epoch:long.epoch},()=>.31);long.phase='response';long.pending={type:'shoot',target:'b'};long.guns={a:'b',b:'c',c:'d',d:'e',e:'f',f:'g',g:'h',h:'a'};long.active.a=['disguise','planted','camera'];long.cards.b[0].open=true;long.wounds[long.cards.b[0].role]=true;long.hands.a=['wiretap'];p=page(long);p.setData({privateOpen:true});p.toggleEquipment();save('stress',p);
for(const name of ['hidden-choice','action']){const html=fs.readFileSync(path.join(out,'goodcopbadcop-'+name+'-390-preview.html'),'utf8');if(html.includes('交换另外两名存活玩家'))throw new Error('Private equipment leaked into closed panel');}
console.log('Saved 18 Good Cop Bad Cop static fixtures');
