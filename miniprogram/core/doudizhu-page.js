'use strict';
const cards=require('./doudizhu-cards');
function definition(tableOnly=false){
  const page=require('./guandan-page').definition(tableOnly,{game:'doudizhu',cards,ai:require('./doudizhu-ai'),hand:require('./guandan-hand').create(cards)});
  page.gameRules=function(){wx.showModal({title:'斗地主玩法',content:'三人一副54张牌，各17张，地主拿3张公开底牌。依次叫1/2/3分，必须高于前面；叫3分立即确定地主。都不叫时首叫玩家以1分当地主。\n\n顺子至少5张，连对至少3对，飞机至少2组三张；连续牌型不含2和大小王，A不能作1。支持三带一、三带二、飞机带单/对、四带二/两对。单翅膀可带对子，不能带双王或四张，不能与机身同点；四带二单牌可同点，但不能带双王。\n\n王炸＞四张炸弹＞普通牌型。炸弹、王炸各翻倍；春天/反春天再翻倍。地主积分为叫分×倍数×2，农民各为叫分×倍数，赢家加、输家减。下一副保留累计积分。\n\n滑动选牌，长按整组；选中后手动理牌合列，固定6张高度，余牌≤10张才显示数量。',showCancel:false});};
  return page;
}
module.exports={definition};
