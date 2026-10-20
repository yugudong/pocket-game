'use strict';
const fs=require('node:fs'),path=require('node:path');
function setup(root,appId){
  if(appId&&!/^wx[0-9a-f]{16}$/i.test(appId))throw new Error('WECHAT_APPID must be a valid WeChat application identifier');
  const target=path.join(root,'miniprogram','project.config.json');
  if(fs.existsSync(target)&&!appId)return {created:false,updated:false};
  const exists=fs.existsSync(target),source=exists?target:path.join(root,'miniprogram','project.config.example.json'),config=JSON.parse(fs.readFileSync(source,'utf8'));
  if(appId)config.appid=appId;
  fs.writeFileSync(target,JSON.stringify(config,null,2)+'\n');
  return {created:!exists,updated:exists};
}
if(require.main===module){
  try{const result=setup(path.resolve(__dirname,'..'),process.env.WECHAT_APPID);console.log(result.created||result.updated?'Local WeChat configuration prepared (ignored by Git; identifier omitted).':'Existing local WeChat configuration preserved.');}
  catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={setup};
