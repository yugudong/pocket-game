'use strict';
// Base fourth edition. Text is a concise Chinese description of each effect.
const equipment={
  blackmail:{name:'勒索',text:'交换另外两名存活玩家各一张身份牌；公开状态、领袖伤势跟随牌移动。',form:'twoCards'},
  coffee:{name:'咖啡',text:'当前玩家结束回合后，由你接着行动，然后按你的座位继续。',form:'none'},
  defibrillator:{name:'除颤器',text:'让一名已出局的普通玩家重新入局，身份仍公开。',form:'dead'},
  disguise:{name:'伪装',text:'放在一名存活玩家面前；本局不能再调查该玩家。',form:'player',active:true},
  evidenceBag:{name:'证物袋',text:'将一名玩家手中的装备交给另一名玩家；接收者不能是你，超限先弃一张。',form:'twoPlayers'},
  k9:{name:'警犬',text:'让一名持枪玩家放下枪。',form:'gun'},
  medkit:{name:'医疗包',text:'移除一名受伤领袖的受伤标记。',form:'wounded'},
  detector:{name:'金属探测器',text:'依次调查每名持枪玩家的一张隐藏身份牌。',form:'none'},
  planted:{name:'栽赃证据',text:'放在一名玩家面前；其普通正义与腐败身份互换含义，领袖身份不变。',form:'player',active:true},
  polygraph:{name:'测谎仪',text:'调查目标全部隐藏身份牌，再由目标调查你全部隐藏身份牌。',form:'player'},
  restraining:{name:'禁制令',text:'射击响应时使用；射手必须改瞄另一名玩家，再继续射击。',form:'none',timing:'shoot'},
  shield:{name:'防暴盾',text:'射击响应时使用；被射击者选择左右相邻的存活玩家之一代为中弹。',form:'none',timing:'shoot'},
  smoke:{name:'烟雾弹',text:'反转后续回合的行进方向。',form:'none',active:true},
  camera:{name:'监控摄像头',text:'放在自己面前；别人调查你的身份后，你可立即调查对方一张隐藏身份牌。',form:'none',active:true},
  taser:{name:'电击枪',text:'仅自己的回合使用；空手时夺取别人的枪，立即瞄准，本回合不能射击。',form:'gun',timing:'own'},
  serum:{name:'吐真剂',text:'翻开任意存活玩家的一张隐藏身份牌，永久公开。',form:'card'},
  radio:{name:'对讲机',text:'从你左边开始顺时针，让所有持枪玩家瞄准指定玩家；包括目标自己的枪。',form:'player'},
  wiretap:{name:'窃听器',text:'分别调查两名不同存活玩家的一张隐藏身份牌，可包括自己。',form:'twoCards'}
};
const deck=Object.keys(equipment).concat('defibrillator');
module.exports={equipment,deck};
