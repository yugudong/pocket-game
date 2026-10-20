'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const invitation=require('../miniprogram/core/invitation');
const room={ip:'192.168.1.8',sid:'a'.repeat(64),invite:'b'.repeat(64),name:'圆桌 & 朋友 🎲 %2F'};
test('room invitation round trip preserves Unicode and carries only join credentials',()=>{
  const shared=invitation.share({...room,password:'秘密口令',roles:{p1:'merlin'},secret:'设备密钥'});
  const options=Object.fromEntries(new URLSearchParams(shared.path.split('?')[1]));assert.deepEqual(invitation.parse(options),room);
  assert.equal(shared.path.split('?')[0],'/pages/avalon/avalon');assert.equal(shared.imageUrl,'/assets/avatar.png');
  assert.deepEqual(Object.keys(options).sort(),['invite','ip','join','label','sid']);assert(!JSON.stringify(shared).includes('秘密口令'));assert(!JSON.stringify(shared).includes('merlin'));assert(!JSON.stringify(shared).includes('设备密钥'));
});
test('malformed invitation is rejected, ordinary game sharing is unaffected',()=>{
  assert.equal(invitation.parse({}),null);const options=Object.fromEntries(new URLSearchParams(invitation.query(room)));
  for(const bad of [{ip:'999.1.1.1'},{sid:'oops'},{invite:''},{label:'%bad'},{label:'a'},{label:'a'.repeat(129)}])assert.throws(()=>invitation.parse({...options,...bad}),/邀请/);
});
