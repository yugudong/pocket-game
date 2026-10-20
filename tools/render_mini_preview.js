'use strict';
// Local layout aid: converts this project's simple WXML to static HTML. This does
// not emulate the WeChat runtime; the official compiler and native tests are separate.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),mini=path.join(root,'miniprogram'),out=path.join(root,'dist','validation');
const escape=value=>String(value===undefined||value===null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function evaluate(expression,data){const context=new Proxy(data,{has:()=>true,get:(o,k)=>typeof k==='symbol'?undefined:o[k]});return Function('data','with(data){return ('+expression+');}')(context);}
function binding(value,data){return value.replace(/{{([\s\S]*?)}}/g,(_,expr)=>escape(evaluate(expr,data)));}
function parse(source){const tree={tag:'root',attrs:{},children:[]},stack=[tree];let i=0;while(i<source.length){if(source[i]!=='<'){let end=source.indexOf('<',i);if(end<0)end=source.length;stack[stack.length-1].children.push({text:source.slice(i,end)});i=end;continue;}let end=i+1,quote='';for(;end<source.length;end++){const ch=source[end];if(quote){if(ch===quote)quote='';}else if(ch==='"'||ch==="'")quote=ch;else if(ch==='>')break;}const raw=source.slice(i+1,end);i=end+1;if(raw.startsWith('/')){stack.pop();continue;}const tag=raw.match(/^([\w-]+)/)[1],attrs={};const rx=/([\w:-]+)(?:="([^"]*)")?/g;rx.lastIndex=tag.length;let match;while((match=rx.exec(raw)))attrs[match[1]]=match[2]===undefined?'':match[2];const node={tag,attrs,children:[]};stack[stack.length-1].children.push(node);if(!raw.endsWith('/'))stack.push(node);}return tree;}
function condition(raw,data){return raw===undefined?true:!!evaluate(raw.replace(/^{{|}}$/g,''),data);}
function children(nodes,data){let result='',satisfied=false;for(const n of nodes){if(n.text!==undefined){result+=binding(n.text,data);continue;}if(n.attrs['wx:for']!==undefined){const list=evaluate(n.attrs['wx:for'].replace(/^{{|}}$/g,''),data)||[];list.forEach((item,index)=>{const copy={...n,attrs:{...n.attrs}};delete copy.attrs['wx:for'];const scope={...data,[n.attrs['wx:for-item']||'item']:item,[n.attrs['wx:for-index']||'index']:index};result+=children([copy],scope);});continue;}if(n.attrs['wx:if']!==undefined){satisfied=condition(n.attrs['wx:if'],data);if(!satisfied)continue;}else if(n.attrs['wx:elif']!==undefined){if(satisfied)continue;satisfied=condition(n.attrs['wx:elif'],data);if(!satisfied)continue;}else if(n.attrs['wx:else']!==undefined){if(satisfied)continue;satisfied=true;}else satisfied=false;
  const tag={view:'div',block:'div',text:'span',image:'img','scroll-view':'div',input:'input',button:'button'}[n.tag]||n.tag;let attributes='';if(n.tag==='block')attributes+=' style="display:contents"';for(const [k,v] of Object.entries(n.attrs)){if(k.startsWith('wx:')||k.startsWith('bind')||k.startsWith('catch')||k.startsWith('data-')||['open-type','loading'].includes(k))continue;if(k==='disabled'){if(condition(v,data))attributes+=' disabled';continue;}if(k==='password'){attributes+=' type="password"';continue;}if(k==='src'&&v.startsWith('/assets/')){attributes+=' src="data:image/png;base64,'+fs.readFileSync(path.join(mini,v.slice(1))).toString('base64')+'"';continue;}attributes+=' '+k+'="'+binding(v,data)+'"';}result+='<'+tag+attributes+'>'+children(n.children,data)+(tag==='input'||tag==='img'?'':'</'+tag+'>');}return result;}
function stylesheet(file){return fs.readFileSync(file,'utf8').replace(/@import\s+"([^";]+)";/g,(_,relative)=>stylesheet(path.resolve(path.dirname(file),relative)));}
function render(name,data){if(name==='guandan'&&data.inGame)name='guandan-table';const source=fs.readFileSync(path.join(mini,'pages',name,name+'.wxml'),'utf8'),css=stylesheet(path.join(mini,'app.wxss'))+'\n'+stylesheet(path.join(mini,'pages',name,name+'.wxss'));return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css.replace(/(^|\s)page\s*{/g,'$1body {').replace(/\bview\b/g,'div').replace(/\btext\b(?=[:\s,{])/g,'span').replace(/([\d.]+)rpx/g,(_,n)=>(Number(n)*100/750)+'vw')+'body{margin:0}button,input{font-family:inherit}button{border:0;cursor:pointer}img{object-fit:cover}</style></head><body>'+children(parse(source).children,data)+'</body></html>';}
global.Page=value=>{global.definition=value;};global.wx={};require(path.join(mini,'pages','guandan','guandan.js'));const def=global.definition,page={...def,data:JSON.parse(JSON.stringify(def.data)),alive:true,setData(values){Object.assign(this.data,values);},session:{invitation:()=>null}};
const G=require(path.join(mini,'core','guandan')),AI=require(path.join(mini,'core','guandan-ai'));let s=G.create('p','你','周末掼蛋桌');for(const cmd of [{type:'fillBots'},{type:'ready',value:true}])s=G.apply(s,'p',{...cmd,epoch:s.epoch});page.render({game:'guandan',mode:'host',view:{...G.view(s,'p'),players:G.view(s,'p').players.map(p=>({...p,online:true}))},connected:true,message:''});page.setData({loading:false});fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'guandan-lobby-preview.html'),render('guandan',page.data));s=G.apply(s,'p',{type:'start',epoch:s.epoch},()=>.27);while(s.turn!==0){const actor=s.players[s.turn].id;s=G.apply(s,actor,{...AI.choose(G.view(s,actor)),epoch:s.epoch});}page.render({game:'guandan',mode:'host',view:{...G.view(s,'p'),players:G.view(s,'p').players.map(p=>({...p,online:true}))},connected:true,message:''});fs.writeFileSync(path.join(out,'guandan-play-preview.html'),render('guandan',page.data));require(path.join(mini,'pages','home','home.js'));fs.writeFileSync(path.join(out,'home-preview.html'),render('home',global.definition.data));console.log('Saved static WXML layout previews in '+out);
// Stress fixtures for layout only: four large public plays, then a long manual column.
const Cards=require(path.join(mini,'core','guandan-cards'));
const fixture=G.view(s,'p'),large=[4,5,6,7,58,59,60,61,1,55];
fixture.tablePlays=Array.from({length:4},()=>({type:'play',cards:large,combo:Cards.classify(large,2).find(c=>c.kind==='bomb')}));
fixture.last={seat:3,...fixture.tablePlays[3]};
fixture.players=fixture.players.map(p=>({...p,count:10,online:true}));
page.render({game:'guandan',mode:'host',view:fixture,connected:true,message:''});
page.setData({selected:[fixture.hand[0]],hintText:'已选牌，可出牌或手动理牌'});
fs.writeFileSync(path.join(out,'guandan-four-plays-preview.html'),render('guandan',page.data));
page.columns=[{cards:Cards.sorted(fixture.hand,fixture.level),manual:true}];
page.render({game:'guandan',mode:'host',view:fixture,connected:true,message:''});
fs.writeFileSync(path.join(out,'guandan-manual-preview.html'),render('guandan',page.data));
// Render each size with the same sizing logic used by native onResize.
const Hands=require(path.join(mini,'core','guandan-hand')),Touch=require(path.join(mini,'core','guandan-touch'));
for(const [width,height] of [[844,390],[667,375],[568,320]]){
  page.viewport={width,height};
  for(const name of ['guandan-play','guandan-four-plays','guandan-manual','guandan-dense']){
    const view=name==='guandan-play'?{...G.view(s,'p'),players:G.view(s,'p').players.map(p=>({...p,online:true}))}:fixture;
    page.columns=name==='guandan-manual'?[{cards:Cards.sorted(view.hand,view.level),manual:true}]:Hands.automatic(view.hand,view.level);
    if(name==='guandan-dense'){
      const ids=Cards.sorted(view.hand,view.level);
      page.columns=ids.slice(0,12).reduce((a,id,i)=>{if(i%2===0)a.push({cards:[id,ids[i+1]],manual:true});return a;},[]).concat(ids.slice(12).map(id=>({cards:[id],manual:false})));
    }
    page.setData({selected:[],hintText:''});
    page.render({game:'guandan',mode:'host',view,connected:true,message:''});
    if(name==='guandan-four-plays')page.setData({hintText:'已选牌，可出牌或手动理牌'});
    const hitRects=Touch.rectangles(page.data.handLayout,page.data.handColumns,{width,height});
    const html=render('guandan',page.data).replace('</body>','<script>window.cardHitRects='+JSON.stringify(hitRects)+'</script></body>');
    fs.writeFileSync(path.join(out,name+'-'+width+'-preview.html'),html);
  }
}

module.exports={render};
