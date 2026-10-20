'use strict';
const {Discovery}=require('../../core/discovery');
const {localIP}=require('../../core/wechat');
const {deck,ROLES}=require('../../core/avalon');
const invitation=require('../../core/invitation');
const {validIP}=require('../../core/wire');
const PHASES={lobby:'等待开局',reveal:'查看身份',team:'队长组队',vote:'组队表决',quest:'执行任务',result:'任务结算',assassinate:'刺杀梅林',over:'终局揭晓'};
Page({
  data:{screen:'entry',tab:'create',loading:true,submitting:false,error:'',networkMessage:'',nickname:'',roomName:'阿瓦隆圆桌',password:'',ip:'',localIP:'',rooms:[],manual:false,selectedRoom:'',searchError:'',showRole:false,rulesOpen:false,sharePreview:false,selected:[],target:'',view:null,connected:false,busy:false,roleOptions:[],hasInvitation:false,inviteName:'',inviteConflict:false,canShareRoom:false},
  async onLoad(options={}){
    this.alive=true;this.visible=true;
    let invite=null,inviteError='';try{invite=invitation.parse(options);if(invite&&invite.game)throw new Error('请从对应游戏入口打开邀请');}catch(e){invite=null;inviteError=e.message;}
    if(invite){this.invitation=invite;this.setData({hasInvitation:true,inviteName:invite.name,tab:'join',ip:invite.ip});}
    const launch=wx.getLaunchOptionsSync?wx.getLaunchOptionsSync():{};
    if(launch.scene===1154||launch.apiCategory==='browseOnly'){this.setData({sharePreview:true,loading:false});return;}
    wx.showShareMenu({menus:['shareAppMessage','shareTimeline']});
    try{
      const app=getApp({allowDefault:true});if(!app||!app.ready){this.setData({sharePreview:true,loading:false});return;}
      this.session=await app.ready;if(!this.alive)return;
      this.discovery=new Discovery(app.platform);this.discovery.onChange=rooms=>this.updateRooms(rooms);
      this.discovery.onError=searchError=>{if(this.alive)this.setData({searchError});};
      this.unsubscribe=this.session.subscribe(status=>this.render(status));
      const saved=this.session.remembered();
      this.setData({nickname:app.platform.read('nickname')||(invite&&saved&&saved.sid===invite.sid?saved.name:'')||'',loading:false});
      if(invite){
        if(this.session.mode&&this.session.sid!==invite.sid)this.setData({inviteConflict:true});
        else if(this.session.mode)await this.restore();
        else {this.applyInvitation(invite);if(this.data.nickname.trim())await this.enter();else await this.discovery.start();}
      }else if((this.session.mode||options.resume==='1')&&(!this.session.mode||!this.session.game||this.session.game==='avalon'))await this.restore();
      if(inviteError)this.setData({error:inviteError,tab:'join'});
    }catch(e){if(this.alive)this.setData({error:e.message,loading:false});}
  },
  onShow(){this.visible=true;if(this.session)this.render(this.session.status());if(this.discovery&&this.data.screen==='entry'&&this.data.tab==='join')this.discovery.start();if(this.session&&this.session.mode==='host')this.updateIP();},
  onHide(){this.visible=false;if(this.discovery)this.discovery.close();this.setData({showRole:false});},
  onUnload(){this.alive=false;this.visible=false;if(this.discovery)this.discovery.close();if(this.unsubscribe)this.unsubscribe();},
  render(status){
    if(!this.alive)return;const v=status.view;
    if(status.mode&&status.game&&status.game!=='avalon'){this.setData({view:null,screen:'other',connected:false,busy:false,showRole:false,canShareRoom:false});return;}
    if(!status.mode){this.setData({view:null,screen:'entry',connected:false,busy:false,showRole:false,networkMessage:status.message});return;}
    if(!v){this.setData({screen:'room',connected:status.connected,busy:status.busy,networkMessage:status.message});return;}
    const reset=this.epoch!==v.epoch;this.epoch=v.epoch;
    const selected=reset?[]:this.data.selected,target=reset?'':this.data.target;
    const revealed=new Map((v.revealed||[]).map(p=>[p.id,p]));
    const players=v.players.map((p,i)=>Object.assign({},p,{seat:i+1,initial:Array.from(p.name)[0],me:p.id===v.me,host:p.id===v.hostId,captain:p.id===v.leader,onTeam:v.team.includes(p.id),selected:selected.includes(p.id),target:p.id===target,eligible:(v.targets||[]).includes(p.id),revealed:revealed.get(p.id)||null}));
    const my=v.players.find(p=>p.id===v.me),captain=v.players.find(p=>p.id===v.leader),assassin=v.players.find(p=>p.id===v.assassin);
    const known=(v.private?v.private.known:[]).map(p=>{const player=v.players.find(x=>x.id===p.id);return Object.assign({},p,{name:player.name,seat:v.players.indexOf(player)+1});});
    let roster='',configError='';try{const roles=deck(v.players.length,v.config),counts={};roles.forEach(r=>{counts[r]=(counts[r]||0)+1;});roster=Object.keys(counts).map(r=>ROLES[r].name+' ×'+counts[r]).join(' · ');}catch(e){configError=v.players.length<5?'至少 5 人才能开局':e.message;}
    const missions=v.sizes.map((size,i)=>{const result=v.results.find(r=>r.quest===i+1);return{number:i+1,size,double:v.players.length>=7&&i===3,status:result?(result.success?'success':'fail'):(i+1===v.quest&&v.phase!=='lobby'?'current':'waiting'),label:result?(result.success?'成功':'失败'):size+' 人'};});
    const name=id=>{const p=v.players.find(x=>x.id===id);return p?p.name:'离席玩家';};
    const history=v.history.slice().reverse().map((h,i)=>({key:v.history.length-i,title:'第 '+h.quest+' 轮'+(h.kind==='vote'?' · 第 '+h.attempt+' 次组队':' · 任务结果'),
      description:h.kind==='vote'?(h.passed?'组队通过':'组队否决')+' · 队长 '+name(h.leader):(h.success?'任务成功':'任务失败')+' · '+h.fails+' 张失败牌',
      team:h.team.map(name).join('、'),votes:h.kind==='vote'?v.players.map(p=>({id:p.id,name:p.name,approve:h.votes[p.id]})):[]}));
    this.setData({screen:'room',view:v,players,my,host:v.me===v.hostId,isCaptain:v.me===v.leader,isAssassin:v.private&&v.private.role==='assassin',captainName:captain?captain.name:'',assassinName:assassin?assassin.name:'',phaseName:PHASES[v.phase],canShareRoom:!!this.session&&!!this.session.invitation(this.data.localIP),
      selected,target,known,missions,history,roster,configError,connected:status.connected,busy:status.busy,networkMessage:status.message,hostIP:status.ip,
      canAct:status.connected&&!status.busy,required:v.sizes[v.quest-1],onMission:v.team.includes(v.me),teamNames:v.team.map(name).join('、'),
      allReady:v.players.length>=5&&v.players.every(p=>p.ready&&p.online)&&!configError,
      roleOptions:[{key:'percival',name:'派西维尔',hint:'寻找并保护梅林',on:v.config.percival},{key:'morgana',name:'莫甘娜',hint:'伪装成梅林',on:v.config.morgana},{key:'mordred',name:'莫德雷德',hint:'对梅林隐藏身份',on:v.config.mordred},{key:'oberon',name:'奥伯伦',hint:'不与其他坏人相认',on:v.config.oberon}],
      goodScore:v.results.filter(r=>r.success).length,evilScore:v.results.filter(r=>!r.success).length});
  },
  input(e){const key=e.currentTarget.dataset.key;if(['nickname','roomName','password','ip'].includes(key))this.setData({[key]:e.detail.value});},
  applyInvitation(invite){this.invitation=invite;this.setData({screen:'entry',tab:'join',hasInvitation:true,inviteName:invite.name,ip:invite.ip,selectedRoom:'',password:'',manual:false,inviteConflict:false,error:''});},
  clearInvitation(){this.invitation=null;this.setData({hasInvitation:false,inviteName:'',inviteConflict:false});},
  updateRooms(rooms){
    if(!this.alive||!this.visible)return;const patch={rooms};
    if(this.invitation&&this.data.screen==='entry'&&this.data.tab==='join'){const room=rooms.find(r=>r.sid===this.invitation.sid);if(room){this.invitation.ip=room.ip;patch.ip=room.ip;}}
    this.setData(patch);
  },
  switchInvitedRoom(){
    if(!this.invitation||this.data.submitting)return;
    const host=this.session.mode==='host';wx.showModal({title:'加入邀请的圆桌？',content:host?'将解散你当前的房间，再加入「'+this.invitation.name+'」。':'将退出当前房间，再加入「'+this.invitation.name+'」。',confirmColor:'#24553e',success:async r=>{if(!r.confirm||!this.alive)return;const invite=this.invitation;this.session.leave();this.applyInvitation(invite);if(this.data.nickname.trim())await this.enter();else this.discovery.start();}});
  },
  dismissInvitation(){this.clearInvitation();},
  switchTab(e){const tab=e.currentTarget.dataset.tab;this.clearInvitation();this.setData({tab,error:'',selectedRoom:'',password:'',searchError:'',ip:''});if(this.discovery){if(tab==='join')this.discovery.start();else this.discovery.close();}},
  refresh(){if(this.discovery){this.setData({searchError:''});this.discovery.start();}},
  chooseRoom(e){const room=this.data.rooms.find(r=>r.id===e.currentTarget.dataset.id);if(room){this.clearInvitation();this.setData({selectedRoom:room.id,ip:room.ip,password:'',manual:false});}},
  toggleManual(){this.clearInvitation();this.setData({manual:!this.data.manual,selectedRoom:'',ip:'',password:''});},
  async enter(){
    if(this.data.submitting||!this.session)return;this.setData({submitting:true,error:'',networkMessage:''});if(this.discovery)this.discovery.close();
    try{
      const d=this.data;getApp().platform.write('nickname',d.nickname.trim());
      if(d.tab==='create')await this.session.create(d.nickname,d.roomName,d.password);
      else {const room=d.rooms.find(r=>r.id===d.selectedRoom),invite=this.invitation;await this.session.join(d.ip.trim(),d.nickname,invite?'':d.password,invite?invite.sid:room?room.sid:'',invite?invite.invite:'');}
      if(this.alive){this.setData({password:'',screen:'room'});this.updateIP();}
    }catch(e){if(this.alive){this.setData({error:e.message});if(this.data.tab==='join'&&this.discovery)this.discovery.start();}}
    finally{if(this.alive)this.setData({submitting:false});}
  },
  async restore(){
    if(!this.session)return;const saved=this.session.remembered();if((this.session.mode?this.session.game:saved&&saved.game)==='guandan'){this.continueOther();return;}this.setData({screen:'room',error:'',submitting:true});
    try{await this.session.resume();if(this.alive)this.updateIP();}catch(e){if(this.alive)this.setData({error:e.message});}
    finally{if(this.alive)this.setData({submitting:false});}
  },
  async updateIP(){const ip=await localIP();if(this.alive)this.setData({localIP:ip,canShareRoom:!!this.session&&!!this.session.invitation(ip)});},
  copyIP(){if(this.data.localIP)wx.setClipboardData({data:this.data.localIP});},
  continueOther(){wx.redirectTo({url:'/pages/guandan/guandan?resume=1'});},
  tapIP(){if(this.data.localIP)this.copyIP();else this.updateIP();},
  async action(command){this.setData({error:''});try{await this.session.act(command);}catch(e){if(this.alive)this.setData({error:e.message});}},
  ready(){this.action({type:'ready',value:!this.data.my.ready});},
  toggleRole(e){if(this.data.host&&this.data.canAct)this.action({type:'config',key:e.currentTarget.dataset.key,value:e.detail.value});},
  start(){this.confirm('开始本局？','将随机分配身份，开局后不能更换玩家。',{type:'start'});},
  showIdentity(){this.setData({showRole:!this.data.showRole});},
  seen(){this.setData({showRole:false});this.action({type:'seen'});},
  begin(){this.action({type:'begin'});},
  selectPlayer(e){
    if(!this.data.canAct)return;const id=e.currentTarget.dataset.id,v=this.data.view;
    if(v.phase==='team'&&this.data.isCaptain){const selected=this.data.selected.slice(),at=selected.indexOf(id);if(at>=0)selected.splice(at,1);else if(selected.length<this.data.required)selected.push(id);else {wx.showToast({title:'本轮只需 '+this.data.required+' 人',icon:'none'});return;}this.setData({selected});this.render(this.session.status());}
    if(v.phase==='assassinate'&&this.data.isAssassin&&(v.targets||[]).includes(id)){this.setData({target:id});this.render(this.session.status());}
  },
  propose(){const names=this.data.players.filter(p=>this.data.selected.includes(p.id)).map(p=>p.name).join('、');this.confirm('提交这支队伍？',names,{type:'propose',team:this.data.selected.slice()});},
  vote(e){const approve=e.currentTarget.dataset.approve==='yes';this.confirm(approve?'赞成这支队伍？':'反对这支队伍？','提交后不能修改，所有人投完后同时公开。',{type:'vote',approve});},
  quest(e){const success=e.currentTarget.dataset.success==='yes';this.confirm(success?'提交成功牌？':'提交失败牌？','任务牌匿名结算，提交后不能修改。',{type:'quest',success});},
  next(){this.action({type:'next'});},
  assassinate(){const p=this.data.players.find(p=>p.id===this.data.target);if(p)this.confirm('刺杀 '+p.name+'？','这是最后一次选择，确认后揭晓胜负。',{type:'assassinate',target:p.id});},
  again(){this.confirm('再来一局？','返回准备大厅，下一局重新随机分配身份。',{type:'again'});},
  kick(e){const p=this.data.players.find(p=>p.id===e.currentTarget.dataset.id);if(p&&!p.host)this.confirm('移出 '+p.name+'？','该玩家可以重新搜索并加入房间。',{type:'kick',target:p.id});},
  confirm(title,content,command){const epoch=this.data.view.epoch;wx.showModal({title,content,confirmColor:'#24553e',success:r=>{if(r.confirm&&this.alive)this.action(Object.assign({},command,{epoch}));}});},
  leave(){const host=this.session&&this.session.mode==='host';wx.showModal({title:host?'解散房间？':'退出房间？',content:host?'本桌所有人会断开，当前牌局将结束。':'游戏中会保留你的座位，可用原设备重连。',confirmColor:'#9d443d',success:r=>{if(r.confirm&&this.alive){this.session.leave();this.setData({error:'',showRole:false});}}});},
  toggleRules(){this.setData({rulesOpen:!this.data.rulesOpen});},
  onShareAppMessage(){const room=this.session&&(!this.session.game||this.session.game==='avalon')&&this.session.invitation(this.data.localIP);if(room)return invitation.share(room);return{title:'口袋桌游 · 阿瓦隆，圆桌之上谁值得信任？',path:'/pages/home/home',imageUrl:'/assets/avatar.png'};},
  onShareTimeline(){return{title:'口袋桌游 · 和朋友一起玩阿瓦隆',query:'',imageUrl:'/assets/avatar.png'};}
});
