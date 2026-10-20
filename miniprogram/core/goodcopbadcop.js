'use strict';
const {equipment,deck:equipmentDeck}=require('./goodcopbadcop-equipment');
const roles={honest:'正义警察',crooked:'腐败警察',agent:'探长',kingpin:'主谋'};
const check=(v,m)=>{if(!v)throw new Error(m);};
function cleanName(v,max=16){check(typeof v==='string'&&v.trim()&&Array.from(v.trim()).length<=max,'名称需要 1～'+max+' 个字');return v.trim();}
function shuffle(values,random){const a=values.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));check(j>=0&&j<=i,'随机数错误');[a[i],a[j]]=[a[j],a[i]];}return a;}
function create(hostId,name,room){return {schema:1,hostId,room:cleanName(room,24),players:[{id:hostId,name:cleanName(name),ready:false}],phase:'lobby',epoch:0,version:0,round:0,turn:0,direction:1,cards:{},hands:{},active:{},dead:{},guns:{},wounds:{},known:{},seen:{},history:[],deck:[],discard:[],pending:null,flow:null,winner:'',reason:'',coffee:'',taserLock:''};}
function addPlayer(s,id,name){check(s.phase==='lobby','已经开局，只允许原玩家重连');check(s.players.length<8,'房间已满');check(!s.players.some(p=>p.id===id),'已经在房间');s.players.push({id,name:cleanName(name),ready:false});s.version++;}
function removePlayer(s,id){check(s.phase==='lobby','开局后保留座位');check(id!==s.hostId,'房主需要解散房间');s.players=s.players.filter(p=>p.id!==id);s.version++;}
const player=(s,id)=>s.players.find(p=>p.id===id);
const alive=(s,id)=>!!player(s,id)&&!s.dead[id];
const has=(s,id,key)=>(s.active[id]||[]).includes(key);
const hidden=(s,id)=>(s.cards[id]||[]).map((c,i)=>!c.open?i:-1).filter(i=>i>=0);
function side(s,id){const cards=s.cards[id]||[];if(cards.some(c=>c.role==='agent')&&cards.some(c=>c.role==='kingpin'))return 'solo';if(cards.some(c=>c.role==='agent'))return 'honest';if(cards.some(c=>c.role==='kingpin'))return 'crooked';const h=cards.filter(c=>c.role==='honest').length;return (has(s,id,'planted')?h<2:h>=2)?'honest':'crooked';}
function log(s,text){s.history.push(text);if(s.history.length>40)s.history.shift();}
function end(s,winner,reason){s.phase='over';s.winner=winner;s.reason=reason;s.pending=null;s.flow=null;}
function solo(s){for(const p of s.players)if(alive(s,p.id)&&side(s,p.id)==='solo'){end(s,p.id,p.name+'同时持有探长与主谋，独自获胜');return true;}return false;}
function living(s){return s.players.filter(p=>alive(s,p.id)).map(p=>p.id);}
function next(s,id,direction=s.direction){let i=s.players.findIndex(p=>p.id===id);do{i=(i+direction+s.players.length)%s.players.length;}while(s.dead[s.players[i].id]);return s.players[i].id;}
function draw(s,id,random){if(!s.deck.length){s.deck=shuffle(s.discard,random);s.discard=[];}check(s.deck.length,'装备牌暂时用完');s.hands[id].push(s.deck.shift());}
function respond(s,pending){s.phase='response';s.pending=pending;s.passed=[];}
function finishAction(s){s.pending=null;if(s.guns[s.players[s.turn].id])s.phase='aim';else respond(s,{type:'end'});}
function finishTurn(s){const id=s.coffee&&alive(s,s.coffee)?s.coffee:next(s,s.players[s.turn].id);s.coffee='';s.turn=s.players.findIndex(p=>p.id===id);s.taserLock='';s.pending=null;s.phase='turn';log(s,'轮到'+player(s,id).name);}
function card(s,id,slot){check(alive(s,id),'请选择存活玩家');check(Number.isInteger(slot)&&slot>=0&&slot<3,'请选择身份牌位置');return s.cards[id][slot];}
function revealForAction(s,id,slot){if(hidden(s,id).length){const c=card(s,id,slot);check(!c.open,'请选择自己未公开的身份牌');c.open=true;}}
function inspect(s,actor,target,slot,flow){const c=card(s,target,slot);check(!c.open,'这张身份已公开');check(!has(s,target,'disguise'),'目标有伪装，不能调查');s.known[actor][c.id]=c.role;const pair=actor+':'+target+':'+slot;if(has(s,target,'camera')&&!flow.visited.includes(pair)){flow.visited.push(pair);const slots=hidden(s,actor);if(slots.length&&!has(s,actor,'disguise'))flow.jobs.unshift({kind:'inspect',actor:target,target:actor,slots,label:'监控反查：选择对方一张隐藏身份'});}}
function jobs(s){const f=s.flow;while(f.jobs.length){const j=f.jobs[0];if(j.kind==='all'){f.jobs.shift();if(alive(s,j.target)&&!has(s,j.target,'disguise'))for(const slot of hidden(s,j.target).reverse())f.jobs.unshift({kind:'fixed',actor:j.actor,target:j.target,slot});continue;}if(j.kind==='fixed'){f.jobs.shift();if(alive(s,j.target)&&!s.cards[j.target][j.slot].open&&!has(s,j.target,'disguise'))inspect(s,j.actor,j.target,j.slot,f);continue;}if(j.kind==='inspect'){j.slots=hidden(s,j.target);if(!alive(s,j.target)||has(s,j.target,'disguise')||!j.slots.length){f.jobs.shift();continue;}}s.phase='choice';return;}s.phase=f.returnPhase;s.flow=null;if(s.phase==='response')s.passed=[];if(f.finish)finishAction(s);else if(s.phase==='aim'&&!s.guns[s.players[s.turn].id])respond(s,{type:'end'});}
function startFlow(s,returnPhase,queue,finish=false){s.flow={returnPhase,jobs:queue,visited:[],finish};jobs(s);}
function resolve(s,random){const p=s.pending,actor=s.players[s.turn].id;check(p,'没有待结算行动');if(p.type==='end'){finishTurn(s);return;}
  try{
    if(p.type==='investigate'){card(s,p.target,p.slot);check(!s.cards[p.target][p.slot].open&&!has(s,p.target,'disguise'),'调查目标已改变，请重新选择');startFlow(s,'turn',[{kind:'fixed',actor,target:p.target,slot:p.slot}],true);return;}
    if(p.type==='arm'){check(!s.guns[actor],'已经持枪');check(Object.keys(s.guns).length<8,'没有空闲枪');check(alive(s,p.target)&&p.target!==actor,'瞄准目标已改变');revealForAction(s,actor,p.reveal);s.guns[actor]=p.target;}
    if(p.type==='equip'){revealForAction(s,actor,p.reveal);draw(s,actor,random);if(s.hands[actor].length>1){startFlow(s,'turn',[{kind:'discard',actor,label:'装备上限一张，选择保留的装备'}],true);return;}}
    if(p.type==='shoot'){check(s.guns[actor]&&s.taserLock!==actor,'枪已被移走或本回合不能射击，请重新选择行动');const target=p.target;check(alive(s,target),'射击目标已改变');delete s.guns[actor];s.cards[target].forEach(c=>{c.open=true;});const leader=s.cards[target].find(c=>c.role==='agent'||c.role==='kingpin');if(leader){if(s.wounds[leader.role]){end(s,leader.role==='agent'?'crooked':'honest',(leader.role==='agent'?'探长':'主谋')+'第二次中弹');return;}s.wounds[leader.role]=true;log(s,player(s,target).name+'的'+roles[leader.role]+'受伤');draw(s,target,random);if(s.hands[target].length>1){startFlow(s,'turn',[{kind:'discard',actor:target,label:'领袖受伤获得装备，选择保留一张'}],true);return;}}else{s.dead[target]=true;delete s.guns[target];s.discard.push(...s.hands[target]);s.hands[target]=[];log(s,player(s,target).name+'出局');}}
    finishAction(s);
  }catch(e){s.pending=null;s.phase='turn';log(s,'行动因装备效果失效，请当前玩家重选');}
}
function use(s,actor,c,random){const hand=s.hands[actor],key=c.key,def=equipment[key];check(def&&hand.includes(key),'你没有这张装备');check(['turn','response','aim'].includes(s.phase),'请先完成当前装备结算');const shooter=s.players[s.turn].id,pending=s.pending;check(def.timing!=='own'||actor===shooter&&!(pending&&pending.type==='end'),'这张装备只能在自己回合使用');check(def.timing!=='shoot'||s.phase==='response'&&pending.type==='shoot','这张装备只能响应射击');const prior=s.phase;let queue=[];
  const target=()=>{check(alive(s,c.target),'请选择存活玩家');return c.target;};
  switch(key){
    case 'blackmail':{check(c.target!==actor&&c.other!==actor&&c.target!==c.other,'选择另外两名不同玩家');const a=card(s,c.target,c.slot),b=card(s,c.other,c.otherSlot);[s.cards[c.target][c.slot],s.cards[c.other][c.otherSlot]]=[b,a];for(const known of Object.values(s.known)){delete known[a.id];delete known[b.id];}break;}
    case 'coffee':s.coffee=actor;break;
    case 'defibrillator':check(player(s,c.target)&&s.dead[c.target]&&c.target!==actor,'请选择已出局玩家');delete s.dead[c.target];break;
    case 'disguise':case 'planted':{const t=target();check(!has(s,t,key),'该装备已经生效');s.active[t].push(key);break;}
    case 'camera':check(!has(s,actor,key),'该装备已经生效');s.active[actor].push(key);break;
    case 'smoke':s.direction*=-1;s.tableActive.push(key);break;
    case 'evidenceBag':{const t=target();check(alive(s,c.other)&&c.other!==actor&&c.other!==t,'接收者需是另一名玩家，且不能是你');check(s.hands[t].length,'目标没有手持装备');const item=s.hands[t][0];s.hands[t].shift();s.hands[c.other].push(item);if(s.hands[c.other].length>1)queue.push({kind:'discard',actor:c.other,label:'收到装备，选择保留一张'});break;}
    case 'k9':{const t=target();check(s.guns[t],'目标没有枪');delete s.guns[t];break;}
    case 'medkit':{const t=target(),leader=s.cards[t].find(v=>s.wounds[v.role]);check(leader,'目标没有受伤领袖');delete s.wounds[leader.role];break;}
    case 'detector':for(const id of living(s))if(s.guns[id])queue.push({kind:'inspect',actor,target:id,label:'金属探测：选择一张隐藏身份'});break;
    case 'polygraph':{const t=target();queue=[{kind:'all',actor,target:t},{kind:'all',actor:t,target:actor}];break;}
    case 'restraining':queue=[{kind:'redirect',actor:shooter,targets:living(s).filter(id=>id!==shooter&&id!==pending.target),label:'禁制令：选择新的射击目标',mode:'restraining'}];check(queue[0].targets.length,'没有合法改瞄目标');break;
    case 'shield':{const t=pending.target;queue=[{kind:'redirect',actor:t,targets:Array.from(new Set([next(s,t,1),next(s,t,-1)])),label:'防暴盾：选择左右邻座代为中弹',mode:'shield'}];break;}
    case 'taser':{const t=target();check(t!==actor&&s.guns[t]&&!s.guns[actor],'你需空手，对方需持枪');delete s.guns[t];s.guns[actor]=t;s.taserLock=actor;queue=[{kind:'redirect',actor,targets:living(s).filter(id=>id!==actor),label:'夺枪后立即选择瞄准目标',mode:'taser'}];break;}
    case 'serum':{const v=card(s,target(),c.slot);check(!v.open,'请选择隐藏身份牌');v.open=true;break;}
    case 'radio':{const t=target();for(const id of living(s))if(s.guns[id])s.guns[id]=t;if(pending&&pending.type==='shoot')pending.target=t;break;}
    case 'wiretap':{check(c.target!==c.other,'请选择两名不同玩家');for(const [t,slot] of [[c.target,c.slot],[c.other,c.otherSlot]]){const v=card(s,t,slot);check(!v.open&&!has(s,t,'disguise'),'请选择可调查的隐藏身份');queue.push({kind:'fixed',actor,target:t,slot});}break;}
  }
  // The played equipment is removed before resolving hand-limit choices.
  const index=s.hands[actor].indexOf(key);check(index>=0,'不能用证物袋转移正在使用的装备');s.hands[actor].splice(index,1);if(!def.active)s.discard.push(key);log(s,player(s,actor).name+'使用了'+def.name);if(solo(s))return;startFlow(s,prior,queue);
}
function apply(original,actor,c,random=Math.random){const s=JSON.parse(JSON.stringify(original));let completed=false;check(c&&c.epoch===s.epoch,'桌台已更新，请重新操作');const me=player(s,actor);check(me,'你不在房间');const host=()=>check(actor===s.hostId,'只有房主可以操作');const phase=p=>check(s.phase===p,'当前阶段不能这样操作');
  switch(c.type){
    case 'ready':phase('lobby');check(typeof c.value==='boolean','准备状态无效');me.ready=c.value;break;
    case 'kick':host();phase('lobby');check(player(s,c.target),'玩家已离开');removePlayer(s,c.target);break;
    case 'start':{host();phase('lobby');check(s.players.length>=4&&s.players.length<=8,'需要 4～8 位真人');check(s.players.every(p=>p.ready),'请等待大家准备');const n=s.players.length,count=Math.ceil((n*3-2)/2),ordinary=shuffle(Array(count).fill('honest').concat(Array(count).fill('crooked')),random),first=shuffle(['agent','kingpin'].concat(ordinary.splice(0,n-2)),random);s.cards={};s.hands={};s.active={};s.dead={};s.guns={};s.wounds={};s.known={};s.seen={};s.deck=shuffle(equipmentDeck,random);s.discard=[];s.tableActive=[];s.history=[];s.winner='';s.reason='';s.direction=1;s.coffee='';s.taserLock='';s.pending=null;s.flow=null;s.round++;s.players.forEach((p,i)=>{s.cards[p.id]=shuffle([first[i],ordinary.shift(),ordinary.shift()],random).map((role,j)=>({id:i*3+j,role,open:false}));s.hands[p.id]=[];s.active[p.id]=[];s.known[p.id]={};draw(s,p.id,random);});s.turn=Math.floor(random()*n);check(s.turn>=0&&s.turn<n,'随机数错误');s.phase='reveal';break;}
    case 'seen':phase('reveal');s.seen[actor]=true;if(s.players.every(p=>s.seen[p.id])){s.phase='turn';solo(s);}break;
    case 'declare':{phase('turn');check(alive(s,actor)&&actor===s.players[s.turn].id,'请等你的回合');check(['investigate','arm','equip','shoot'].includes(c.action),'行动无效');const p={type:c.action,target:c.target,slot:c.slot,reveal:c.reveal};if(p.type==='investigate'){const v=card(s,p.target,p.slot);check(!v.open&&!has(s,p.target,'disguise'),'请选择可以调查的隐藏身份');}if(p.type==='arm'){check(!s.guns[actor]&&Object.keys(s.guns).length<8,'你已经持枪');check(alive(s,p.target)&&p.target!==actor,'请选择其他存活玩家');}if(['arm','equip'].includes(p.type)&&hidden(s,actor).length)check(hidden(s,actor).includes(p.reveal),'请选择自己要公开的一张身份牌');if(p.type==='shoot'){check(s.guns[actor]&&s.taserLock!==actor,'你没有可射击的枪');p.target=s.guns[actor];check(alive(s,p.target),'请先选择合法瞄准目标');}log(s,me.name+'宣布'+({investigate:'调查',arm:'拿枪',equip:'拿装备',shoot:'射击'}[p.type])+(p.target?' → '+player(s,p.target).name:''));respond(s,p);break;}
    case 'pass':phase('response');check(alive(s,actor),'出局玩家不能响应');check(!s.passed.includes(actor),'已经确认');s.passed.push(actor);if(living(s).every(id=>s.passed.includes(id))){resolve(s,random);completed=true;}break;
    case 'aim':phase('aim');check(actor===s.players[s.turn].id&&s.guns[actor],'只有当前持枪玩家可以瞄准');check(alive(s,c.target)&&c.target!==actor,'请选择其他存活玩家');s.guns[actor]=c.target;log(s,me.name+'瞄准'+player(s,c.target).name);respond(s,{type:'end'});break;
    case 'equipment':check(alive(s,actor),'出局玩家不能使用装备');use(s,actor,c,random);break;
    case 'choose':{phase('choice');const f=s.flow,j=f.jobs[0];check(actor===j.actor,'请等待指定玩家选择');if(j.kind==='discard'){check(Number.isInteger(c.keep)&&c.keep>=0&&c.keep<s.hands[actor].length,'请选择保留装备');const keep=s.hands[actor][c.keep];s.discard.push(...s.hands[actor].filter((v,i)=>i!==c.keep));s.hands[actor]=[keep];f.jobs.shift();}else if(j.kind==='inspect'){check(j.slots.includes(c.slot),'请选择隐藏身份');f.jobs.shift();inspect(s,actor,j.target,c.slot,f);}else if(j.kind==='redirect'){check(j.targets.includes(c.target)&&alive(s,c.target),'请选择合法目标');if(j.mode==='taser')s.guns[actor]=c.target;else {s.pending.target=c.target;if(j.mode==='restraining')s.guns[actor]=c.target;}f.jobs.shift();}jobs(s);break;}
    case 'again':host();phase('over');{const reset=create(s.hostId,player(s,s.hostId).name,s.room);Object.assign(s,reset,{players:s.players.map(p=>({...p,ready:false})),round:s.round,epoch:s.epoch});}break;
    default:throw new Error('未知操作');
  }
  if(completed||!['ready','seen','pass'].includes(c.type)||s.phase!==original.phase)s.epoch++;s.version++;return s;
}
function view(s,id){check(player(s,id),'你不在房间');const over=s.phase==='over';const players=s.players.map((p,i)=>({...p,seat:i,dead:!!s.dead[p.id],seen:!!s.seen[p.id],gun:s.guns[p.id]||'',active:(s.active[p.id]||[]).map(key=>({key,...equipment[key]})),equipmentCount:(s.hands[p.id]||[]).length,side:over?side(s,p.id):'',cards:(s.cards[p.id]||[]).map((c,slot)=>({slot,open:c.open,role:c.open||over?c.role:'',wounded:!!s.wounds[c.role]}))}));const j=s.flow&&s.flow.jobs[0],choice=j?{kind:j.kind,actor:j.actor,target:j.target||'',slots:j.slots||[],targets:j.targets||[],label:j.label}:null;return {room:s.room,hostId:s.hostId,me:id,you:id,phase:s.phase,epoch:s.epoch,round:s.round,turn:s.players[s.turn].id,direction:s.direction,players,seen:!!s.seen[id],own:(s.cards[id]||[]).map((c,slot)=>({slot,role:c.role,open:c.open,wounded:!!s.wounds[c.role]})),side:s.cards[id]?side(s,id):'',hand:(s.hands[id]||[]).map((key,index)=>({index,key,...equipment[key]})),known:players.flatMap(p=>(s.cards[p.id]||[]).map((c,slot)=>({player:p.id,name:p.name,slot,role:s.known[id]&&s.known[id][c.id]||''}))).filter(v=>v.role),pending:s.pending?{...s.pending}:null,passed:(s.passed||[]).slice(),choice,winner:s.winner,reason:s.reason,history:s.history.slice(-8),taserLock:s.taserLock===id};}
module.exports={create,cleanName,addPlayer,removePlayer,apply,view,side,roles};
