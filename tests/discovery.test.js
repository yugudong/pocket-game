'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Discovery}=require('../miniprogram/core/discovery'),{PORT,encode,decode}=require('../miniprogram/core/wire');
test('discovery validates origin/nonce and expires rooms; cancelled binding never starts a timer',async()=>{
  let now=0,onMessage,closed=0,timers=0,sent,bindResolve;
  const p={now:()=>now,randomToken:()=> 'a'.repeat(64),every:()=>{timers++;return 1;},cancel:()=>{timers--;},socket:()=>({onMessage:fn=>{onMessage=fn;},onError:()=>{},bind:()=>Promise.resolve(5555),send:(ip,port,bytes,broadcast)=>{sent={ip,port,p:decode(bytes),broadcast};},close:()=>{closed++;}})};
  const d=new Discovery(p);await d.start();assert.equal(sent.ip,'255.255.255.255');assert.equal(sent.port,PORT);assert.equal(sent.broadcast,true);assert.deepEqual(Object.keys(sent.p).sort(),['nonce','p','t']);
  const packet={t:'room',nonce:'a'.repeat(64),sid:'b'.repeat(64),name:'房间',count:5,playing:false,game:'avalon'};
  onMessage(encode({...packet,nonce:'c'.repeat(64)}),'192.168.1.2',PORT);onMessage(encode(packet),'192.168.1.2',1234);assert.equal(d.list().length,0);
  onMessage(encode(packet),'192.168.1.2',PORT);assert.equal(d.list()[0].ip,'192.168.1.2');now=5001;d.tick();assert.equal(d.list().length,0);d.close();assert.equal(timers,0);assert.equal(closed,1);
  p.socket=()=>({onMessage:()=>{},onError:()=>{},bind:()=>new Promise(resolve=>{bindResolve=resolve;}),send:()=>{},close:()=>{closed++;}});
  const starting=d.start();d.close();bindResolve(5556);await starting;assert.equal(timers,0);assert.equal(d.socket,null);assert.equal(closed,2);
});
test('Guandan discovery excludes Avalon and rejects more than four seats',async()=>{
  let receive;const p={now:()=>0,randomToken:()=> 'a'.repeat(64),every:()=>1,cancel:()=>{},socket:()=>({onMessage:fn=>{receive=fn;},onError:()=>{},bind:async()=>1234,send:()=>{},close:()=>{}})};const d=new Discovery(p,'guandan');await d.start();const packet={t:'room',nonce:d.nonce,sid:'b'.repeat(64),name:'掼蛋桌',count:4,playing:false,game:'avalon'};receive(encode(packet),'192.168.1.2',PORT);assert.equal(d.list().length,0);receive(encode({...packet,game:'guandan',count:5}),'192.168.1.2',PORT);assert.equal(d.list().length,0);receive(encode({...packet,game:'guandan'}),'192.168.1.2',PORT);assert.equal(d.list().length,1);d.close();
});
