'use strict';
const SIZES = {5:[2,3,2,3,3],6:[2,3,4,3,4],7:[2,3,3,4,4],8:[3,4,4,5,5],9:[3,4,4,5,5],10:[3,4,4,5,5]};
const EVILS = {5:2,6:2,7:3,8:3,9:3,10:4};
const ROLES = {
  merlin:{name:'梅林',side:'good',hint:'你看得见除莫德雷德外的坏人。引导任务成功，也要隐藏自己。'},
  percival:{name:'派西维尔',side:'good',hint:'你看得见梅林候选；若有莫甘娜，两人无法直接区分。'},
  loyal:{name:'忠臣',side:'good',hint:'通过讨论、组队和投票推理。任务只能提交成功。'},
  assassin:{name:'刺客',side:'evil',hint:'你认识除奥伯伦外的邪恶同伴。三次任务成功后，找出并刺杀梅林。'},
  morgana:{name:'莫甘娜',side:'evil',hint:'你会被派西维尔看成梅林候选。你认识除奥伯伦外的邪恶同伴。'},
  mordred:{name:'莫德雷德',side:'evil',hint:'梅林看不见你。你认识除奥伯伦外的邪恶同伴。'},
  oberon:{name:'奥伯伦',side:'evil',hint:'你不认识其他坏人，其他坏人也不认识你；梅林能看见你。'},
  minion:{name:'爪牙',side:'evil',hint:'你认识除奥伯伦外的邪恶同伴。任务可提交成功或失败。'}
};
function check(value, message) { if (!value) throw new Error(message); }
function cleanName(value, max=16) {check(typeof value==='string','请输入名称'); const name=value.trim(); check(name.length>0 && Array.from(name).length<=max,'名称需要 1～'+max+' 个字'); return name;}
function deck(n, config) {
  check(!!SIZES[n], '需要 5～10 位玩家');
  const good=['merlin'], evil=['assassin'];
  if(config.percival)good.push('percival');
  for(const role of ['morgana','mordred','oberon'])if(config[role])evil.push(role);
  check(evil.length<=EVILS[n], '特殊坏人超过本人数的坏人名额');
  while(good.length<n-EVILS[n])good.push('loyal');
  while(evil.length<EVILS[n])evil.push('minion');
  return good.concat(evil);
}
function shuffle(values, random) {
  const a=values.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));check(j>=0&&j<=i,'随机数错误');[a[i],a[j]]=[a[j],a[i]];}return a;
}
function create(hostId, name, room) {
  return {schema:1,hostId,room:cleanName(room,24),players:[{id:hostId,name:cleanName(name),ready:false}],config:{percival:true,morgana:true,mordred:false,oberon:false},
    phase:'lobby',epoch:0,version:0,game:0,roles:{},seen:{},leader:0,quest:0,rejects:0,team:[],votes:{},cards:{},results:[],history:[],winner:'',reason:'',target:''};
}
function addPlayer(s,id,name) {
  check(s.phase==='lobby','游戏已经开始，只允许原玩家重连');check(s.players.length<10,'房间已满');check(!s.players.some(p=>p.id===id),'玩家已经在房间');
  s.players.push({id,name:cleanName(name),ready:false});s.version++;
}
function removePlayer(s,id) {check(s.phase==='lobby','游戏中保留座位，请用原设备重连');check(id!==s.hostId,'房主需要解散房间');s.players=s.players.filter(p=>p.id!==id);s.version++;}
function transition(s,phase){s.phase=phase;s.epoch++;}
function end(s,winner,reason){s.winner=winner;s.reason=reason;transition(s,'over');}
function apply(original,actor,command,random=Math.random) {
  const s=JSON.parse(JSON.stringify(original));
  check(command && command.epoch===s.epoch,'桌台已更新，请按当前页面重新操作');
  const me=s.players.find(p=>p.id===actor);check(!!me,'你不在房间中');
  const host=()=>check(actor===s.hostId,'只有房主可以操作');
  const phase=p=>check(s.phase===p,'当前阶段不能进行此操作');
  switch(command.type){
    case 'ready': phase('lobby');check(typeof command.value==='boolean','准备状态无效');me.ready=command.value;break;
    case 'config': {
      host();phase('lobby');check(['percival','morgana','mordred','oberon'].includes(command.key),'角色设置无效');check(typeof command.value==='boolean','角色设置无效');
      s.config[command.key]=command.value;s.players.forEach(p=>{p.ready=false;});s.epoch++;break;
    }
    case 'kick':host();phase('lobby');check(s.players.some(p=>p.id===command.target),'玩家已离开');removePlayer(s,command.target);break;
    case 'start': {
      host();phase('lobby');check(s.players.every(p=>p.ready),'请等待所有玩家准备');
      const roles=shuffle(deck(s.players.length,s.config),random);s.players.forEach((p,i)=>{s.roles[p.id]=roles[i];});
      s.game++;s.seen={};s.leader=Math.floor(random()*s.players.length);check(s.leader>=0&&s.leader<s.players.length,'随机数错误');
      s.quest=0;s.rejects=0;s.team=[];s.votes={};s.cards={};s.results=[];s.history=[];s.winner='';s.reason='';s.target='';transition(s,'reveal');break;
    }
    case 'seen':phase('reveal');s.seen[actor]=true;break;
    case 'begin': host();phase('reveal');check(s.players.every(p=>s.seen[p.id]),'请等待大家确认身份');transition(s,'team');break;
    case 'propose': {
      phase('team');check(actor===s.players[s.leader].id,'只有本轮队长可以组队');
      const team=command.team;check(Array.isArray(team)&&team.length===SIZES[s.players.length][s.quest],'请选择正确数量的队员');
      check(new Set(team).size===team.length&&team.every(id=>s.players.some(p=>p.id===id)),'队伍成员无效');
      s.team=team.slice();s.votes={};s.cards={};transition(s,'vote');break;
    }
    case 'vote': {
      phase('vote');check(typeof command.approve==='boolean','投票无效');check(!Object.prototype.hasOwnProperty.call(s.votes,actor),'已经投过票');s.votes[actor]=command.approve;
      if(Object.keys(s.votes).length===s.players.length){
        const approvals=Object.values(s.votes).filter(Boolean).length,passed=approvals>s.players.length/2;
        s.history.push({kind:'vote',quest:s.quest+1,attempt:s.rejects+1,leader:s.players[s.leader].id,team:s.team.slice(),votes:Object.assign({},s.votes),passed});
        if(passed){transition(s,'quest');}
        else {s.rejects++;if(s.rejects===5)end(s,'evil','连续五次组队被否决');else{s.leader=(s.leader+1)%s.players.length;s.team=[];s.votes={};transition(s,'team');}}
      }break;
    }
    case 'quest': {
      phase('quest');check(s.team.includes(actor),'只有任务队员可以提交任务牌');check(typeof command.success==='boolean','任务牌无效');
      check(!Object.prototype.hasOwnProperty.call(s.cards,actor),'任务牌已提交');check(command.success||ROLES[s.roles[actor]].side==='evil','好人只能提交成功');s.cards[actor]=command.success;
      if(Object.keys(s.cards).length===s.team.length){
        const fails=Object.values(s.cards).filter(v=>!v).length,threshold=s.players.length>=7&&s.quest===3?2:1;
        const result={quest:s.quest+1,team:s.team.slice(),fails,success:fails<threshold};s.results.push(result);s.history.push(Object.assign({kind:'quest'},result));s.cards={};
        if(s.results.filter(r=>!r.success).length===3)end(s,'evil','三次任务失败');
        else if(s.results.filter(r=>r.success).length===3)transition(s,'assassinate');
        else transition(s,'result');
      }break;
    }
    case 'next':host();phase('result');s.quest++;s.rejects=0;s.leader=(s.leader+1)%s.players.length;s.team=[];s.votes={};transition(s,'team');break;
    case 'assassinate': {
      phase('assassinate');check(s.roles[actor]==='assassin','只有刺客可以选择目标');
      check(s.players.some(p=>p.id===command.target)&&ROLES[s.roles[command.target]].side==='good','请选择一位好人');
      s.target=command.target;end(s,s.roles[command.target]==='merlin'?'evil':'good',s.roles[command.target]==='merlin'?'刺客命中梅林':'三次任务成功，梅林存活');break;
    }
    case 'again':host();phase('over');s.roles={};s.seen={};s.results=[];s.history=[];s.votes={};s.cards={};s.team=[];s.winner='';s.reason='';s.target='';s.players.forEach(p=>{p.ready=false;});transition(s,'lobby');break;
    default: throw new Error('未知操作');
  }
  s.version++;
  return s;
}
// Only this projection is sent to a player's device. Never serialize the model to the network.
function view(s,id) {
  check(s.players.some(p=>p.id===id),'玩家不在房间');
  const role=s.roles[id], definition=ROLES[role],known=[];
  if(role)for(const p of s.players){
    if(p.id===id)continue;const r=s.roles[p.id];
    if(role==='merlin'&&ROLES[r].side==='evil'&&r!=='mordred')known.push({id:p.id,label:'邪恶阵营'});
    if(role==='percival'&&(r==='merlin'||r==='morgana'))known.push({id:p.id,label:'梅林候选'});
    if(definition.side==='evil'&&role!=='oberon'&&ROLES[r].side==='evil'&&r!=='oberon')known.push({id:p.id,label:'邪恶同伴'});
  }
  const v={room:s.room,hostId:s.hostId,me:id,phase:s.phase,epoch:s.epoch,version:s.version,game:s.game,config:Object.assign({},s.config),
    players:s.players.map(p=>Object.assign({},p)),leader:s.players[s.leader]?s.players[s.leader].id:'',quest:s.quest+1,rejects:s.rejects,team:s.team.slice(),
    sizes:(SIZES[s.players.length]||[2,3,2,3,3]).slice(),results:s.results.map(r=>Object.assign({},r)),history:JSON.parse(JSON.stringify(s.history)),
    voteCount:Object.keys(s.votes).length,voted:Object.prototype.hasOwnProperty.call(s.votes,id),myVote:Object.prototype.hasOwnProperty.call(s.votes,id)?s.votes[id]:null,
    cardCount:Object.keys(s.cards).length,submitted:Object.prototype.hasOwnProperty.call(s.cards,id),confirmed:!!s.seen[id],confirmCount:Object.keys(s.seen).length,winner:s.winner,reason:s.reason,target:s.target,
    private:role?{role,name:definition.name,side:definition.side,hint:definition.hint,known}:null};
  if(s.phase==='assassinate'){v.assassin=s.players.find(p=>s.roles[p.id]==='assassin').id;if(role==='assassin')v.targets=s.players.filter(p=>ROLES[s.roles[p.id]].side==='good').map(p=>p.id);}
  if(s.phase==='over')v.revealed=s.players.map(p=>({id:p.id,role:s.roles[p.id],name:ROLES[s.roles[p.id]].name,side:ROLES[s.roles[p.id]].side}));
  return v;
}
module.exports={SIZES,EVILS,ROLES,cleanName,deck,create,addPlayer,removePlayer,apply,view};
