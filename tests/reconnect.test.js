'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Session}=require('../miniprogram/core/session');
test('failed restored join closes its socket and a second retry creates a fresh socket',async()=>{
  let now=0,tick,created=0,closed=0;
  const values=new Map([['identity',{id:'a'.repeat(64),secret:'b'.repeat(64)}],['resume',{schema:1,mode:'client',sid:'c'.repeat(64),ip:'192.168.1.2',name:'玩家',password:'1234'}]]);
  const p={read:key=>values.get(key),write:(key,v)=>values.set(key,v),randomToken:()=> 'd'.repeat(64),now:()=>now,every:fn=>{tick=fn;return 1;},cancel:()=>{},socket:()=>{created++;return{onMessage:()=>{},onError:()=>{},bind:async()=>5555,send:()=>{},close:()=>{closed++;}};}};
  const s=new Session(p);const attempt=s.resume();await Promise.resolve();await Promise.resolve();now=13000;tick();await assert.rejects(attempt,/超时/);assert.equal(s.socket,null);assert.equal(s.mode,'client');assert.equal(closed,1);
  const retry=s.resume();await Promise.resolve();await Promise.resolve();assert.equal(created,2);s.suspend();await assert.rejects(retry,/取消/);assert.equal(closed,2);
});
