'use strict';
const {games}=require('../../core/catalog');
Page({
  data:{games,resume:false,resumeName:'',resumeRoute:''},
  onLoad(){this.alive=true;wx.showShareMenu({menus:['shareAppMessage','shareTimeline']});},
  async onShow(){try{const app=getApp({allowDefault:true});if(!app||!app.ready)return;const session=await app.ready,saved=session.remembered(),game=games.find(g=>g.id===(session.mode?session.game:saved&&saved.game||'avalon'));if(this.alive)this.setData({resume:!!game&&(!!session.mode||!!saved),resumeName:game?game.name:'',resumeRoute:game?game.route:''});}catch(e){/* static home still available */}},
  onUnload(){this.alive=false;},
  openGame(e){const game=games.find(g=>g.id===e.currentTarget.dataset.id);if(game&&game.available)wx.navigateTo({url:game.route});},
  resumeGame(){if(this.data.resumeRoute)wx.navigateTo({url:this.data.resumeRoute+'?resume=1'});},
  showHelp(){wx.showModal({title:'围坐一起，就能开局',content:'每位玩家使用自己的手机。连接同一个 Wi-Fi 或手机热点，房主创建房间，其他人搜索加入。首次打开小程序需要联网；代码加载后，牌局通过局域网运行。房主请保持小程序前台，iPhone 需允许微信访问本地网络。',showCancel:false});},
  onShareAppMessage(){return{title:'口袋桌游 · 和身边的人一起玩',path:'/pages/home/home',imageUrl:'/assets/avatar.png'};},
  onShareTimeline(){return{title:'口袋桌游 · 和身边的人一起玩',query:'',imageUrl:'/assets/avatar.png'};}
});
