'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');let scripts=0,json=0;
function check(file){
  if(file.endsWith('.json')){JSON.parse(fs.readFileSync(file,'utf8'));json++;}
  if(file.endsWith('.js')){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw new Error('Syntax check failed: '+file);scripts++;}
}
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','runtime'].includes(entry.name)||entry.name==='project.private.config.json')continue;const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else check(file);}}
for(const dir of ['miniprogram','tests','tools'])walk(path.join(root,dir));check(path.join(root,'package.json'));
console.log('PASS: '+scripts+' JavaScript files and '+json+' JSON files');
