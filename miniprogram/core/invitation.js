'use strict';
const {validIP,token}=require('./wire');
const {utf8,text,base64,unbase64}=require('./codec');
const ROUTES={avalon:'/pages/avalon/avalon',guandan:'/pages/guandan/guandan',doudizhu:'/pages/doudizhu/doudizhu',goodcopbadcop:'/pages/goodcopbadcop/goodcopbadcop'};
function validate(room){
  if(!room||!validIP(room.ip)||!token(room.sid)||!token(room.invite)||typeof room.name!=='string'||!room.name.trim()||Array.from(room.name).length>24)throw new Error('房间邀请信息无效，请让房主重新分享');
  if(room.game&&!Object.prototype.hasOwnProperty.call(ROUTES,room.game))throw new Error('房间游戏信息无效');
  const r={ip:room.ip,sid:room.sid,invite:room.invite,name:room.name};if(room.game&&room.game!=='avalon')r.game=room.game;return r;
}
function query(room){
  const r=validate(room),label=base64(utf8(r.name)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return 'join=1&ip='+encodeURIComponent(r.ip)+'&sid='+r.sid+'&invite='+r.invite+'&label='+label+(r.game?'&game='+r.game:'');
}
function parse(options={}){
  if(options.join!=='1')return null;
  if(typeof options.label!=='string'||options.label.length>128||!/^[A-Za-z0-9_-]+$/.test(options.label)||options.label.length%4===1)throw new Error('房间邀请信息无效，请让房主重新分享');
  const label=options.label.replace(/-/g,'+').replace(/_/g,'/'),padded=label+'='.repeat((4-label.length%4)%4);
  return validate({ip:options.ip,sid:options.sid,invite:options.invite,name:text(unbase64(padded)),game:options.game});
}
function share(room){const r=validate(room);return {title:'来「'+r.name+'」玩'+({guandan:'掼蛋',doudizhu:'斗地主',avalon:'阿瓦隆',goodcopbadcop:'无间风云'}[r.game||'avalon'])+' · 同一 Wi-Fi',path:ROUTES[r.game||'avalon']+'?'+query(r),imageUrl:'/assets/avatar.png'};}
module.exports={parse,query,share};
