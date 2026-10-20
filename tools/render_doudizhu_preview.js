'use strict';
// Static layout fixtures; these do not simulate native WeChat execution.
const fs=require('node:fs'),path=require('node:path'),{render}=require('./render_mini_preview');
const G=require('../miniprogram/core/doudizhu'),C=require('../miniprogram/core/doudizhu-cards'),H=require('../miniprogram/core/guandan-hand').create(C),Touch=require('../miniprogram/core/guandan-touch');
const out=path.resolve(__dirname,'../dist/validation'),def=require('../miniprogram/core/doudizhu-page').definition(true);
const page={...def,data:JSON.parse(JSON.stringify(def.data)),alive:true,setData(patch){Object.assign(this.data,patch);},session:{invitation:()=>null}};
let s=G.create('p','你','周末斗地主');for(const cmd of [{type:'fillBots'},{type:'ready',value:true}])s=G.apply(s,'p',{...cmd,epoch:s.epoch});
const status=view=>({game:'doudizhu',mode:'host',view:{...view,players:view.players.map(p=>({...p,online:true}))},connected:true,message:''});
page.render(status(G.view(s,'p')));page.setData({loading:false});fs.writeFileSync(path.join(out,'doudizhu-lobby-preview.html'),render('doudizhu',page.data));
s=G.apply(s,'p',{type:'start',epoch:s.epoch},()=>.27);s.turn=0;
const bid=G.view(s,'p');s=G.apply(s,'p',{type:'bid',value:3,epoch:s.epoch});
const play=G.view(s,'p');play.turn=0;play.last={seat:1,cards:[8],combo:C.classify([8])[0]};play.tablePlays=[null,{type:'play',cards:[8],combo:play.last.combo},{type:'pass'}];
const large=[...Array.from({length:4},(_,r)=>Array.from({length:3},(_,s)=>(r+3-2)*4+s)).flat(),...Array.from({length:4},(_,r)=>[(r+9-2)*4,(r+9-2)*4+1]).flat()];
const stress={...play,tablePlays:Array.from({length:3},()=>({type:'play',cards:large,combo:C.classify(large).find(c=>c.kind==='planePair')})),players:play.players.map(p=>({...p,count:10})),last:{seat:2,cards:large,combo:C.classify(large).find(c=>c.kind==='planePair')}};
const result={...play,turn:-1,phase:'roundOver',result:{winner:0,winnerSeat:0,spring:'春天',bid:3,multiplier:8,deltas:[48,-24,-24]},players:play.players.map((p,i)=>({...p,score:i===0?48:-24}))};
for(const [width,height] of [[844,390],[667,375],[568,320]]){
  page.viewport={width,height};
  const scenes=[['doudizhu-bid',bid],['doudizhu-play',play],['doudizhu-stress',stress],['doudizhu-manual',stress],['doudizhu-result',result]];if(width===844)scenes.push(['doudizhu-safe-play',play],['doudizhu-safe-stress',stress]);
  for(const [name,view] of scenes){
    const safe=name.includes('-safe-');page.viewport=safe?{width,height,left:52,right:44,bottom:21}:{width,height};
    page.columns=name==='doudizhu-manual'?[{cards:view.hand,manual:true}]:H.automatic(view.hand);page.layoutScope='fixture|'+view.round+'|'+view.me;page.setData({selected:[],hintText:''});page.render(status(view));
    const hitRects=Touch.rectangles(page.data.handLayout,page.data.handColumns,page.viewport);
    let html=render('doudizhu-table',page.data).replace('</body>','<script>window.cardHitRects='+JSON.stringify(hitRects)+'</script></body>');if(safe)for(const [side,inset] of [['left',52],['right',44],['bottom',21]])html=html.replace(new RegExp('env\\(safe-area-inset-'+side+'\\)','g'),inset+'px');
    fs.writeFileSync(path.join(out,name+'-'+width+'-preview.html'),html);
  }
}
console.log('Saved Dou Dizhu static previews');
