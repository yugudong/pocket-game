'use strict';
const {roomPage}=require('./room-page');
const Touch=require('./guandan-touch');
function definition(tableOnly=false,config={}){
  const game=config.game||'guandan',ddz=game==='doudizhu',seats=ddz?3:4;
  const C=config.cards||require('./guandan-cards'),AI=config.ai||require('./guandan-ai'),Hand=config.hand||require('./guandan-hand');
  const base=roomPage(game);
  return Object.assign({},base,{
    data:Object.assign({},base.data,{selected:[],comboKey:'',comboOptions:[],hideHand:false,hintText:'',handColumns:[],players:[],inGame:false,topInset:44,handLayout:Hand.fit([]),roundInfoOpen:false,tributeRows:[],antiHolders:[],remainingRows:[],exchangeGiving:false,exchangeOptions:[]}),
    async onLoad(options={}){this.allowRoute=false;await base.onLoad.call(this,options);this.allowRoute=true;if(this.session&&this.alive)this.syncRoute(this.session.status());if(tableOnly)this.updateInsets();},
    onShow(){base.onShow.call(this);if(tableOnly)this.updateInsets();},onResize(e){this.cancelSwipe();if(tableOnly)this.updateInsets(e);},
    onHide(){this.cancelSwipe();base.onHide.call(this);},onUnload(){this.cancelSwipe();base.onUnload.call(this);},
    onReady(){if(tableOnly)this.updateInsets();},
    updateInsets(e){
      if(!this.alive)return;let top=44,info={};try{if(wx.getMenuButtonBoundingClientRect){const box=wx.getMenuButtonBoundingClientRect();if(box&&box.bottom>0)top=Math.max(40,box.bottom+6);}info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync?wx.getSystemInfoSync():{};}catch(e){/* compact default */}
      const size=e&&e.size||info,width=size.windowWidth||844,height=size.windowHeight||390,safe=info.safeArea;
      this.viewport={width,height,left:safe?Math.max(0,safe.left):0,right:safe?Math.max(0,(info.screenWidth||width)-safe.right):0,bottom:safe?Math.max(0,(info.screenHeight||height)-safe.bottom):0};
      this.setData({topInset:top});if(this.session&&this.data.view)this.render(this.session.status());
    },
    syncRoute(status){
      if(!this.allowRoute||!this.alive||this.navigating||this.data.sharePreview)return;const active=status.mode&&status.game===game&&status.view&&status.view.phase!=='lobby';
      if(!tableOnly&&!active||tableOnly&&active)return;this.navigating=true;wx.redirectTo({url:tableOnly?'/pages/'+game+'/'+game:'/pages/'+game+'-table/'+game+'-table?resume=1',fail:()=>{this.navigating=false;if(this.alive)this.setData({error:'未能切换牌桌，请点重新进入'});}});
    },
    enterTable(){if(this.session)this.syncRoute(this.session.status());},
    clearError(){this.setData({error:''});},
    syncHand(v){
      const p=this.session&&this.session.p,scope=(this.session&&this.session.sid||v.room)+'|'+v.round+'|'+v.me,fresh=this.layoutScope!==scope;
      if(fresh){const saved=p&&p.read?p.read(game+'-layout'):null;this.columns=saved&&saved.scope===scope?Hand.reconcile(saved.columns,v.hand,v.level):Hand.automatic(v.hand,v.level);this.layoutScope=scope;}
      const before=JSON.stringify(this.columns);this.columns=Hand.reconcile(this.columns,v.hand,v.level);if(fresh||before!==JSON.stringify(this.columns))this.saveLayout();return fresh;
    },
    saveLayout(){const p=this.session&&this.session.p;if(p&&p.write&&this.layoutScope)p.write(game+'-layout',{scope:this.layoutScope,columns:this.columns});},
    render(status){
      if(!this.alive)return;
      if(status.mode&&status.game!==game){this.setData({screen:'entry',view:null,otherRoom:true,connected:false,busy:false,inGame:false});this.syncRoute(status);return;}
      const v=status.view;
      if(!status.mode){this.cancelSwipe();this.setData({screen:'entry',view:null,otherRoom:false,connected:false,busy:false,networkMessage:status.message,selected:[],handColumns:[],inGame:false});this.syncRoute(status);return;}
      if(!v){this.setData({screen:'room',otherRoom:false,connected:status.connected,busy:status.busy,networkMessage:status.message});return;}
      const updated=this.epoch!==v.epoch;this.epoch=v.epoch;const fresh=this.syncHand(v),selected=fresh?[]:this.data.selected.filter(id=>v.hand.includes(id));
      const me=v.players.findIndex(p=>p.id===v.me),my=v.players[me],inGame=v.phase!=='lobby',myTurn=v.turn===me,giving=v.phase==='tribute'&&v.tributeStage==='give',exchangeOptions=giving?(v.tributeOptions||[]):(v.returnOptions||[]);
      const tablePlays=v.tablePlays||Array.from({length:seats},(_,seat)=>v.last&&v.last.seat===seat?Object.assign({type:'play'},v.last):null);
      const players=v.players.map(p=>{const out=tablePlays[p.seat],delta=(p.seat-me+seats)%seats;return Object.assign({},p,{position:ddz&&delta===2?3:delta,me:p.id===v.me,host:p.id===v.hostId,teammate:p.team!==null&&p.team===my.team,active:p.seat===v.turn,initial:Array.from(p.name)[0],role:ddz?(v.landlord<0?'待定':p.seat===v.landlord?'地主':'农民'):'',
        placeName:p.place?(ddz?'已出完':v.result&&v.result.double&&p.place>2?'双下':['','头游','二游','三游','下游'][p.place]):'',showCount:inGame&&!p.place&&p.count>0&&p.count<=10,
        status:v.phase==='lobby'?(p.ready?'已准备':'未准备'):v.phase==='bid'?(v.bids[p.seat]!==null?(v.bids[p.seat]?'叫 '+v.bids[p.seat]+' 分':'不叫'):p.seat===v.turn?(p.bot?'思考叫分…':'轮到叫分'):'等待叫分'):p.place?(p.count?'未出完':'已出完'):p.seat===v.turn?(p.bot?'思考中…':v.phase==='tribute'?(giving?'选择进贡花色':'轮到还贡'):'轮到出牌'):p.online?'':'离线',
        outType:out?out.type:'',outCards:out&&out.type==='play'?out.cards.map(id=>C.display(id,v.level)):[],outLabel:out&&out.combo?C.describe(out.combo,v.level):'',winning:!!v.last&&v.last.seat===p.seat});});
      const gifts=v.tributes||[],received=gifts.filter(g=>g.to===me).map(g=>g.card),returned=gifts.filter(g=>g.from===me&&Number.isInteger(g.returnCard)).map(g=>g.returnCard);
      const handLayout=Hand.fit(this.columns,this.viewport),handColumns=handLayout.columns.map(column=>Object.assign({},column,{cards:column.cards.map(card=>Object.assign(C.display(card.id,v.level),{top:card.top,selected:selected.includes(card.id),eligible:v.phase!=='tribute'||!myTurn||exchangeOptions.includes(card.id),exchangeMark:received.includes(card.id)?'贡':returned.includes(card.id)?'还':''}))}));
      this.handShape=JSON.stringify([this.layoutScope,handLayout,handColumns.map(c=>c.cards.map(card=>[card.id,card.eligible])),v.phase]);if(this.swipe&&(this.swipe.shape!==this.handShape||this.data.hideHand))this.cancelSwipe();
      const options=v.phase==='tribute'?[]:C.classify(selected,v.level).filter(c=>C.beats(c,v.last&&v.last.combo)).map(c=>({key:C.key(c),label:C.describe(c,v.level),combo:c}));
      if(C.preference)options.sort((a,b)=>C.preference(a.combo,b.combo));
      const chosen=options.find(x=>x.key===(fresh?'':this.data.comboKey))||options.slice().sort((a,b)=>C.preference?C.preference(a.combo,b.combo):C.strength(a.combo)-C.strength(b.combo)||a.combo.high-b.combo.high)[0],turn=v.players[v.turn],over=v.phase==='roundOver'||v.phase==='matchOver';
      const tributeRows=gifts.map(g=>({key:g.from,from:v.players[g.from].name,to:v.players[g.to].name,card:C.display(g.card,v.level),returnCard:Number.isInteger(g.returnCard)?C.display(g.returnCard,v.level):null}));
      const antiHolders=v.antiTribute?v.antiTribute.holders.map(p=>({seat:p.seat,name:v.players[p.seat].name,cards:p.cards.map(id=>C.display(id,v.level))})):[];
      const announceAnti=!ddz&&inGame&&!over&&v.antiTribute&&this.announcedAnti!==this.layoutScope,announceTribute=!ddz&&v.phase==='tribute'&&!giving&&this.announcedTribute!==this.layoutScope;
      if(announceAnti)this.announcedAnti=this.layoutScope;if(announceTribute)this.announcedTribute=this.layoutScope;
      const remainingRows=over&&v.remainingHands?v.players.map(p=>({id:p.id,name:p.name,me:p.id===v.me,role:ddz?(p.team===0?'地主':'农民'):(v.result.double&&p.place>2?'双下':['','头游','二游','三游','下游'][p.place]),cards:v.remainingHands[p.seat].map(id=>C.display(id,v.roundLevel===undefined?v.level:v.roundLevel)),count:v.remainingHands[p.seat].length})).sort((a,b)=>Number(!a.count)-Number(!b.count)):[];
      this.setData({screen:'room',view:v,inGame,otherRoom:false,players,my,vacancies:Array.from({length:seats-players.length},(_,i)=>({seat:players.length+i+1,teammate:!ddz&&(players.length+i)%2===my.team})),host:v.me===v.hostId,myTurn,canArrange:inGame&&!over&&v.hand.length>0&&!this.data.hideHand,
        canAct:status.connected&&!status.busy,connected:status.connected,busy:status.busy,networkMessage:status.message,hostIP:status.ip,allReady:players.length===seats&&players.every(p=>p.ready&&p.online),
        canShareRoom:!!this.session&&!!this.session.invitation(this.data.localIP),selected,handColumns,handLayout,comboOptions:options,comboKey:chosen?chosen.key:'',chosenLabel:chosen?chosen.label:'',
        turnName:turn?turn.name:'',levelName:C.label(v.level),teamLevels:v.levels.map(C.label),hintText:updated?'':this.data.hintText,
        selectedMessage:selected.length?(chosen?'已选 '+selected.length+' 张 · '+chosen.label:C.classify(selected,v.level).length?'这手牌压不过桌面':'已选 '+selected.length+' 张，可手动理牌'):'点击或滑动选牌，长按牌列可选整组',
        over,resultTitle:v.result?(v.result.winner===my.team?(ddz&&my.team===0?'你赢了这副':'你们赢了这副'):'对方赢了这副'):'',finishNames:v.result&&!ddz?v.result.finish.map((seat,i)=>({key:seat,name:v.players[seat].name,place:v.result.double&&i>=2?'双下':['头游','二游','三游','下游'][i]})):[],returnName:v.returnTo>=0?v.players[v.returnTo].name:'',
        exchangeGiving:giving,exchangeOptions,tributeRows,antiHolders,remainingRows,hasRoundInfo:!ddz&&inGame&&!!(v.antiTribute||gifts.length||giving),roundInfoOpen:over||!inGame?false:!!(announceAnti||announceTribute||!fresh&&this.data.roundInfoOpen),roundInfoTitle:v.antiTribute?'本副抗贡':'本副进贡与还贡',roundInfoLead:v.antiTribute?v.players[v.antiTribute.lead].name:'',
        bottomCards:ddz?(v.bottom||[]).map(C.display):[],myRole:ddz?(my.team===null?'等待叫分':my.team===0?'地主':'农民'):'',bidChoices:ddz?[{value:0,label:'不叫'},...[1,2,3].filter(n=>n>v.bid).map(n=>({value:n,label:'叫 '+n+' 分'}))]:[],scoreRows:ddz&&v.result?v.players.map(p=>({id:p.id,name:p.name,role:p.team===0?'地主':'农民',delta:v.result.deltas[p.seat],score:p.score})):[]});this.syncRoute(status);
    },
    ready(){this.action({type:'ready',value:!this.data.my.ready});},addBot(){this.action({type:'addBot'});},fillBots(){this.action({type:'fillBots'});},
    start(){this.confirm(ddz?'开始斗地主？':'开始掼蛋？',ddz?'开局后进入横屏牌桌，三人依次叫分，地主先出牌。':'开局后自动进入横屏牌桌。对家是队友，从打 2 开始。',{type:'start'});},
    bid(e){if(ddz&&this.data.myTurn&&this.data.canAct&&this.data.view.phase==='bid')this.action({type:'bid',value:Number(e.currentTarget.dataset.value)});},
    kick(e){const p=this.data.players.find(p=>p.id===e.currentTarget.dataset.id);if(p&&!p.host)this.confirm('移出 '+p.name+'？','空出的座位可让朋友加入或添加电脑。',{type:'kick',target:p.id});},swap(e){this.action({type:'swap',target:e.currentTarget.dataset.id});},
    selectCard(e){
      if(this.ignoreTouchTap){this.ignoreTouchTap=false;return;}
      const v=this.data.view;if(!this.data.canArrange||this.data.hideHand||!v)return;const id=Number(e.currentTarget.dataset.id);if(!v.hand.includes(id))return;
      if(v.phase==='tribute'&&this.data.myTurn){if(!this.data.exchangeOptions.includes(id))return;this.setData({selected:[id],comboKey:'',hintText:''});}
      else {const selected=this.data.selected.slice(),at=selected.indexOf(id);if(at>=0)selected.splice(at,1);else selected.push(id);this.setData({selected,comboKey:'',hintText:''});}this.render(this.session.status());
    },
    startSwipe(e){
      this.cancelSwipe();this.ignoreTouchTap=false;const point=Touch.point(e);if(!point||!this.data.canArrange||this.data.hideHand||!this.visible||(e.touches||[]).length>1)return;
      const rects=Touch.rectangles(this.data.handLayout,this.data.handColumns,this.viewport),id=Touch.hit(point,rects);
      this.swipe={origin:point,last:point,rects,shape:this.handShape,moved:false,visited:new Set(),add:id===null?undefined:!this.data.selected.includes(id)};
    },
    moveSwipe(e){
      const g=this.swipe,point=Touch.point(e);if(!g||!point)return;if((e.touches||[]).length>1||!this.data.canArrange||this.data.hideHand||g.shape!==this.handShape){this.cancelSwipe();return;}
      if(!g.moved&&Math.hypot(point.x-g.origin.x,point.y-g.origin.y)<5)return;g.moved=true;this.ignoreTouchTap=true;
      const ids=Touch.trace(g.last,point,g.rects).filter(id=>!g.visited.has(id)&&this.data.view.hand.includes(id));g.last=point;if(!ids.length)return;
      ids.forEach(id=>g.visited.add(id));let selected=this.data.selected.slice();
      if(this.data.view.phase==='tribute'&&this.data.myTurn)selected=[ids[ids.length-1]];
      else {if(g.add===undefined)g.add=!selected.includes(ids[0]);selected=g.add?Array.from(new Set(selected.concat(ids))):selected.filter(id=>!ids.includes(id));}
      this.setData({selected,comboKey:'',hintText:''});this.render(this.session.status());
    },
    endSwipe(e){if(this.swipe&&Touch.point(e))this.moveSwipe(e);if(this.swipe&&this.swipe.moved)this.cancelSwipe();else this.swipe=null;},
    cancelSwipe(){if(this.swipe)this.ignoreTouchTap=true;this.swipe=null;},
    selectColumn(e){if(!this.data.canArrange||this.data.hideHand)return;const fromTouch=!!this.swipe;if(fromTouch&&this.swipe.moved)return;if(this.swipe){this.cancelSwipe();this.ignoreTouchTap=false;}const column=this.columns.find(c=>c.cards[0]===Number(e.currentTarget.dataset.id));if(!column)return;if(this.data.view.phase==='tribute'&&this.data.myTurn){this.selectCard({currentTarget:{dataset:{id:column.cards[0]}}});}else{const selected=this.data.selected.slice(),all=column.cards.every(id=>selected.includes(id));this.setData({selected:all?selected.filter(id=>!column.cards.includes(id)):Array.from(new Set(selected.concat(column.cards))),comboKey:'',hintText:''});this.render(this.session.status());}if(fromTouch)this.ignoreTouchTap=true;},
    arrange(){if(!this.data.canArrange||!this.data.selected.length)return;this.columns=Hand.combine(this.columns,this.data.selected);this.saveLayout();this.setData({selected:[],comboKey:'',hintText:'已将选中的牌组成一列。'});this.render(this.session.status());},
    autoArrange(){if(!this.data.canArrange)return;this.columns=Hand.automatic(this.data.view.hand,this.data.view.level);this.saveLayout();this.setData({selected:[],comboKey:'',hintText:'已按同点数恢复分列。'});this.render(this.session.status());},
    chooseCombo(e){this.setData({comboKey:e.currentTarget.dataset.key});this.render(this.session.status());},clear(){this.setData({selected:[],comboKey:'',hintText:''});this.render(this.session.status());},
    hint(){if(!this.data.myTurn||!this.data.canAct||this.data.hideHand)return;try{const v=this.data.view,cmd=AI.choose(v);if(cmd.type==='pass')this.setData({selected:[],comboKey:'',hintText:'建议不出，保留关键牌或让队友控牌。'});else this.setData({selected:cmd.type==='return'||cmd.type==='tribute'?[cmd.card]:cmd.cards,comboKey:cmd.combo?C.key(cmd.combo):'',hintText:cmd.type==='tribute'?'建议进贡这张花色，保留完整组合。':cmd.type==='return'?'建议还这张牌，保留完整组合。':'建议 '+C.describe(cmd.combo,v.level)});this.render(this.session.status());}catch(e){this.setData({error:e.message});}},
    play(){if(!this.data.myTurn||!this.data.canAct||this.data.hideHand)return;const option=this.data.comboOptions.find(x=>x.key===this.data.comboKey);if(this.data.view.phase==='tribute'){if(this.data.selected.length===1&&this.data.exchangeOptions.includes(this.data.selected[0]))this.action({type:this.data.exchangeGiving?'tribute':'return',card:this.data.selected[0]});}else if(option)this.action({type:'play',cards:this.data.selected.slice(),combo:option.combo});},pass(){if(this.data.myTurn&&this.data.canAct)this.action({type:'pass'});},next(){this.action({type:'next'});},
    showRoundInfo(){this.setData({roundInfoOpen:true});},closeRoundInfo(){this.setData({roundInfoOpen:false});},
    again(){this.confirm(ddz?'返回准备大厅？':'重新从 2 开始？',ddz?'保留玩家与电脑座位，再次开局会重新计算积分。':'返回竖屏准备大厅，保留玩家与电脑座位。',{type:'again'});},toggleHand(){this.setData({hideHand:!this.data.hideHand,selected:[],hintText:''});this.render(this.session.status());},
    gameRules(){wx.showModal({title:'掼蛋牌桌',content:'同点数自动分列，点击或滑动选牌，长按整组，手动理牌可合列。各家最新出牌保留到本圈结束，余牌不超过10张才报数。\n\n进贡选最大非红心级牌，同点数可选花色；还贡选不超过10的非级牌，无可还牌时还最小非红心级牌。应贡方合计两张大王抗贡，开局公开大王持有者；点“贡还”可重看本副贡还。结算公开所有余牌。\n\n红心级牌逢人配，不能代替大小王。四大天王＞六张及以上炸弹＞同花顺＞五张炸弹＞四张炸弹＞普通牌型。双上游升3级，搭档三游升2级、下游升1级，A需实打。',showCancel:false});}
  });
}
module.exports={definition};
