'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {setup}=require('../tools/setup_wechat'),{containsAppId}=require('../tools/check_public_config');
function fixture(t){const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'pocket-config-'));fs.mkdirSync(path.join(root,'miniprogram'));fs.copyFileSync(path.join(__dirname,'../miniprogram/project.config.example.json'),path.join(root,'miniprogram/project.config.example.json'));t.after(()=>{assert.equal(path.dirname(fs.realpathSync(root)),parent);assert(path.basename(root).startsWith('pocket-config-'));fs.rmSync(root,{recursive:true,force:true});});return root;}
test('community setup uses a public template and never overwrites existing developer settings',t=>{
  const root=fixture(t),file=path.join(root,'miniprogram/project.config.json');assert.deepEqual(setup(root),{created:true,updated:false});assert.equal(JSON.parse(fs.readFileSync(file)).appid,'touristappid');const local={appid:'wx'+'1'.repeat(16),setting:{personalSetting:true}};fs.writeFileSync(file,JSON.stringify(local));const before=fs.readFileSync(file);assert.deepEqual(setup(root),{created:false,updated:false});assert.deepEqual(fs.readFileSync(file),before);
});
test('explicit local configuration changes only the identifier and retains other developer settings',t=>{
  const root=fixture(t);setup(root);const file=path.join(root,'miniprogram/project.config.json'),before=JSON.parse(fs.readFileSync(file));before.setting.personalSetting=true;fs.writeFileSync(file,JSON.stringify(before));const appId='wx'+'2'.repeat(16);assert.deepEqual(setup(root,appId),{created:false,updated:true});assert.deepEqual(JSON.parse(fs.readFileSync(file)),{...before,appid:appId});
});
test('invalid identifiers fail before creating local files or disclosing the input',t=>{
  const root=fixture(t),value='invalid-private-input';assert.throws(()=>setup(root,value),error=>!error.message.includes(value));assert(!fs.existsSync(path.join(root,'miniprogram/project.config.json')));
});
test('public identifier check rejects actual IDs while allowing neutral templates',()=>{assert(containsAppId('wx'+'a'.repeat(16)));assert(containsAppId('WX'+'1'.repeat(16)));assert(!containsAppId('touristappid'));assert(!containsAppId('project.config.example.json'));});
