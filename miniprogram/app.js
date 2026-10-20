'use strict';
const {platform}=require('./core/wechat');
const {Session}=require('./core/session');
App({
  onLaunch(){this.ready=platform().then(p=>{this.platform=p;this.session=new Session(p);return this.session;});this.ready.catch(()=>{});},
  onHide(){if(this.session&&this.session.mode)this.session.suspend();},
  onShow(){if(this.session&&this.session.mode&&!this.session.socket)this.session.resume().catch(e=>{this.session.message=e.message;this.session.emit();});}
});
