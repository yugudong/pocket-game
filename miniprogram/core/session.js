'use strict';
const games={avalon:require('./avalon'),guandan:require('./guandan'),doudizhu:require('./doudizhu'),goodcopbadcop:require('./goodcopbadcop')};
const botAI={guandan:require('./guandan-ai'),doudizhu:require('./doudizhu-ai')};
const {sha256}=require('./codec');
const {PORT,validIP,token,encode,decode,fragments,Assembler}=require('./wire');
class Session {
  constructor(platform){
    this.p=platform;this.identity=this.p.read('identity');
    if(!this.identity||!token(this.identity.secret)||!token(this.identity.id)){const secret=this.p.randomToken();this.identity={id:sha256('player:'+secret),secret};this.p.write('identity',this.identity);}
    this.game='avalon';this.rules=games.avalon;this.listeners=new Set();this.mode='';this.connected=false;this.pending=null;this.generation=0;this.message='';this.assembler=new Assembler();this.lastSeq=-1;this.rate=new Map();
  }
  subscribe(fn){this.listeners.add(fn);fn(this.status());return()=>this.listeners.delete(fn);}
  status(){return {game:this.game,mode:this.mode,view:this.current||null,connected:this.connected,busy:!!this.pending,message:this.message,ip:this.hostIP||'',sid:this.sid||''};}
  selectGame(game='avalon'){if(!Object.prototype.hasOwnProperty.call(games,game))throw new Error('不支持这个游戏');this.game=game;this.rules=games[game];}
  emit(){for(const fn of this.listeners)fn(this.status());}
  remembered(){const r=this.p.read('resume');return r&&r.schema===1?r:null;}
  save(){if(!this.mode)return;
    this.p.write('resume',this.mode==='host'?{schema:1,game:this.game,mode:'host',sid:this.sid,password:this.password,inviteToken:this.inviteToken,model:this.model,seq:this.seq,members:Array.from(this.members.entries()).map(([id,m])=>[id,{secret:m.secret,acks:Array.from(m.acks.entries())}])}:
      {schema:1,game:this.game,mode:'client',sid:this.sid,ip:this.hostIP,name:this.name,password:this.password});
  }
  async bind(port){
    this.stopSocket();const generation=this.generation,socket=this.p.socket();this.socket=socket;
    socket.onMessage((bytes,ip,remotePort)=>{if(this.socket===socket){const packet=decode(bytes);if(packet&&validIP(ip)&&Number.isInteger(remotePort)&&remotePort>0&&remotePort<=65535)this.receive(packet,ip,remotePort);}});
    socket.onError(()=>{if(this.socket===socket){this.connected=false;this.message='局域网连接中断，请检查权限后重新连接';this.stopSocket();this.emit();}});
    try{await socket.bind(port);}catch(e){if(this.socket===socket)this.stopSocket();throw new Error(port?'无法创建房间，端口可能被占用':'无法连接局域网，请检查微信本地网络权限');}
    if(generation!==this.generation||this.socket!==socket)throw new Error('连接已取消');
    this.timer=this.p.every(()=>this.tick(),250);this.lastTick=-Infinity;
  }
  async create(name,room,password,game='avalon'){
    if(this.mode)throw new Error('请先退出当前房间');this.selectGame(game);this.rules.cleanName(name);this.rules.cleanName(room,24);this.validatePassword(password);
    this.mode='host';this.sid=this.p.randomToken();this.password=password;this.inviteToken=this.p.randomToken();this.seq=0;
    this.model=this.rules.create(this.identity.id,name,room);this.members=new Map([[this.identity.id,{secret:this.identity.secret,seen:this.p.now(),acks:new Map()}]]);
    try{await this.bind(PORT);this.connected=true;this.message='';this.publish();}catch(e){this.mode='';this.emit();throw e;}
  }
  validatePassword(password){if(typeof password!=='string'||password.length<4||password.length>16)throw new Error('房间口令需要 4～16 个字符');}
  invitation(ip){
    if(this.mode!=='host'||!this.connected||!this.model||this.model.phase!=='lobby'||!validIP(ip)||!token(this.inviteToken))return null;
    const room={ip,sid:this.sid,name:this.model.room,invite:this.inviteToken};if(this.game!=='avalon')room.game=this.game;return room;
  }
  async join(ip,name,password,sid='',invite='',game='avalon'){
    if(this.mode)throw new Error('请先退出当前房间');this.selectGame(game);if(!validIP(ip))throw new Error('请输入正确的房主 IPv4 地址');this.rules.cleanName(name);if(sid&&!token(sid))throw new Error('房间信息无效');
    if(invite){if(!token(invite)||!token(sid))throw new Error('房间邀请信息无效');}else this.validatePassword(password);
    this.mode='client';this.hostIP=ip;this.name=name;this.password=password;this.sid=sid;this.current=null;this.lastSeq=-1;
    this.joinInvite=invite;
    try{await this.bind(0);await this.handshake();}catch(e){this.stopSocket();this.mode='';this.current=null;this.emit();throw e;}
    finally{this.joinInvite='';}
  }
  async resume(){
    if(this.socket)return;const saved=this.mode?null:this.remembered();
    if(saved){
      this.selectGame(saved.game||'avalon');this.mode=saved.mode;this.sid=saved.sid;this.password=saved.password;
      if(saved.mode==='host'){
        this.model=saved.model;this.seq=saved.seq||0;this.inviteToken=token(saved.inviteToken)?saved.inviteToken:this.p.randomToken();this.members=new Map(saved.members.map(([id,m])=>[id,{secret:m.secret,seen:-Infinity,acks:new Map(m.acks||[])}]));
      }else {this.hostIP=saved.ip;this.name=saved.name;this.lastSeq=-1;}
    }
    if(!this.mode)throw new Error('没有可恢复的房间');
    try{
      await this.bind(this.mode==='host'?PORT:0);this.message='';
      if(this.mode==='host'){this.connected=true;this.publish();}else await this.handshake();
    }catch(e){this.connected=false;this.stopSocket();this.message=e.message;this.emit();throw e;}
  }
  handshake(){
    this.joinReq=this.p.randomToken();this.connected=false;this.message='正在连接房主…';this.joinAt=this.p.now();this.lastJoin=-Infinity;
    const result=new Promise((resolve,reject)=>{this.joinWait={resolve,reject};});this.sendJoin();this.emit();return result;
  }
  sendJoin(){this.lastJoin=this.p.now();this.send(this.hostIP,PORT,{t:'join',game:this.game,req:this.joinReq,sid:this.sid,pid:this.identity.id,secret:this.identity.secret,name:this.name,password:this.password,invite:this.joinInvite||''});}
  send(ip,port,packet){if(!this.socket)return;try{this.socket.send(ip,port,encode(packet));}catch(e){this.message='发送失败，请检查局域网连接';}}
  receive(packet,ip,port){if(this.mode==='host')this.receiveHost(packet,ip,port);else if(this.mode==='client')this.receiveClient(packet,ip,port);}
  limited(ip,port){
    const key=ip+':'+port,now=this.p.now(),old=this.rate.get(key);
    if(old&&now-old<150)return true;this.rate.set(key,now);if(this.rate.size>64)this.rate.delete(this.rate.keys().next().value);return false;
  }
  receiveHost(p,ip,port){
    if(p.t==='discover'){
      if(token(p.nonce)&&!this.limited(ip,port))this.send(ip,port,{t:'room',nonce:p.nonce,sid:this.sid,name:this.model.room,count:this.model.players.length,playing:this.model.phase!=='lobby',game:this.game});return;
    }
    if(p.t==='join'){
      if(this.limited(ip,port)||!token(p.req)||!token(p.pid)||!token(p.secret))return;
      const error=message=>this.send(ip,port,{t:'joinError',req:p.req,message});
      if((p.game||'avalon')!==this.game){error('这个房间是另一款游戏，请从对应入口加入');return;}
      if(p.sid&&p.sid!==this.sid){error('房主已重新建房，请重新选择房间');return;}
      let member=this.members.get(p.pid);
      if(member&&member.secret!==p.secret){error('设备身份验证失败');return;}
      if(!member){
        if(p.invite){if(p.sid!==this.sid||!token(p.invite)||p.invite!==this.inviteToken){error('邀请已失效，请让房主重新分享');return;}}
        else if(p.password!==this.password){error('房间口令不正确');return;}
        try{this.rules.addPlayer(this.model,p.pid,p.name);}catch(e){error(e.message);return;}
        member={secret:p.secret,acks:new Map()};this.members.set(p.pid,member);
      }
      const changed=member.ip!==ip||member.port!==port||!this.online(p.pid);
      member.ip=ip;member.port=port;member.seen=this.p.now();
      this.send(ip,port,{t:'welcome',req:p.req,sid:this.sid});
      if(changed)this.publish();else this.sendView(p.pid);return;
    }
    if(p.sid!==this.sid||!token(p.pid))return;const m=this.members.get(p.pid);
    if(!m||p.secret!==m.secret||m.ip!==ip||m.port!==port)return;
    const wasOnline=this.online(p.pid);m.seen=this.p.now();
    if(p.t==='ping'){if(!wasOnline)this.publish();else this.sendView(p.pid);return;}
    if(p.t==='leave'){
      if(this.model.phase==='lobby'){this.rules.removePlayer(this.model,p.pid);this.members.delete(p.pid);}else {m.seen=-Infinity;m.ip=null;m.port=null;}
      this.publish();return;
    }
    if(p.t!=='command'||!token(p.req)||!p.command||typeof p.command!=='object')return;
    if(m.acks.has(p.req)){this.send(ip,port,m.acks.get(p.req));this.sendView(p.pid);return;}
    let error='';
    try{this.process(p.pid,p.command);}catch(e){error=e.message;}
    const ack={t:'ack',sid:this.sid,pid:p.pid,req:p.req,error,seq:this.seq};m.acks.set(p.req,ack);if(m.acks.size>128)m.acks.delete(m.acks.keys().next().value);
    this.save();this.send(ip,port,ack);this.sendView(p.pid);
  }
  receiveClient(p,ip,port){
    if(ip!==this.hostIP||port!==PORT)return;
    if(p.t==='joinError'&&this.joinWait&&p.req===this.joinReq){const waiter=this.joinWait;this.joinWait=null;waiter.reject(new Error(typeof p.message==='string'?p.message:'加入失败'));return;}
    if(p.t==='welcome'&&this.joinWait&&p.req===this.joinReq&&token(p.sid)){if(this.sid&&this.sid!==p.sid)return;this.sid=p.sid;return;}
    if(!this.sid||p.sid!==this.sid)return;
    if(p.t==='closed'&&p.pid===this.identity.id){
      this.message=p.reason==='kick'?'房主已将你移出房间':'房主已解散房间';this.connected=false;this.stopSocket();this.mode='';this.current=null;this.p.write('resume',null);this.emit();return;
    }
    if(p.pid!==this.identity.id)return;
    if(p.t==='ack'&&this.pending&&p.req===this.pending.req){
      if(p.error){this.finishPending(new Error(typeof p.error==='string'?p.error:'操作失败'));return;}
      if(!Number.isSafeInteger(p.seq))return;this.pending.acked=p.seq;this.maybeFinish();return;
    }
    if(p.t!=='fragment'||p.seq<this.lastSeq)return;
    const v=this.assembler.accept(p,this.p.now());
    if(!v||v.me!==this.identity.id||!Array.isArray(v.players)||!Number.isSafeInteger(v.epoch))return;
    this.current=v;this.lastSeq=p.seq;this.lastSeen=this.p.now();this.connected=true;this.message='';
    if(this.joinWait){const waiter=this.joinWait;this.joinWait=null;this.save();waiter.resolve();}
    this.maybeFinish();this.emit();
  }
  online(id){if(this.model&&this.model.players.some(p=>p.id===id&&p.bot))return true;if(id===this.identity.id)return this.connected;const m=this.members.get(id);return !!m&&!!m.ip&&this.p.now()-m.seen<6000;}
  projection(id){const v=this.rules.view(this.model,id);v.players=v.players.map(p=>Object.assign(p,{online:this.online(p.id)}));return v;}
  publish(){
    this.seq++;this.current=this.projection(this.identity.id);this.save();this.emit();
    for(const [id,m] of this.members)if(id!==this.identity.id&&m.ip)this.sendView(id);
  }
  sendView(id){const m=this.members.get(id);if(!m||!m.ip)return;
    // Rotate retransmission order so periodic or burst packet loss does not keep
    // hitting the same chunk in every complete-state retry.
    const packets=fragments(this.projection(id),this.sid,id,this.seq);
    m.rotation=((m.rotation||0)+1)%packets.length;
    for(let i=0;i<packets.length;i++)this.send(m.ip,m.port,packets[(i+m.rotation)%packets.length]);
  }
  process(actor,command){
    if(command.type==='start'&&!this.model.players.every(p=>this.online(p.id)))throw new Error('有玩家离线，请等所有人连接后开局');
    if(command.type==='again'&&this.model.players.some(p=>!this.online(p.id)))throw new Error('请等待玩家重连，或重新创建房间');
    if(command.type==='next'&&this.model.players.some(p=>!this.online(p.id)))throw new Error('请等待玩家重连后开始下一副');
    const next=this.rules.apply(this.model,actor,command,this.p.random);
    if(command.type==='kick'){
      const m=this.members.get(command.target);if(m&&m.ip)for(let i=0;i<3;i++)this.send(m.ip,m.port,{t:'closed',sid:this.sid,pid:command.target,reason:'kick'});
      this.members.delete(command.target);
    }
    this.model=next;this.botAt=this.p.now()+850;this.publish();
  }
  act(command){
    if(!this.connected||!this.current)return Promise.reject(new Error('正在重连，请稍后操作'));
    if(this.pending)return Promise.reject(new Error('上一项操作正在确认'));
    const action=Object.assign({},command,{epoch:command.epoch===undefined?this.current.epoch:command.epoch});
    if(this.mode==='host'){try{this.process(this.identity.id,action);return Promise.resolve();}catch(e){return Promise.reject(e);}}
    const promise=new Promise((resolve,reject)=>{this.pending={req:this.p.randomToken(),command:action,resolve,reject,at:this.p.now(),sent:-Infinity,acked:null};});
    this.retryPending();this.emit();return promise;
  }
  retryPending(){if(!this.pending)return;this.pending.sent=this.p.now();this.send(this.hostIP,PORT,{t:'command',sid:this.sid,pid:this.identity.id,secret:this.identity.secret,req:this.pending.req,command:this.pending.command});}
  maybeFinish(){if(this.pending&&this.pending.acked!==null&&this.lastSeq>=this.pending.acked)this.finishPending();}
  finishPending(error){const p=this.pending;if(!p)return;this.pending=null;if(error)p.reject(error);else p.resolve();this.emit();}
  tick(){
    const now=this.p.now();
    if(this.joinWait){if(now-this.joinAt>12000){const w=this.joinWait;this.joinWait=null;w.reject(new Error('连接超时，请检查同一 Wi-Fi、口令和本地网络权限'));}
      else if(now-this.lastJoin>=1000)this.sendJoin();}
    if(this.pending){if(now-this.pending.at>12000)this.finishPending(new Error('操作未确认，请重连查看桌台后再操作'));else if(now-this.pending.sent>=700)this.retryPending();}
    if(this.mode==='host'&&this.connected&&botAI[this.game]&&now>=(this.botAt||0)&&['play','tribute','bid'].includes(this.model.phase)){
      const bot=this.model.players[this.model.turn];
      if(bot&&bot.bot){try{const command=botAI[this.game].choose(this.projection(bot.id));command.epoch=this.model.epoch;this.process(bot.id,command);}catch(e){this.botAt=now+3000;this.message='人机暂停：'+e.message;this.emit();}}
    }
    if(now-this.lastTick<1500)return;this.lastTick=now;
    if(this.mode==='host'){
      const presence=this.model.players.map(p=>this.online(p.id)?'1':'0').join('');
      if(this.presence!==presence){this.presence=presence;this.publish();}
    }else if(this.sid&&!this.joinWait){
      if(!this.connected&&this.socket){
        // A cold host restores credentials but has no current peer endpoints.
        // Re-authenticate so it can bind this device's address again; ping alone
        // cannot restore a forgotten endpoint. Retain pending request IDs.
        this.handshake().catch(error=>{if(this.mode==='client'&&this.socket){this.message=error.message;this.emit();}});
      }else {
        this.send(this.hostIP,PORT,{t:'ping',sid:this.sid,pid:this.identity.id,secret:this.identity.secret});
        if(this.connected&&now-this.lastSeen>6000){this.connected=false;this.message='房主暂时离线，正在等待恢复…';this.emit();}
      }
    }
  }
  suspend(){this.save();this.connected=false;this.stopSocket();this.emit();}
  stopSocket(){
    this.generation++;if(this.timer)this.p.cancel(this.timer);this.timer=null;
    if(this.socket){try{this.socket.close();}catch(e){/* already closed */}}this.socket=null;
    this.finishPending(new Error('连接已暂停，请重连后查看操作结果'));
    if(this.joinWait){const w=this.joinWait;this.joinWait=null;w.reject(new Error('连接已取消'));}
  }
  leave(){
    if(this.mode==='host'&&this.members){for(const [id,m] of this.members)if(id!==this.identity.id&&m.ip)for(let i=0;i<3;i++)this.send(m.ip,m.port,{t:'closed',sid:this.sid,pid:id});}
    else if(this.mode==='client')for(let i=0;i<3;i++)this.send(this.hostIP,PORT,{t:'leave',sid:this.sid,pid:this.identity.id,secret:this.identity.secret});
    this.stopSocket();this.mode='';this.current=null;this.connected=false;this.sid='';this.hostIP='';this.message='';this.lastSeq=-1;this.assembler=new Assembler();this.p.write('resume',null);this.emit();
  }
}
module.exports={Session};
