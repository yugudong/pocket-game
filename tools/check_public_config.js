'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
function containsAppId(text){return /\bwx[0-9a-f]{16}\b/i.test(text);}
function checkPublicConfig(root){
  const result=spawnSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error('A Git checkout is required to check public configuration');
  const violations=[];
  for(const name of result.stdout.split('\0').filter(Boolean)){
    const file=path.join(root,name);if(!fs.existsSync(file))continue;
    if(name==='miniprogram/project.config.json'||name.endsWith('/project.private.config.json'))violations.push(name+' (local configuration is tracked)');
    const bytes=fs.readFileSync(file);if(bytes.includes(0))continue;
    if(containsAppId(bytes.toString('utf8')))violations.push(name+' (application identifier found)');
  }
  if(violations.length)throw new Error('Public configuration check failed:\n'+violations.join('\n'));
  return true;
}
if(require.main===module){try{checkPublicConfig(path.resolve(__dirname,'..'));console.log('PASS: tracked files contain no real WeChat AppID or local developer configuration');}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={containsAppId,checkPublicConfig};
