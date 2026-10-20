'use strict';
const C=require('./doudizhu-cards'),{cleanName}=require('./avalon');
const Observation=require('./doudizhu-observation');
function create(hostId,name,room){return {game:'doudizhu',hostId,room:cleanName(room,24),epoch:0,phase:'lobby',players:[{id:hostId,name:cleanName(name),ready:false,bot:false}],round:0,botSerial:0,scores:{},logs:[]};}
function addPlayer(s,id,name){name=cleanName(name);if(s.phase!=='lobby')throw new Error('牌局已经开始，不能加入');if(s.players.some(p=>p.id===id))return;const bot=s.players.findIndex(p=>p.bot);if(s.players.length>=3&&bot<0)throw new Error('三个座位已坐满');const p={id,name,ready:false,bot:false};if(s.players.length>=3)s.players[bot]=p;else s.players.push(p);s.epoch++;}
function removePlayer(s,id){if(s.phase!=='lobby')throw new Error('开局后不能移出玩家');if(id===s.hostId)throw new Error('不能移出房主');s.players=s.players.filter(p=>p.id!==id);s.epoch++;}
function deal(s,random){
  const deck=Array.from({length:54},(_,i)=>i);for(let i=53;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  s.round++;s.phase='bid';s.hands=Array.from({length:3},(_,i)=>C.sorted(deck.slice(i*17,i*17+17)));s.bottom=deck.slice(51);s.landlord=-1;s.bid=0;s.bidder=-1;s.bidStart=s.round===1?Math.floor(random()*3):(s.bidStart+1)%3;s.turn=s.bidStart;s.bids=[null,null,null];s.last=null;s.tablePlays=[null,null,null];s.passed=[];s.publicHistory=[];s.played=[];s.playCounts=[0,0,0];s.multiplier=1;s.result=null;s.moves=0;s.logs=[];
}
function appoint(s){s.landlord=s.bidder>=0?s.bidder:s.bidStart;if(!s.bid)s.bid=1;s.hands[s.landlord]=C.sorted(s.hands[s.landlord].concat(s.bottom));s.phase='play';s.turn=s.landlord;}
function finish(s,winner){
  const landlordWins=winner===s.landlord,spring=landlordWins?s.playCounts.every((n,i)=>i===s.landlord||n===0):s.playCounts[s.landlord]===1;
  if(spring)s.multiplier*=2;const unit=s.bid*s.multiplier,deltas=s.players.map((p,i)=>(i===s.landlord?2:-1)*(landlordWins?1:-1)*unit);
  s.players.forEach((p,i)=>{s.scores[p.id]=(s.scores[p.id]||0)+deltas[i];});s.result={winner:landlordWins?0:1,winnerSeat:winner,spring:spring?(landlordWins?'春天':'反春天'):'',bid:s.bid,multiplier:s.multiplier,deltas};s.phase='roundOver';s.turn=-1;
}
function apply(state,actor,command,random=Math.random){
  if(!command||command.epoch!==state.epoch)throw new Error('桌台已更新，请重新操作');const s=JSON.parse(JSON.stringify(state)),i=s.players.findIndex(p=>p.id===actor);if(i<0)throw new Error('你不在这桌');
  const host=()=>{if(actor!==s.hostId)throw new Error('只有房主可以操作');};
  if(s.phase==='lobby'){
    if(command.type==='ready')s.players[i].ready=!!command.value;
    else if(command.type==='addBot'||command.type==='fillBots'){host();if(s.players.length>=3)throw new Error('座位已坐满');do{const n=++s.botSerial;s.players.push({id:'bot:'+n,name:'电脑 '+n,ready:true,bot:true});}while(command.type==='fillBots'&&s.players.length<3);}
    else if(command.type==='kick'){host();removePlayer(s,command.target);}
    else if(command.type==='start'){host();if(s.players.length!==3||s.players.some(p=>!p.ready))throw new Error('三个座位都准备后才能开局');s.round=0;s.scores={};deal(s,random);}
    else throw new Error('大厅不支持这个操作');
  }else if(command.type==='again'){host();if(s.phase!=='roundOver')throw new Error('本副尚未结束');s.phase='lobby';s.players.forEach(p=>{p.ready=!!p.bot;});for(const key of ['hands','bottom','last','tablePlays','result','publicHistory','passed'])delete s[key];s.logs=[];}
  else if(command.type==='next'){host();if(s.phase!=='roundOver')throw new Error('本副尚未结束');deal(s,random);}
  else if(s.phase==='bid'){
    if(command.type!=='bid'||i!==s.turn)throw new Error('请等待轮到你叫分');const value=command.value;if(!Number.isInteger(value)||value<0||value>3||value>0&&value<=s.bid)throw new Error('请选择不叫或更高的分数');
    s.bids[i]=value;if(value){s.bid=value;s.bidder=i;}if(value===3||s.bids.every(v=>v!==null))appoint(s);else s.turn=(i+1)%3;
  }else if(s.phase==='play'){
    if(i!==s.turn)throw new Error('还没轮到你出牌');
    if(command.type==='play'){
      const ids=command.cards;if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!s.hands[i].includes(id)))throw new Error('请选择自己的手牌');
      const shapes=C.classify(ids),legal=shapes.filter(c=>C.beats(c,s.last&&s.last.combo));const chosen=command.combo?legal.find(c=>C.key(c)===C.key(command.combo)):legal[0];if(!chosen)throw new Error(shapes.length?'这手牌压不过桌面的牌':'这不是合法牌型');
      Observation.record(s,i,ids,chosen);
      s.hands[i]=s.hands[i].filter(id=>!ids.includes(id));s.played.push(...ids);s.last={seat:i,cards:ids.slice(),combo:chosen};s.tablePlays[i]={type:'play',cards:ids.slice(),combo:chosen};s.passed=[];s.playCounts[i]++;s.moves++;if(C.strength(chosen))s.multiplier*=2;
      if(!s.hands[i].length)finish(s,i);else s.turn=(i+1)%3;
    }else if(command.type==='pass'){
      if(!s.last)throw new Error('领出不能不出');Observation.record(s,i,[],null);s.tablePlays[i]={type:'pass'};s.passed.push(i);s.moves++;
      if(s.passed.length===2){s.turn=s.last.seat;s.last=null;s.tablePlays=[null,null,null];s.passed=[];}else s.turn=(i+1)%3;
    }else throw new Error('请选择出牌或不出');
  }else throw new Error('请等待房主继续');
  s.epoch=state.epoch+(command.type==='ready'?0:1);return s;
}
function view(s,id){
  const me=s.players.findIndex(p=>p.id===id);if(me<0)throw new Error('座位不存在');const landlord=s.phase==='lobby'||s.landlord===undefined?-1:s.landlord;
  return {game:'doudizhu',room:s.room,hostId:s.hostId,me:id,epoch:s.epoch,phase:s.phase,round:s.round,level:0,levels:[0,0],turn:s.turn===undefined?-1:s.turn,landlord,bid:s.bid||0,bids:s.bids||[null,null,null],multiplier:s.multiplier||1,
    players:s.players.map((p,i)=>({id:p.id,name:p.name,ready:p.ready,bot:p.bot,seat:i,team:landlord<0?null:i===landlord?0:1,count:s.hands?s.hands[i].length:0,score:s.scores[p.id]||0,place:s.result&&s.result.winnerSeat===i?1:0})),hand:s.hands?C.sorted(s.hands[me]):[],bottom:landlord<0?[]:s.bottom.slice(),last:s.last||null,tablePlays:s.tablePlays||[null,null,null],passed:(s.passed||[]).slice(),publicHistory:Observation.project(s),played:(s.played||[]).slice(),logs:[],result:s.result||null,finish:[],returnTo:-1,...(s.phase==='roundOver'&&s.hands?{remainingHands:s.hands.map(hand=>C.sorted(hand))}:{})};
}
module.exports={create,addPlayer,removePlayer,apply,view,cleanName};
