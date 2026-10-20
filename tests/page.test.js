'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const rules=require('../miniprogram/core/avalon');
let definition;
global.Page=value=>{definition=value;};global.wx={showShareMenu:()=>{},getLaunchOptionsSync:()=>({})};
require('../miniprogram/pages/avalon/avalon');
function page(){return Object.assign({},definition,{data:JSON.parse(JSON.stringify(definition.data)),alive:true,visible:true,setData(patch){Object.assign(this.data,patch);}});}
function model(){const s=rules.create('p0','房主','圆桌');for(let i=1;i<5;i++)rules.addPlayer(s,'p'+i,'玩家'+i);return s;}
test('private identity hides on background, permissions and selection follow authoritative epoch',()=>{
  const p=page(),s=model();s.players.forEach(x=>x.ready=true);let game=rules.apply(s,'p0',{type:'start',epoch:s.epoch},()=>.42);
  const status=()=>({mode:'host',view:Object.assign(rules.view(game,'p0'),{players:game.players.map(x=>({...x,online:true}))}),connected:true,busy:false,message:''});
  p.session={status,invitation:()=>null};p.render(status());p.showIdentity();assert.equal(p.data.showRole,true);p.onHide();assert.equal(p.data.showRole,false);
  game.phase='team';game.leader=0;game.epoch++;p.render(status());p.selectPlayer({currentTarget:{dataset:{id:'p1'}}});assert.deepEqual(p.data.selected,['p1']);
  p.render(status());assert.deepEqual(p.data.selected,['p1']);game.epoch++;p.render(status());assert.deepEqual(p.data.selected,[]);
  p.render({...status(),busy:true});assert.equal(p.data.canAct,false);p.selectPlayer({currentTarget:{dataset:{id:'p1'}}});assert.deepEqual(p.data.selected,[]);
});
test('confirmation dialogs retain original epoch when a network update arrives',async()=>{
  const p=page();p.data.view={epoch:5};let callback,sent;
  global.wx.showModal=options=>{callback=options.success;};p.session={act:async command=>{sent=command;}};
  p.confirm('test','test',{type:'start'});p.data.view.epoch=6;callback({confirm:true});await Promise.resolve();assert.equal(sent.epoch,5);
});
test('room discovery and network refresh preserve typed nickname; changing room clears old credentials',()=>{
  const p=page();p.data.nickname='昵称正在输入';p.data.password='旧口令';p.data.rooms=[{id:'r2',ip:'192.168.1.9'}];p.chooseRoom({currentTarget:{dataset:{id:'r2'}}});assert.equal(p.data.nickname,'昵称正在输入');assert.equal(p.data.password,'');assert.equal(p.data.ip,'192.168.1.9');
  p.render({mode:'host',view:rules.view(model(),'p0'),connected:true,busy:false,message:''});assert.equal(p.data.nickname,'昵称正在输入');
});
test('sharing contains no local room details; single-page launch avoids session initialization',async()=>{
  const p=page();const shared=p.onShareAppMessage(),timeline=p.onShareTimeline();assert.equal(shared.path,'/pages/home/home');assert.equal(timeline.query,'');assert(!JSON.stringify(shared).includes('password'));
  global.wx.getLaunchOptionsSync=()=>({scene:1154});global.getApp=()=>{throw new Error('single page should not initialize App');};await p.onLoad({});assert.equal(p.data.sharePreview,true);assert.equal(p.data.loading,false);
});
test('host room sharing has targeted invite path; timeline keeps public introduction only',()=>{
  const p=page();p.data.localIP='192.168.1.8';p.session={invitation:ip=>({ip,sid:'a'.repeat(64),invite:'b'.repeat(64),name:'好友圆桌'})};
  const shared=p.onShareAppMessage();assert(shared.path.startsWith('/pages/avalon/avalon?join=1&'));assert(shared.path.includes('invite='));assert(shared.title.includes('同一 Wi-Fi'));assert.equal(p.onShareTimeline().query,'');
});
test('invitation launch autojoins with stored nickname and skips unrelated saved-room restore',async()=>{
  const p=page();let joined,restored=false;
  global.wx.getLaunchOptionsSync=()=>({});
  const session={mode:'',sid:'',remembered:()=>({sid:'c'.repeat(64),name:'旧名字'}),subscribe:fn=>{fn({mode:'',message:''});return()=>{};},join:async(...args)=>{joined=args;},resume:async()=>{restored=true;},invitation:()=>null};
  global.getApp=()=>({ready:Promise.resolve(session),platform:{read:()=> '好友',write:()=>{}}});
  const helper=require('../miniprogram/core/invitation'),invite={ip:'192.168.1.8',sid:'a'.repeat(64),invite:'b'.repeat(64),name:'圆桌'};
  await p.onLoad(Object.fromEntries(new URLSearchParams(helper.query(invite))));
  assert.deepEqual(joined,[invite.ip,'好友','',invite.sid,invite.invite]);assert.equal(restored,false);assert.equal(p.data.screen,'room');assert.equal(p.data.hasInvitation,true);p.onUnload();
});
test('invitation is consumed once, reappearing page does not resubmit; selecting another room clears invite',()=>{
  const p=page();p.applyInvitation({ip:'192.168.1.8',sid:'a'.repeat(64),invite:'b'.repeat(64),name:'受邀房间'});
  p.data.rooms=[{id:'another',ip:'192.168.1.9'}];p.chooseRoom({currentTarget:{dataset:{id:'another'}}});assert.equal(p.invitation,null);assert.equal(p.data.hasInvitation,false);assert.equal(p.data.password,'');assert.equal(p.data.ip,'192.168.1.9');
});
test('opening invite while in a different room requires explicit switch, without dissolving it on launch',async()=>{
  const p=page();let joined=false,restored=false;
  const session={mode:'host',sid:'c'.repeat(64),remembered:()=>null,subscribe:()=>()=>{},join:async()=>{joined=true;},resume:async()=>{restored=true;}};
  global.wx.getLaunchOptionsSync=()=>({});global.getApp=()=>({ready:Promise.resolve(session),platform:{read:()=> '房主'}});
  const helper=require('../miniprogram/core/invitation');await p.onLoad(Object.fromEntries(new URLSearchParams(helper.query({ip:'192.168.1.8',sid:'a'.repeat(64),invite:'b'.repeat(64),name:'另一桌'}))));
  assert.equal(p.data.inviteConflict,true);assert.equal(joined,false);assert.equal(restored,false);assert.equal(session.mode,'host');p.onUnload();
});
test('first-time invited player supplies only nickname before joining the target room',async()=>{
  const p=page();let joined=null;
  const session={mode:'',remembered:()=>null,subscribe:()=>()=>{},join:async(...args)=>{joined=args;},invitation:()=>null};
  const platform={read:()=>'',write:()=>{},randomToken:()=> 'f'.repeat(64),now:()=>0,every:()=>1,cancel:()=>{},socket:()=>({onMessage:()=>{},onError:()=>{},bind:async()=>1,send:()=>{},close:()=>{}})};
  global.wx.getLaunchOptionsSync=()=>({});global.getApp=()=>({ready:Promise.resolve(session),platform});
  const helper=require('../miniprogram/core/invitation'),room={ip:'192.168.1.8',sid:'a'.repeat(64),invite:'b'.repeat(64),name:'圆桌'};
  await p.onLoad(Object.fromEntries(new URLSearchParams(helper.query(room))));assert.equal(joined,null);assert.equal(p.data.tab,'join');assert.equal(p.data.hasInvitation,true);assert.equal(p.data.password,'');
  p.input({currentTarget:{dataset:{key:'nickname'}},detail:{value:'新朋友'}});await p.enter();assert.deepEqual(joined,[room.ip,'新朋友','',room.sid,room.invite]);p.onUnload();
});
test('single-page room invite shows its name and never starts App or LAN connections',async()=>{
  const p=page(),helper=require('../miniprogram/core/invitation');global.wx.getLaunchOptionsSync=()=>({scene:1154});global.getApp=()=>{throw new Error('App must not run');};
  await p.onLoad(Object.fromEntries(new URLSearchParams(helper.query({ip:'192.168.1.8',sid:'a'.repeat(64),invite:'b'.repeat(64),name:'朋友圆桌'}))));
  assert.equal(p.data.sharePreview,true);assert.equal(p.data.inviteName,'朋友圆桌');assert.equal(p.session,undefined);assert.equal(p.discovery,undefined);
});
