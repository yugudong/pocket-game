'use strict';
const C=require('./guandan-cards');
const {cleanName}=require('./avalon');
const Observation=require('./guandan-observation');
function create(hostId,name,room){return {game:'guandan',hostId,room:cleanName(room,24),epoch:0,phase:'lobby',players:[{id:hostId,name:cleanName(name),ready:false,bot:false}],levels:[2,2],attempts:[0,0],level:2,round:0,botSerial:0,logs:[]};}
function addPlayer(s,id,name){name=cleanName(name);if(s.phase!=='lobby')throw new Error('牌局已经开始，不能加入');if(s.players.some(p=>p.id===id))return;
  const bot=s.players.findIndex(p=>p.bot);if(s.players.length>=4&&bot<0)throw new Error('四个座位已坐满');const p={id,name,ready:false,bot:false};if(s.players.length>=4)s.players[bot]=p;else s.players.push(p);s.epoch++;
}
function removePlayer(s,id){if(s.phase!=='lobby')throw new Error('开局后不能移出玩家');if(id===s.hostId)throw new Error('不能移出房主');s.players=s.players.filter(p=>p.id!==id);s.epoch++;}
function log(s,message){s.logs.push(message);s.logs=s.logs.slice(-12);}
function shuffle(cards,random){for(let i=cards.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}return cards;}
function seat(s,id){return s.players.findIndex(p=>p.id===id);}
function nextActive(s,from){for(let d=1;d<=4;d++){const n=(from+d)%4;if(s.hands[n].length)return n;}return -1;}
function returnCards(hand,level){let eligible=hand.filter(id=>C.card(id).rank<=10&&C.card(id).rank!==level);if(!eligible.length){const safe=hand.filter(id=>!C.wild(id,level)),min=Math.min(...safe.map(id=>C.power(C.card(id).rank,level)));eligible=safe.filter(id=>C.power(C.card(id).rank,level)===min);}return eligible;}
function tributeOptions(hand,level){const safe=hand.filter(id=>!C.wild(id,level)),highest=Math.max(...safe.map(id=>C.power(C.card(id).rank,level)));return C.sorted(safe.filter(id=>C.power(C.card(id).rank,level)===highest),level);}
function tributeCard(hand,level){return tributeOptions(hand,level).slice(-1)[0];}
function transferTributes(s){
  const previous=s.previousFinish,gifts=s.tributeTasks.map(task=>({from:task.from,card:task.card})),receivers=previous[0]%2===previous[1]%2?previous.slice(0,2):[previous[0]];
  gifts.sort((a,b)=>C.power(C.card(b.card).rank,s.level)-C.power(C.card(a.card).rank,s.level)||((a.from-previous[0]+4)%4)-((b.from-previous[0]+4)%4));
  gifts.forEach((g,i)=>{const to=receivers[i];s.hands[g.from]=s.hands[g.from].filter(id=>id!==g.card);s.hands[to]=C.sorted(s.hands[to].concat(g.card),s.level);s.tributes.push({from:g.from,to,card:g.card,returnCard:null});s.returns.push({from:to,to:g.from});const face=C.display(g.card,s.level);log(s,s.players[g.from].name+' 向 '+s.players[to].name+' 进贡 '+face.symbol+face.label);});
  s.lead=gifts[0].from;s.turn=s.returns[0].from;s.phase='tribute';s.tributeStage='return';
}
function advanceTributeChoice(s){
  for(const task of s.tributeTasks){
    if(task.card!==null)continue;const options=tributeOptions(s.hands[task.from],s.level);
    // Identical copies need no choice; distinct suits are chosen by the giver.
    if(new Set(options.map(id=>C.card(id).suit)).size===1)task.card=options[0];
    else {s.turn=task.from;s.phase='tribute';s.tributeStage='give';return;}
  }
  transferTributes(s);
}
function deal(s,random){
  const previous=s.finish?s.finish.slice():null;s.round++;s.phase='play';s.played=[];s.finish=[];s.last=null;s.tablePlays=[null,null,null,null];s.passed=[];s.returns=[];s.tributes=[];s.tributeTasks=[];s.tributeStage='';s.antiTribute=null;s.previousFinish=previous;s.dealLevel=s.level;s.result=null;s.moves=0;
  s.publicHistory=[];
  const cards=shuffle(Array.from({length:108},(_,i)=>i),random);s.hands=Array.from({length:4},(_,i)=>C.sorted(cards.slice(i*27,i*27+27),s.level));
  s.turn=s.round===1?Math.floor(random()*4):previous[0];s.lead=s.turn;
  if(!previous)return;
  const double=previous[0]%2===previous[1]%2,givers=double?previous.slice(2):[previous[3]];
  const holders=givers.map(seat=>({seat,cards:s.hands[seat].filter(id=>C.card(id).rank===16)})).filter(p=>p.cards.length);
  if(holders.reduce((n,p)=>n+p.cards.length,0)===2){s.antiTribute={holders,lead:previous[0],double};log(s,holders.map(p=>s.players[p.seat].name+' '+p.cards.length+' 张大王').join('、')+'，抗贡；头游先出。');return;}
  s.tributeTasks=givers.map(from=>({from,card:null}));advanceTributeChoice(s);
}
function endRound(s){
  const winner=s.finish[0]%2,partner=(s.finish[0]+2)%4,place=s.finish.indexOf(partner)+1,upgrade=place===2?3:place===3?2:1;
  let matchWinner=null,resetTeam=-1;
  if(s.level===14){
    if(winner===s.playingTeam&&place<=3)matchWinner=winner;
    else {s.attempts[s.playingTeam]++;if(s.attempts[s.playingTeam]>=3){s.levels[s.playingTeam]=2;s.attempts[s.playingTeam]=0;resetTeam=s.playingTeam;log(s,'三次打 A 未过，退回 2。');}}
  }
  if(matchWinner===null){if(resetTeam!==winner)s.levels[winner]=Math.min(14,s.levels[winner]+upgrade);s.level=s.levels[winner];s.playingTeam=winner;}
  s.result={winner,upgrade,place,matchWinner,finish:s.finish.slice(),double:place===2};s.phase=matchWinner===null?'roundOver':'matchOver';s.turn=-1;log(s,(winner===0?'一队':'二队')+' 获胜，'+(matchWinner===null?'升 '+upgrade+' 级，下副打 '+C.label(s.level):'成功打过 A！'));
}
function apply(state,actor,command,random=Math.random){
  if(!command||command.epoch!==state.epoch)throw new Error('桌台已更新，请重新操作');const s=JSON.parse(JSON.stringify(state)),i=seat(s,actor);if(i<0)throw new Error('你不在这桌');const host=actor===s.hostId;
  function requireHost(){if(!host)throw new Error('只有房主可以操作');}
  if(s.phase==='lobby'){
    if(command.type==='ready')s.players[i].ready=!!command.value;
    else if(command.type==='addBot'||command.type==='fillBots'){requireHost();if(s.players.length===4)throw new Error('座位已坐满');do{const serial=++s.botSerial;s.players.push({id:'bot:'+serial,name:'电脑 '+serial,bot:true,ready:true});}while(command.type==='fillBots'&&s.players.length<4);}
    else if(command.type==='kick'){requireHost();removePlayer(s,command.target);}
    else if(command.type==='swap'){requireHost();const target=seat(s,command.target);if(target<0||target===i)throw new Error('请选择其他座位');const current=(i+2)%4;if(current>=s.players.length)throw new Error('请先坐满四个座位');[s.players[current],s.players[target]]=[s.players[target],s.players[current]];s.players.forEach(p=>{p.ready=!!p.bot;});}
    else if(command.type==='start'){requireHost();if(s.players.length!==4||s.players.some(p=>!p.ready))throw new Error('四个座位都准备后才能开局');s.levels=[2,2];s.attempts=[0,0];s.level=2;s.playingTeam=0;s.round=0;s.finish=null;deal(s,random);}
    else throw new Error('大厅不支持这个操作');
  }else if(command.type==='again'){
    requireHost();if(s.phase!=='matchOver'&&s.phase!=='roundOver')throw new Error('本副尚未结束');s.phase='lobby';s.players.forEach(p=>{p.ready=!!p.bot;});for(const key of ['hands','played','last','tablePlays','finish','result','tributes','returns','tributeTasks','tributeStage','antiTribute','previousFinish','dealLevel','publicHistory'])delete s[key];s.logs=[];
  }else if(command.type==='next'){
    requireHost();if(s.phase!=='roundOver')throw new Error('本副尚未结束');deal(s,random);
  }else if(s.phase==='tribute'){
    if(s.tributeStage==='give'){
      if(command.type!=='tribute'||i!==s.turn)throw new Error('请等待轮到你进贡');const task=s.tributeTasks.find(task=>task.card===null),id=command.card;
      if(!task||task.from!==i||!tributeOptions(s.hands[i],s.level).includes(id))throw new Error('请从最大的非红心级牌中选择一张进贡');
      task.card=id;advanceTributeChoice(s);s.epoch=state.epoch+1;return s;
    }
    if(command.type!=='return'||i!==s.turn)throw new Error('请等待轮到你还贡');const task=s.returns[0],id=command.card;if(!returnCards(s.hands[i],s.level).includes(id))throw new Error('请还一张不超过 10 的非级牌；无可还牌时还最小牌');
    s.hands[i]=s.hands[i].filter(x=>x!==id);s.hands[task.to].push(id);s.hands[task.to]=C.sorted(s.hands[task.to],s.level);const gift=s.tributes.find(g=>g.to===i&&g.from===task.to);if(gift)gift.returnCard=id;const face=C.display(id,s.level);log(s,s.players[i].name+' 还给 '+s.players[task.to].name+' '+face.symbol+face.label);s.returns.shift();if(s.returns.length)s.turn=s.returns[0].from;else {s.phase='play';s.tributeStage='';s.turn=s.lead;}
  }else if(s.phase==='play'){
    if(!s.tablePlays)s.tablePlays=Array.from({length:4},(_,seat)=>s.last&&s.last.seat===seat?Object.assign({type:'play'},s.last):null);
    if(i!==s.turn)throw new Error('还没轮到你出牌');
    if(command.type==='play'){
      const ids=command.cards;if(!Array.isArray(ids)||!ids.length||ids.some(id=>!s.hands[i].includes(id))||new Set(ids).size!==ids.length)throw new Error('请选择自己的手牌');
      const shapes=C.classify(ids,s.level),legal=shapes.filter(c=>C.beats(c,s.last&&s.last.combo));
      const chosen=command.combo?legal.find(c=>C.key(c)===C.key(command.combo)):legal.sort(C.preference)[0];if(!chosen)throw new Error(shapes.length?'这手牌压不过桌面的牌':'这不是合法牌型');
      Observation.record(s,i,ids,chosen);
      s.hands[i]=s.hands[i].filter(id=>!ids.includes(id));s.played.push(...ids);s.last={seat:i,cards:ids.slice(),combo:chosen};if(!s.tablePlays)s.tablePlays=[null,null,null,null];s.tablePlays[i]={type:'play',cards:ids.slice(),combo:chosen};s.passed=[];s.moves++;log(s,s.players[i].name+'：'+C.describe(chosen,s.level));
      if(!s.hands[i].length){s.finish.push(i);log(s,s.players[i].name+' 出完，第 '+s.finish.length+' 位。');}
      if(s.finish.length>=3||(s.finish.length===2&&s.finish[0]%2===s.finish[1]%2)){
        // A double finish ends immediately; the remaining two are both 下游.
        for(let n=0;n<4;n++)if(!s.finish.includes(n))s.finish.push(n);endRound(s);
      }else s.turn=nextActive(s,i);
    }else if(command.type==='pass'){
      if(!s.last)throw new Error('领出不能过牌');Observation.record(s,i,[],null);if(!s.tablePlays)s.tablePlays=[null,null,null,null];s.tablePlays[i]={type:'pass'};s.passed.push(i);s.moves++;log(s,s.players[i].name+'：过');
      const challengers=[0,1,2,3].filter(n=>s.hands[n].length&&n!==s.last.seat);
      if(challengers.every(n=>s.passed.includes(n))){const owner=s.last.seat,partner=(owner+2)%4;s.turn=s.hands[owner].length?owner:s.hands[partner].length?partner:nextActive(s,owner);s.last=null;s.tablePlays=[null,null,null,null];s.passed=[];log(s,s.players[s.turn].name+' '+(s.hands[owner].length?'重新领出':'接风领出'));}
      else s.turn=nextActive(s,i);
    }else throw new Error('请选择出牌或过牌');
  }else throw new Error('请等待房主继续');
  s.epoch=state.epoch+(command.type==='ready'?0:1);return s;
}
function view(s,id){
  const me=seat(s,id);if(me<0)throw new Error('座位不存在');const v={game:'guandan',room:s.room,hostId:s.hostId,me:id,epoch:s.epoch,phase:s.phase,level:s.level,levels:s.levels.slice(),round:s.round,turn:s.turn===undefined?-1:s.turn,logs:s.logs.slice(),result:s.result||null,
    players:s.players.map((p,i)=>({id:p.id,name:p.name,ready:p.ready,bot:p.bot,seat:i,team:i%2,count:s.hands?s.hands[i].length:0,place:s.finish?s.finish.indexOf(i)+1:0})),hand:s.hands?C.sorted(s.hands[me],s.level):[],last:s.last||null,tablePlays:s.tablePlays||Array.from({length:4},(_,seat)=>s.last&&s.last.seat===seat?Object.assign({type:'play'},s.last):null),played:s.played?s.played.slice():[],finish:s.finish?s.finish.slice():[],tributes:s.tributes||[],antiTribute:s.antiTribute||null,tributeStage:s.phase==='tribute'?(s.tributeStage||'return'):'',pendingTributes:s.phase==='tribute'&&s.tributeStage==='give'?(s.tributeTasks||[]).map(task=>({from:task.from,card:task.card})):[],returnTo:s.phase==='tribute'&&s.tributeStage!=='give'&&s.returns&&s.returns.length?s.returns[0].to:-1,roundLevel:s.dealLevel===undefined?s.level:s.dealLevel};
  v.passed=(s.passed||[]).slice();
  v.publicHistory=Observation.project(s);
  if(s.phase==='tribute'&&s.turn===me){if(s.tributeStage==='give')v.tributeOptions=tributeOptions(v.hand,s.level);else v.returnOptions=returnCards(v.hand,s.level);}
  if((s.phase==='roundOver'||s.phase==='matchOver')&&s.hands)v.remainingHands=s.hands.map(hand=>C.sorted(hand,v.roundLevel));return v;
}
module.exports={create,addPlayer,removePlayer,apply,view,cleanName,returnCards,tributeCard,tributeOptions};
