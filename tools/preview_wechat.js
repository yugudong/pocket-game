'use strict';
const path=require('node:path'),fs=require('node:fs');
const automator=require('./runtime/node_modules/miniprogram-automator');
(async()=>{
  const mini=await automator.connect({wsEndpoint:'ws://127.0.0.1:9421'});
  const output=path.resolve(__dirname,'../dist/validation');fs.mkdirSync(output,{recursive:true});
  let page=await mini.reLaunch('/pages/home/home');await page.waitFor(1500);await mini.screenshot({path:path.join(output,'home.png')});
  console.log('Home:',await page.data());
  await (await page.$('.game-card')).tap();page=await mini.currentPage();await page.waitFor(1000);await mini.screenshot({path:path.join(output,'avalon-entry.png')});
  console.log('Avalon initialization:',{screen:await page.data('screen'),error:await page.data('error'),loading:await page.data('loading')});
  await page.callMethod('input',{currentTarget:{dataset:{key:'nickname'}},detail:{value:'房主'}});
  await page.callMethod('input',{currentTarget:{dataset:{key:'password'}},detail:{value:'1234'}});
  await page.callMethod('enter');await page.waitFor(1200);await mini.screenshot({path:path.join(output,'avalon-lobby.png')});
  console.log('Created lobby:',{screen:await page.data('screen'),error:await page.data('error'),connected:await page.data('connected'),players:(await page.data('players')||[]).length});
  await mini.evaluate(()=>getApp().session.leave());
  await mini.reLaunch('/pages/home/home');await mini.disconnect();
})().catch(e=>{console.error(e.message);process.exitCode=1;});
