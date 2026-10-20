'use strict';
// Add another game here, then implement its page and rules module.
const games = [{id:'avalon', name:'阿瓦隆', english:'AVALON', category:'身份推理', players:'5–10 人', duration:'约 30 分钟', description:'圆桌之上，谁值得信任？', route:'/pages/avalon/avalon', available:true},{id:'guandan',name:'掼蛋',english:'GUANDAN',category:'搭档竞技',players:'1–4 位真人',duration:'四人桌 · 可加电脑',description:'和对家默契配合，一路打到 A。',route:'/pages/guandan/guandan',available:true}];
games.push({id:'doudizhu',name:'斗地主',english:'DOU DIZHU',category:'三人竞技',players:'1–3 位真人',duration:'三人桌 · 可加电脑',description:'叫分抢地主，和朋友斗一手好牌。',route:'/pages/doudizhu/doudizhu',available:true});
games.push({id:'goodcopbadcop',name:'无间风云',english:'GOOD COP BAD COP',category:'身份推理',players:'4–8 人',duration:'约 30 分钟',description:'三张身份，一次调查，谁是自己人？',route:'/pages/goodcopbadcop/goodcopbadcop',available:true});
module.exports = {games};
