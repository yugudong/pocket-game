'use strict';
const {Discovery}=require('./discovery');
const {localIP}=require('./wechat');
const invitation=require('./invitation');
const {games}=require('./catalog');
function roomPage(game){
  const info=games.find(g=>g.id===game);
  return {
    data:{screen:'entry',tab:'create',loading:true,submitting:false,error:'',networkMessage:'',nickname:'',roomName:info.name+'牌桌',password:'',ip:'',localIP:'',rooms:[],manual:false,selectedRoom:'',searchError:'',rulesOpen:false,sharePreview:false,view:null,connected:false,busy:false,hasInvitation:false,inviteName:'',inviteConflict:false,canShareRoom:false,otherRoom:false},
    async onLoad(options={}){
      this.alive=true;this.visible=true;let invite=null,inviteError='';try{invite=invitation.parse(options);if(invite&&(invite.game||'avalon')!==game)throw new Error('邀请的游戏与当前入口不一致');}catch(e){invite=null;inviteError=e.message;}
      if(invite)this.applyInvitation(invite);
      const launch=wx.getLaunchOptionsSync?wx.getLaunchOptionsSync():{};if(launch.scene===1154||launch.apiCategory==='browseOnly'){this.setData({sharePreview:true,loading:false});return;}
      wx.showShareMenu({menus:['shareAppMessage','shareTimeline']});
      try{
        const app=getApp({allowDefault:true});if(!app||!app.ready){this.setData({sharePreview:true,loading:false});return;}
        this.session=await app.ready;if(!this.alive)return;
        this.discovery=new Discovery(app.platform,game);this.discovery.onChange=rooms=>this.updateRooms(rooms);this.discovery.onError=searchError=>{if(this.alive)this.setData({searchError});};
        this.unsubscribe=this.session.subscribe(status=>this.render(status));const saved=this.session.remembered();
        this.setData({nickname:app.platform.read('nickname')||(saved&&saved.name)||'',loading:false});
        if(invite){if(this.session.mode&&this.session.sid!==invite.sid)this.setData({inviteConflict:true});else if(this.session.mode)await this.restore();else {this.applyInvitation(invite);if(this.data.nickname.trim())await this.enter();else await this.discovery.start();}}
        else if(this.session.mode&&this.session.game===game||options.resume==='1'&&(!saved||(saved.game||'avalon')===game))await this.restore();
        if(inviteError)this.setData({error:inviteError,tab:'join'});
      }catch(e){if(this.alive)this.setData({error:e.message,loading:false});}
    },
    onShow(){this.visible=true;if(this.session)this.render(this.session.status());if(this.discovery&&this.data.screen==='entry'&&this.data.tab==='join')this.discovery.start();if(this.session&&this.session.mode==='host'&&this.session.game===game)this.updateIP();},
    onHide(){this.visible=false;if(this.discovery)this.discovery.close();this.setData({hideHand:true,selected:[]});},
    onUnload(){this.alive=false;this.visible=false;if(this.discovery)this.discovery.close();if(this.unsubscribe)this.unsubscribe();},
    input(e){const key=e.currentTarget.dataset.key;if(['nickname','roomName','password','ip'].includes(key))this.setData({[key]:e.detail.value});},
    applyInvitation(invite){this.invitation=invite;this.setData({screen:'entry',tab:'join',hasInvitation:true,inviteName:invite.name,ip:invite.ip,selectedRoom:'',password:'',manual:false,inviteConflict:false,error:''});},
    clearInvitation(){this.invitation=null;this.setData({hasInvitation:false,inviteName:'',inviteConflict:false});},
    updateRooms(rooms){if(!this.alive||!this.visible)return;const patch={rooms};if(this.invitation&&this.data.screen==='entry'){const r=rooms.find(r=>r.sid===this.invitation.sid);if(r){this.invitation.ip=r.ip;patch.ip=r.ip;}}this.setData(patch);},
    switchInvitedRoom(){if(!this.invitation||this.data.submitting)return;wx.showModal({title:'加入邀请的牌桌？',content:this.session.mode==='host'?'会解散你当前的房间，再加入这桌。':'会退出你当前的房间，再加入这桌。',confirmColor:'#24553e',success:async r=>{if(!r.confirm||!this.alive)return;const invite=this.invitation;this.session.leave();this.applyInvitation(invite);if(this.data.nickname.trim())await this.enter();else this.discovery.start();}});},
    dismissInvitation(){this.clearInvitation();},
    switchTab(e){const tab=e.currentTarget.dataset.tab;this.clearInvitation();this.setData({tab,error:'',selectedRoom:'',password:'',searchError:'',ip:''});if(this.discovery){if(tab==='join')this.discovery.start();else this.discovery.close();}},
    refresh(){if(this.discovery)this.discovery.start();},
    chooseRoom(e){const r=this.data.rooms.find(r=>r.id===e.currentTarget.dataset.id);if(r){this.clearInvitation();this.setData({selectedRoom:r.id,ip:r.ip,password:'',manual:false});}},
    toggleManual(){this.clearInvitation();this.setData({manual:!this.data.manual,selectedRoom:'',ip:'',password:''});},
    async enter(){
      if(this.data.submitting||!this.session)return;this.setData({submitting:true,error:''});if(this.discovery)this.discovery.close();
      try{const d=this.data;getApp().platform.write('nickname',d.nickname.trim());if(d.tab==='create')await this.session.create(d.nickname,d.roomName,d.password,game);else {const r=d.rooms.find(r=>r.id===d.selectedRoom),invite=this.invitation;await this.session.join(d.ip.trim(),d.nickname,invite?'':d.password,invite?invite.sid:r?r.sid:'',invite?invite.invite:'',game);}if(this.alive){this.setData({password:'',hideHand:false});this.updateIP();}}
      catch(e){if(this.alive){this.setData({error:e.message});if(this.data.tab==='join'&&this.discovery)this.discovery.start();}}finally{if(this.alive)this.setData({submitting:false});}
    },
    async restore(){if(!this.session)return;const saved=this.session.remembered(),activeGame=this.session.mode?this.session.game:saved&&saved.game||'avalon';if(activeGame!==game){this.continueOther();return;}this.setData({screen:'room',submitting:true,error:''});try{await this.session.resume();if(this.alive)this.updateIP();}catch(e){if(this.alive)this.setData({error:e.message});}finally{if(this.alive)this.setData({submitting:false});}},
    continueOther(){const s=this.session,remembered=s.remembered(),g=games.find(x=>x.id===(s.mode?s.game:remembered&&remembered.game||'avalon'));if(g)wx.redirectTo({url:g.route+'?resume=1'});},
    async updateIP(){const ip=await localIP();if(this.alive)this.setData({localIP:ip,canShareRoom:!!this.session&&this.session.game===game&&!!this.session.invitation(ip)});},
    tapIP(){if(this.data.localIP)wx.setClipboardData({data:this.data.localIP});else this.updateIP();},
    async action(command){if(!this.session||this.session.game!==game)return;this.setData({error:''});try{await this.session.act(command);}catch(e){if(this.alive)this.setData({error:e.message});}},
    confirm(title,content,command){const epoch=this.data.view.epoch;wx.showModal({title,content,confirmColor:'#24553e',success:r=>{if(r.confirm&&this.alive)this.action(Object.assign({},command,{epoch}));}});},
    leave(){const host=this.session&&this.session.mode==='host';wx.showModal({title:host?'解散当前房间？':'退出当前房间？',content:host?'所有真人玩家会断开，当前牌局会结束。':'开局后会保留座位，可用原设备重连。',confirmColor:'#9d443d',success:r=>{if(r.confirm&&this.alive){this.session.leave();this.setData({error:'',hideHand:false});}}});},
    toggleRules(){this.setData({rulesOpen:!this.data.rulesOpen});},
    onShareAppMessage(){const room=this.session&&this.session.game===game&&this.session.invitation(this.data.localIP);if(room)return invitation.share(room);return {title:'口袋桌游 · '+info.name+'，和朋友或电脑开一桌',path:info.route,imageUrl:'/assets/avatar.png'};},
    onShareTimeline(){return {title:'口袋桌游 · 一起玩'+info.name,query:'',imageUrl:'/assets/avatar.png'};}
  };
}
module.exports={roomPage};
