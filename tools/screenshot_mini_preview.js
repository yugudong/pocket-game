'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const WebSocket=require('./runtime/node_modules/ws');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist','validation'),profile=path.join(out,'edge-preview-profile-'+process.pid);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
  const active=path.join(profile,'DevToolsActivePort');if(fs.existsSync(active))fs.unlinkSync(active);
  const child=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--edge-skip-compat-layer-relaunch','--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});let ws;
  try{
    for(let n=0;!fs.existsSync(active);n++){if(n>100)throw new Error('Headless browser failed');await sleep(100);}
    const port=fs.readFileSync(active,'utf8').split('\n')[0],targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});let serial=0;const pending=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}});const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});await call('Page.enable');
    const buttonPositions=new Map();
    const spyFixtures=['entry','waiting','identity','action','response','hidden-choice','choice','result','stress'].flatMap(name=>[["goodcopbadcop-"+name,390,name==='stress'?2800:1900],["goodcopbadcop-"+name,320,name==='stress'?3300:2200]]);
    const defaultFixtures=[['home',390,2100],['guandan-lobby',390,1100],['doudizhu-lobby',390,1250],...['guandan-play','guandan-four-plays','guandan-manual','guandan-dense','doudizhu-bid','doudizhu-play','doudizhu-stress','doudizhu-manual','doudizhu-result'].flatMap(name=>[[name,844,390],[name,667,375],[name,568,320]]),['doudizhu-safe-play',844,390],['doudizhu-safe-stress',844,390]];
    const detailFixtures=['guandan-give','guandan-exchange','guandan-exchange-done','guandan-anti','guandan-result','doudizhu-endcards'].flatMap(name=>[[name,844,390],[name,667,375],[name,568,320]]);
    const details=process.argv[2]==='cards';
    for(const [name,width,height] of details?detailFixtures:process.argv[2]==='goodcopbadcop'?spyFixtures:defaultFixtures){
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await call('Page.navigate',{url:pathToFileURL(path.join(out,name+(name==='home'||name.endsWith('-lobby')?'':'-'+width)+'-preview.html')).href});await sleep(350);
      const measurements=await call('Runtime.evaluate',{expression:'JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,cards:[...document.querySelectorAll(".playing-card")].map(c=>({x:c.getBoundingClientRect().x,right:c.getBoundingClientRect().right})),center:document.querySelector(".table-center")?.getBoundingClientRect().toJSON(),self:document.querySelector(".position-0")?.getBoundingClientRect().toJSON()})',returnByValue:true}),m=JSON.parse(measurements.result.value);
      if(m.scroll>width||name==='guandan-lobby'&&m.cards.some(c=>c.x<0||c.right>width)||m.center&&m.self&&m.center.bottom>m.self.top)throw new Error('Static layout overflow/overlap: '+name+' '+width);
      if(name==='guandan-four-plays'||name==='doudizhu-stress'||name==='doudizhu-safe-stress'){
        const selectors=name!=='guandan-four-plays'?[".out-0",".out-1",".out-3",".hand-controls",".own-hand",".bottom-panel",".seat-0",".seat-1",".seat-3"]:[".out-0",".out-1",".out-2",".out-3",".hand-controls",".own-hand"]; const measured=await call('Runtime.evaluate',{expression:'JSON.stringify(Object.fromEntries('+JSON.stringify(selectors)+'.map(s=>[s,document.querySelector(s).getBoundingClientRect().toJSON()])))',returnByValue:true}),rects=JSON.parse(measured.result.value);
        const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
        const boxes=Object.entries(rects);for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)if(overlaps(boxes[i][1],boxes[j][1]))throw new Error('Overlapping table areas: '+width+' '+boxes[i][0]+' '+boxes[j][0]+' '+JSON.stringify(rects));
      }
      if(!details&&(name.startsWith('guandan-')||name.startsWith('doudizhu-'))&&!name.endsWith('-lobby')&&name!=='doudizhu-result'){
        const measured=await call('Runtime.evaluate',{expression:'JSON.stringify({hitRects:window.cardHitRects,area:document.querySelector(".hand-area").getBoundingClientRect().toJSON(),buttonTop:document.querySelector(".hand-controls").getBoundingClientRect().top,cards:[...document.querySelectorAll(".playing-card")].map(c=>c.getBoundingClientRect().toJSON()),bottoms:[...document.querySelectorAll(".column-stack")].map(c=>c.getBoundingClientRect().bottom),scrolls:!!document.querySelector(".hand-scroll"),marker:document.body.innerText.includes("已理")})',returnByValue:true}),hand=JSON.parse(measured.result.value);
        if(hand.scrolls||hand.marker||hand.cards.some(c=>c.left<hand.area.left-0.5||c.right>hand.area.right+0.5||c.top<hand.area.top-0.5||c.bottom>hand.area.bottom+0.5)||Math.max(...hand.bottoms)-Math.min(...hand.bottoms)>0.5)throw new Error('Hand must fit without scrolling and align at bottom: '+name+' '+width+' '+JSON.stringify(hand));
        const buttonKey=width+':'+hand.area.bottom;
        if(Math.abs(hand.area.height-128)>0.5||buttonPositions.has(buttonKey)&&Math.abs(buttonPositions.get(buttonKey)-hand.buttonTop)>0.5)throw new Error('Hand height and button position must stay fixed: '+name+' '+width);
        if(hand.hitRects.length!==hand.cards.length||hand.cards.some((card,i)=>['left','right','top','bottom'].some(side=>Math.abs(card[side]-hand.hitRects[i][side])>0.5)))throw new Error('Swipe hit rectangles must match rendered cards: '+name+' '+width);
        const action=await call('Runtime.evaluate',{expression:'JSON.stringify({area:document.querySelector(".hand-controls").getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll(".hand-controls button")].map(b=>b.getBoundingClientRect().toJSON())})',returnByValue:true}),controls=JSON.parse(action.result.value);
        if(controls.buttons.some(b=>b.left<controls.area.left-0.5||b.right>controls.area.right+0.5||b.top<controls.area.top-0.5||b.bottom>controls.area.bottom+0.5))throw new Error('Action buttons must fit their area: '+name+' '+width+' '+JSON.stringify(controls));
        buttonPositions.set(buttonKey,hand.buttonTop);
      }
      if(details){
        const measured=await call('Runtime.evaluate',{expression:'JSON.stringify({panel:(document.querySelector(".round-result")||document.querySelector(".round-info-panel"))?.getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll(".result-buttons button")].map(e=>e.getBoundingClientRect().toJSON()),rows:document.querySelectorAll(".remaining-row").length,cards:[...document.querySelectorAll(".remaining-card")].map(e=>e.getBoundingClientRect().toJSON()),body:document.querySelector(".result-body")?.getBoundingClientRect().toJSON()})',returnByValue:true}),d=JSON.parse(measured.result.value);
        if(d.panel&&(d.panel.left<0||d.panel.right>width||d.panel.top<0||d.panel.bottom>height||d.buttons.some(b=>b.top<d.panel.top||b.bottom>d.panel.bottom)))throw new Error('Details panel/footer overflow '+name+' '+width+' '+JSON.stringify(d));
        if(name==='guandan-result'&&d.rows!==4||name==='doudizhu-endcards'&&d.rows!==3)throw new Error('Missing player remaining cards');
        if(d.body&&d.cards.some(c=>c.left<d.body.left||c.right>d.body.right))throw new Error('Remaining cards overflow horizontally');
      }
      console.log('PASS static layout:',name,width);
      const result=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'-'+width+'.png'),Buffer.from(result.data,'base64'));
    }
  }finally{if(ws)ws.close();if(child.pid&&child.exitCode===null){if(process.platform==='win32')require('node:child_process').spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill();}}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
