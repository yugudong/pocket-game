'use strict';
const {roomPage}=require('../../core/room-page');
const {roles}=require('../../core/goodcopbadcop');
const base=roomPage('goodcopbadcop');
const phaseNames={lobby:'等待入座',reveal:'确认身份',turn:'选择行动',response:'装备响应',aim:'调整枪口',choice:'装备结算',over:'本局结束'};
const sideNames={honest:'正义阵营',crooked:'腐败阵营',solo:'双面领袖'};
Page({...base,data:{...base.data,privateOpen:false,selectedAction:'',selectedTarget:'',selectedSlot:-1,revealSlot:-1,equipmentOpen:false,targetA:'',targetB:'',slotA:-1,slotB:-1,host:false,canAct:false,players:[],own:[],hand:[],known:[],targetsA:[],targetsB:[],actionTargets:[],responseNames:'',allReady:false,phaseTitle:'',turnName:'',choiceMine:false},
  render(status){if(!this.alive||!this.visible)return;const v=status.game==='goodcopbadcop'?status.view:null,canAct=status.connected&&!status.busy,changed=v&&(!this.data.view||this.data.view.epoch!==v.epoch),host=v&&v.hostId===v.you;
    if(!v){this.setData({screen:status.mode?'room':'entry',view:null,otherRoom:!!status.mode&&status.game!=='goodcopbadcop',connected:status.connected,busy:status.busy,networkMessage:status.message,canAct:false,privateOpen:false});return;}
    const name=id=>(v.players.find(p=>p.id===id)||{}).name||'',mine=v.players.find(p=>p.id===v.you),choice=v.choice,targets=v.players.filter(p=>!p.dead),own=v.own.map(c=>({...c,label:roles[c.role]})),hand=v.hand;
    const patch={view:v,screen:'room',otherRoom:false,host:!!host,connected:status.connected,busy:status.busy,networkMessage:status.message,canAct,players:v.players.map(p=>({...p,me:p.id===v.you,host:p.id===v.hostId,current:p.id===v.turn,nameInitial:Array.from(p.name)[0],gunName:name(p.gun),sideName:sideNames[p.side]||'',cards:p.cards.map(c=>({...c,label:roles[c.role]||'隐藏'}))})),own,hand,known:v.known.map(k=>({...k,label:roles[k.role]})),my:mine,sideName:sideNames[v.side],allReady:v.players.length>=4&&v.players.every(p=>p.ready&&p.online),phaseTitle:phaseNames[v.phase],turnName:name(v.turn),isTurn:v.turn===v.you&&!mine.dead,canShoot:!!mine.gun&&!v.taserLock,canArm:!mine.gun,hiddenOwn:own.filter(c=>!c.open),responseNames:v.players.filter(p=>!p.dead&&!v.passed.includes(p.id)).map(p=>p.name).join('、'),passed:v.passed.includes(v.you),pendingTitle:v.pending?({investigate:'调查',arm:'拿枪',equip:'拿装备',shoot:'射击',end:'结束回合'}[v.pending.type]):'',pendingName:v.pending?name(v.pending.target):'',choiceMine:!!choice&&choice.actor===v.you,choiceName:choice?name(choice.actor):'',choiceTargetName:choice?name(choice.target):'',choiceSlots:choice?choice.slots.map(slot=>({slot,label:'第 '+(slot+1)+' 张身份'})):[],choiceTargets:choice?choice.targets.map(id=>({id,name:name(id)})):[],aliveTargets:targets.map(p=>({id:p.id,name:p.name})),canShareRoom:!!this.session&&!!this.session.invitation(this.data.localIP)};
    patch.myGunName=name(mine.gun);
    if(changed)Object.assign(patch,{selectedAction:'',selectedTarget:'',selectedSlot:-1,revealSlot:-1,equipmentOpen:false,targetA:'',targetB:'',slotA:-1,slotB:-1,error:''});
    if(v.phase==='reveal'&&(!this.data.view||this.data.view.phase!=='reveal'))patch.privateOpen=false;
    this.setData(patch);this.updateForm();
  },
  onHide(){base.onHide.call(this);this.setData({privateOpen:false,equipmentOpen:false});},
  togglePrivate(){this.setData({privateOpen:!this.data.privateOpen});},
  ready(){this.action({type:'ready',value:!this.data.my.ready});},
  start(){this.action({type:'start'});},
  seen(){this.action({type:'seen'});this.setData({privateOpen:false});},
  kick(e){this.confirm('移出玩家','只在大厅可以移出玩家。',{type:'kick',target:e.currentTarget.dataset.id});},
  again(){this.confirm('再来一局','回到大厅，所有玩家重新准备并发身份。',{type:'again'});},
  selectAction(e){this.setData({selectedAction:e.currentTarget.dataset.action,selectedTarget:'',selectedSlot:-1,revealSlot:-1,equipmentOpen:false});this.updateForm();},
  selectTarget(e){this.setData({selectedTarget:e.currentTarget.dataset.id,selectedSlot:-1});this.updateForm();},
  selectSlot(e){this.setData({selectedSlot:Number(e.currentTarget.dataset.slot)});this.updateForm();},
  revealSlot(e){this.setData({revealSlot:Number(e.currentTarget.dataset.slot)});this.updateForm();},
  declare(){if(!this.data.actionValid)return;this.action({type:'declare',action:this.data.selectedAction,target:this.data.selectedTarget,slot:this.data.selectedSlot,reveal:this.data.revealSlot});},
  pass(){this.action({type:'pass'});},
  aim(e){this.action({type:'aim',target:e.currentTarget.dataset.id});},
  chooseSlot(e){this.action({type:'choose',slot:Number(e.currentTarget.dataset.slot)});},
  choosePlayer(e){this.action({type:'choose',target:e.currentTarget.dataset.id});},
  keep(e){this.action({type:'choose',keep:Number(e.currentTarget.dataset.index)});},
  toggleEquipment(){this.setData({equipmentOpen:!this.data.equipmentOpen,targetA:'',targetB:'',slotA:-1,slotB:-1,selectedAction:''});this.updateForm();},
  equipTarget(e){const {field,id}=e.currentTarget.dataset;if(field==='targetA'||field==='targetB')this.setData({[field]:id,[field==='targetA'?'slotA':'slotB']:-1});this.updateForm();},
  equipSlot(e){const {field,slot}=e.currentTarget.dataset;if(field==='slotA'||field==='slotB')this.setData({[field]:Number(slot)});this.updateForm();},
  useEquipment(){if(!this.data.equipmentValid)return;const d=this.data;this.action({type:'equipment',key:d.hand[0].key,target:d.targetA,other:d.targetB,slot:d.slotA,otherSlot:d.slotB});},
  updateForm(){const d=this.data,v=d.view;if(!v)return;const hidden=p=>p.cards.filter(c=>!c.open),alive=v.players.filter(p=>!p.dead),lookup=id=>v.players.find(p=>p.id===id),isAction=v.phase==='turn'&&v.turn===v.you&&d.canAct;
    let actionTargets=[],actionValid=false,actionSlots=[];const a=d.selectedAction;
    if(a==='investigate'){actionTargets=alive.filter(p=>hidden(p).length&&!p.active.some(e=>e.key==='disguise'));const t=lookup(d.selectedTarget);actionSlots=t?hidden(t):[];actionValid=isAction&&actionTargets.some(p=>p.id===d.selectedTarget)&&actionSlots.some(c=>c.slot===d.selectedSlot);}
    if(a==='arm'){actionTargets=alive.filter(p=>p.id!==v.you);actionValid=isAction&&d.canArm&&actionTargets.some(p=>p.id===d.selectedTarget);}
    if(a==='equip')actionValid=isAction;
    if((a==='arm'||a==='equip')&&d.hiddenOwn.length)actionValid=actionValid&&d.hiddenOwn.some(c=>c.slot===d.revealSlot);
    if(a==='shoot')actionValid=isAction&&d.canShoot;
    const eq=d.hand[0],form=eq&&eq.form;let targetsA=alive,targetsB=alive;
    if(form==='dead')targetsA=v.players.filter(p=>p.dead&&p.id!==v.you);
    if(form==='gun')targetsA=alive.filter(p=>p.gun&&(eq.key!=='taser'||p.id!==v.you));
    if(form==='wounded')targetsA=alive.filter(p=>p.cards.some(c=>c.wounded));
    if(eq&&eq.key==='blackmail')targetsA=alive.filter(p=>p.id!==v.you);
    if(eq&&eq.key==='evidenceBag')targetsA=alive.filter(p=>p.equipmentCount&&p.id!==v.you);
    if(eq&&['disguise','planted'].includes(eq.key))targetsA=alive.filter(p=>!p.active.some(e=>e.key===eq.key));
    if(eq&&['wiretap','serum'].includes(eq.key))targetsA=alive.filter(p=>hidden(p).length&&(eq.key!=='wiretap'||!p.active.some(e=>e.key==='disguise')));
    targetsB=targetsA.filter(p=>p.id!==d.targetA);if(eq&&eq.key==='evidenceBag')targetsB=alive.filter(p=>p.id!==d.targetA&&p.id!==v.you);
    const slots=(id,field)=>{const p=lookup(id);return p?p.cards.filter(c=>eq&&eq.key==='blackmail'||!c.open).map(c=>({slot:c.slot,field,label:'第 '+(c.slot+1)+' 张'+(c.open?' · '+roles[c.role]:' · 隐藏')})):[];};const slotsA=slots(d.targetA,'slotA'),slotsB=slots(d.targetB,'slotB');
    let valid=!!eq&&d.canAct&&!d.my.dead&&['turn','response','aim'].includes(v.phase);
    if(eq&&eq.timing==='shoot')valid=valid&&v.phase==='response'&&v.pending.type==='shoot';
    if(eq&&eq.timing==='own')valid=valid&&v.turn===v.you&&!d.my.gun&&!(v.pending&&v.pending.type==='end');
    if(eq&&eq.key==='camera')valid=valid&&!d.my.active.some(e=>e.key==='camera');
    if(form!=='none')valid=valid&&targetsA.some(p=>p.id===d.targetA);
    if(form==='twoCards'||form==='twoPlayers')valid=valid&&targetsB.some(p=>p.id===d.targetB);
    if(form==='card'||form==='twoCards')valid=valid&&slotsA.some(c=>c.slot===d.slotA);
    if(form==='twoCards')valid=valid&&slotsB.some(c=>c.slot===d.slotB);
    this.setData({actionTargets,actionSlots,actionValid,targetsA,targetsB,slotsA,slotsB,equipmentValid:valid,equipment: eq||null});
  },
  onShareAppMessage(){const r=base.onShareAppMessage.call(this);if(!r.path.includes('?'))r.title='口袋桌游 · 无间风云，和朋友面对面推理';return r;}
});
