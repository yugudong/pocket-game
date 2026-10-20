'use strict';
const {PORT,validIP,token,encode,decode}=require('./wire');
class Discovery {
  constructor(platform,game='avalon'){this.p=platform;this.game=game;this.rooms=new Map();this.generation=0;this.onChange=()=>{};this.onError=()=>{};}
  list(){return Array.from(this.rooms.values()).map(({seen,...room})=>room).sort((a,b)=>a.name.localeCompare(b.name));}
  async start(){
    this.close();this.rooms.clear();this.onChange(this.list());const generation=this.generation;this.nonce=this.p.randomToken();
    try{
      const socket=this.p.socket();this.socket=socket;
      socket.onMessage((bytes,ip,port)=>{
        if(this.socket!==socket)return;const r=decode(bytes);
        if(!r||r.t!=='room'||r.nonce!==this.nonce||port!==PORT||!validIP(ip)||!token(r.sid)||r.game!==this.game||typeof r.name!=='string'||!r.name.trim()||Array.from(r.name).length>24||!Number.isInteger(r.count)||r.count<1||r.count>({guandan:4,doudizhu:3,goodcopbadcop:8}[this.game]||10)||typeof r.playing!=='boolean')return;
        const id=ip+'|'+r.sid;if(!this.rooms.has(id)&&this.rooms.size>=32)return;
        this.rooms.set(id,{id,ip,sid:r.sid,name:r.name,count:r.count,playing:r.playing,seen:this.p.now()});this.onChange(this.list());
      });
      socket.onError(()=>{if(this.socket===socket){this.close();this.onError('搜索失败，请检查本地网络权限，或手动输入房主 IP');}});
      await socket.bind(0);if(generation!==this.generation||this.socket!==socket)return;
      this.last=-Infinity;this.tick();this.timer=this.p.every(()=>this.tick(),500);
    }catch(e){if(generation===this.generation){this.close();this.onError('无法搜索房间，可手动输入房主 IP');}}
  }
  tick(){
    if(!this.socket)return;const now=this.p.now();let changed=false;
    for(const [id,r] of this.rooms)if(now-r.seen>5000){this.rooms.delete(id);changed=true;}
    if(changed)this.onChange(this.list());if(now-this.last<1000)return;this.last=now;
    try{this.socket.send('255.255.255.255',PORT,encode({t:'discover',nonce:this.nonce}),true);}catch(e){this.close();this.onError('广播搜索不可用，请手动输入房主 IP');}
  }
  close(){this.generation++;if(this.timer)this.p.cancel(this.timer);this.timer=null;if(this.socket){try{this.socket.close();}catch(e){/* already closed */}}this.socket=null;}
}
module.exports={Discovery};
