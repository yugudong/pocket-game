'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),dgram=require('node:dgram'),crypto=require('node:crypto');
const {Session}=require('../miniprogram/core/session'),rules=require('../miniprogram/core/avalon');
const {PORT,encode,decode}=require('../miniprogram/core/wire');
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function waitFor(predicate,message,timeout=10000){const start=Date.now();while(!predicate()){if(Date.now()-start>timeout)throw new Error('Timed out: '+message);await sleep(25);}}
function nativePlatform(storage=new Map(),loss=false){let sends=0;const stats={sent:0,dropped:0,duplicates:0};
  return {stats,storage,read:key=>storage.get(key),write:(key,value)=>{if(value===null)storage.delete(key);else storage.set(key,JSON.parse(JSON.stringify(value)));},
    now:()=>Date.now(),every:(fn,ms)=>setInterval(fn,ms),cancel:clearInterval,randomToken:()=>crypto.randomBytes(32).toString('hex'),random:()=>crypto.randomInt(0,0x100000000)/0x100000000,
    socket:()=>{const socket=dgram.createSocket('udp4');let closed=false;return {
      onMessage:fn=>socket.on('message',(buffer,r)=>fn(new Uint8Array(buffer),r.address,r.port)),onError:fn=>socket.on('error',fn),
      bind:port=>new Promise((resolve,reject)=>{socket.once('error',reject);socket.bind(port||0,'0.0.0.0',()=>{socket.removeListener('error',reject);resolve(socket.address().port);});}),
      send:(ip,port,bytes,broadcast=false)=>{
        stats.sent++;sends++;if(loss&&sends%7===0){stats.dropped++;return;}if(broadcast)socket.setBroadcast(true);
        const send=()=>{if(!closed)socket.send(Buffer.from(bytes),port,ip,()=>{});};
        setTimeout(send,loss?sends%13:0);if(loss&&sends%9===0){stats.duplicates++;setTimeout(send,17);}
      },close:()=>{closed=true;try{socket.close();}catch(e){/* already closed */}}
    };}
  };
}

// Full history adds fragmented snapshots and a second host recovery. At 1/7
// packet loss, each action may require multiple 1.5-second snapshot retries.
test('real UDP: Guandan invitation, bot replacement, hidden hands, round completion and saved game recovery',{timeout:300000},async()=>{
  const G=require('../miniprogram/core/guandan'),AI=require('../miniprogram/core/guandan-ai');
  function seeded(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
  const hp=nativePlatform(new Map(),true),gp=nativePlatform(new Map(),true);hp.random=seeded(42);let host=new Session(hp),guest=new Session(gp),wrong=new Session(nativePlatform());
  try{
    await host.create('房主','人机掼蛋桌','1234','guandan');await host.act({type:'fillBots'});host.botAt=Infinity;
    const room=host.invitation('127.0.0.1');assert.equal(room.game,'guandan');await assert.rejects(wrong.join(room.ip,'错入口','1234',room.sid),/另一款游戏/);
    await guest.join(room.ip,'真人好友','',room.sid,room.invite,'guandan');assert.equal(host.model.players.length,4);assert.equal(host.model.players[1].id,guest.identity.id);assert.equal(host.model.players.filter(p=>p.bot).length,2);
    await waitFor(()=>guest.current.players.length===4,'guandan lobby');await Promise.all([host.act({type:'ready',value:true}),guest.act({type:'ready',value:true})]);await waitFor(()=>host.model.players.every(p=>p.ready),'guandan ready');
    await host.act({type:'start'});host.botAt=Infinity;await waitFor(()=>guest.current.phase==='play','guandan deal');assert.equal(guest.current.hand.length,27);assert.equal(guest.current.hands,undefined);assert.equal(guest.current.inviteToken,undefined);assert.deepEqual(guest.current.hand,G.view(host.model,guest.identity.id).hand);
    const sid=host.sid,epoch=host.model.epoch,originalHand=guest.current.hand.slice();host.suspend();host=new Session(hp);await host.resume();host.botAt=Infinity;assert.equal(host.game,'guandan');assert.equal(host.sid,sid);assert.equal(host.model.epoch,epoch);
    guest.suspend();guest=new Session(gp);await guest.resume();assert.equal(guest.game,'guandan');assert.deepEqual(guest.current.hand,originalHand);
    let steps=0;while(host.model.phase==='play'){
      assert(++steps<700);const actor=host.model.players[host.model.turn],v=host.projection(actor.id),cmd=AI.choose(v);
      if(actor.id===guest.identity.id){await waitFor(()=>guest.current.epoch===host.model.epoch,'fresh turn');await guest.act(cmd);}
      else host.process(actor.id,{...cmd,epoch:host.model.epoch});host.botAt=Infinity;
      await waitFor(()=>guest.current.epoch===host.model.epoch,'private snapshot');
      assert.deepEqual(guest.current.publicHistory,host.projection(guest.identity.id).publicHistory);
      if(steps===8){const history=JSON.parse(JSON.stringify(host.model.publicHistory));host.suspend();host=new Session(hp);await host.resume();host.botAt=Infinity;assert.deepEqual(host.model.publicHistory,history);await waitFor(()=>guest.current.epoch===host.model.epoch&&guest.current.publicHistory.length===history.length,'mid-round history recovery');}
    }
    assert.equal(host.model.phase,'roundOver');assert.equal(guest.current.phase,'roundOver');assert.equal(new Set(host.model.hands.flat().concat(host.model.played)).size,108);
    assert.deepEqual(guest.current.remainingHands,G.view(host.model,guest.identity.id).remainingHands);
    let chosen;for(let seed=1;seed<500;seed++){const preview=G.apply(host.model,host.identity.id,{type:'next',epoch:host.model.epoch},seeded(seed));if(preview.tributeStage==='give'){chosen=seed;break;}}assert(chosen);hp.random=seeded(chosen);
    await host.act({type:'next'});host.botAt=Infinity;await waitFor(()=>guest.current.epoch===host.model.epoch,'next hand');assert.equal(guest.current.tributeStage,'give');assert.equal(guest.current.remainingHands,undefined);assert.equal(guest.current.hands,undefined);assert.deepEqual(guest.current.publicHistory,[]);
    const tasks=JSON.parse(JSON.stringify(host.model.tributeTasks));host.suspend();host=new Session(hp);await host.resume();host.botAt=Infinity;assert.deepEqual(host.model.tributeTasks,tasks);await waitFor(()=>guest.current.epoch===host.model.epoch,'tribute recovery');
    while(host.model.phase==='tribute'){const actor=host.model.players[host.model.turn],cmd=AI.choose(host.projection(actor.id));if(actor.id===guest.identity.id)await guest.act(cmd);else host.process(actor.id,{...cmd,epoch:host.model.epoch});host.botAt=Infinity;await waitFor(()=>guest.current.epoch===host.model.epoch,'tribute snapshot');assert.deepEqual(guest.current.tributes,host.model.tributes);assert.equal(guest.current.remainingHands,undefined);assert.equal(new Set(host.model.hands.flat()).size,108);}
    assert(guest.current.tributes.every(g=>Number.isInteger(g.returnCard)));assert(host.model.hands.every(h=>h.length===27));console.log('Guandan UDP round and tribute completed in',steps,'play commands');
  }finally{host.stopSocket();guest.stopSocket();wrong.stopSocket();}
});
test('real UDP: discovery, join authentication, simultaneous voting, loss/duplicates, privacy and saved recovery',{timeout:90000},async()=>{
  const platforms=Array.from({length:5},()=>nativePlatform(new Map(),true));let sessions=platforms.map(p=>new Session(p)),host=sessions[0];let probe;
  try{
    await host.create('房主','五人圆桌','1234');
    const wrong=new Session(nativePlatform());await assert.rejects(wrong.join('127.0.0.1','错误口令','9999'),/口令/);assert.equal(host.model.players.length,1);
    probe=dgram.createSocket('udp4');await new Promise(resolve=>probe.bind(0,resolve));
    const nonce=crypto.randomBytes(32).toString('hex');let discovery;
    probe.on('message',bytes=>{const p=decode(bytes);if(p&&p.nonce===nonce)discovery=p;});
    probe.send(Buffer.from(encode({t:'discover',nonce})),PORT,'127.0.0.1');await waitFor(()=>discovery,'discovery');
    assert.equal(discovery.sid,host.sid);assert.equal(discovery.game,'avalon');assert.equal(discovery.roles,undefined);assert.equal(discovery.password,undefined);assert.equal(discovery.players,undefined);
    for(let i=1;i<5;i++)await sessions[i].join('127.0.0.1','玩家'+i,'1234',host.sid);
    await waitFor(()=>sessions.every(s=>s.current&&s.current.players.length===5),'all joined');
    await Promise.all(sessions.map(s=>s.act({type:'ready',value:true})));await waitFor(()=>sessions.every(s=>s.current.players.every(p=>p.ready)),'all ready');
    await assert.rejects(sessions[1].act({type:'start'}),/房主/);
    await host.act({type:'start'});await waitFor(()=>sessions.every(s=>s.current.phase==='reveal'),'reveal');console.log('All identities dealt');
    for(const s of sessions){assert.equal(s.current.private.role,host.model.roles[s.identity.id]);assert.equal(s.current.roles,undefined);assert.equal(s.current.revealed,undefined);}
    await Promise.all(sessions.map(s=>s.act({type:'seen'})));await waitFor(()=>sessions.every(s=>s.current.confirmCount===5),'identity confirmations');await host.act({type:'begin'});
    for(let round=0;round<3;round++){
      await waitFor(()=>sessions.every(s=>s.current.phase==='team'),'team');console.log('Round',round+1,'team ready');const captain=sessions.find(s=>s.identity.id===host.current.leader),size=host.current.sizes[round],team=sessions.slice(0,size).map(s=>s.identity.id);
      await captain.act({type:'propose',team});await waitFor(()=>sessions.every(s=>s.current.phase==='vote'),'vote');
      const staleEpoch=captain.current.epoch;await Promise.all(sessions.map(s=>s.act({type:'vote',approve:true})));await waitFor(()=>sessions.every(s=>s.current.phase==='quest'),'quest');
      await assert.rejects(sessions[1].act({type:'vote',approve:false,epoch:staleEpoch}),/已更新/);
      await Promise.all(sessions.filter(s=>team.includes(s.identity.id)).map(s=>s.act({type:'quest',success:true})));
      await waitFor(()=>sessions.every(s=>s.current.phase===(round===2?'assassinate':'result')),'mission result');
      for(const s of sessions){assert.equal(s.current.cards,undefined);assert.equal(s.current.results[round].fails,0);assert.equal(s.current.results[round].success,true);}
      if(round<2)await host.act({type:'next'});
    }
    // Restore host from serialized storage, with private roles and command dedup retained.
    const before=JSON.stringify(host.model.roles),sid=host.sid;host.suspend();host=new Session(platforms[0]);sessions[0]=host;await host.resume();assert.equal(host.sid,sid);assert.equal(JSON.stringify(host.model.roles),before);
    for(let i=1;i<5;i++){sessions[i].suspend();const id=sessions[i].identity.id;sessions[i]=new Session(platforms[i]);await sessions[i].resume();assert.equal(sessions[i].identity.id,id);assert.equal(sessions[i].current.private.role,host.model.roles[id]);}
    await waitFor(()=>sessions.every(s=>s.current.players.every(p=>p.online)),'all restored');
    const assassin=sessions.find(s=>host.model.roles[s.identity.id]==='assassin'),merlin=sessions.find(s=>host.model.roles[s.identity.id]==='merlin');
    await assassin.act({type:'assassinate',target:merlin.identity.id});await waitFor(()=>sessions.every(s=>s.current.phase==='over'),'game over');assert(sessions.every(s=>s.current.winner==='evil'));assert.equal(host.current.revealed.length,5);
    await host.act({type:'again'});await waitFor(()=>sessions.every(s=>s.current.phase==='lobby'),'next lobby');
    await host.act({type:'kick',target:sessions[4].identity.id});await waitFor(()=>!sessions[4].mode,'kicked');assert.equal(host.model.players.length,4);
    assert(platforms.reduce((n,p)=>n+p.stats.dropped,0)>0);assert(platforms.reduce((n,p)=>n+p.stats.duplicates,0)>0);
    console.log('UDP validation:',JSON.stringify(platforms.map(p=>p.stats)));
  }catch(e){console.log('Network failure state:',sessions.map(s=>({mode:s.mode,phase:s.current&&s.current.phase,seq:s.lastSeq,hostSeq:s.seq,connected:s.connected,groups:s.assembler.groups.size,age:Date.now()-s.lastSeen})));throw e;}
  finally{if(probe)probe.close();for(const s of sessions){s.stopSocket();s.listeners.clear();}}
});
test('late socket binding is cancelled; pending writes are rejected on background suspend',{timeout:10000},async()=>{
  const p=nativePlatform();p.socket=()=>({onMessage:()=>{},onError:()=>{},bind:()=>sleep(30),close:()=>{},send:()=>{}});
  const s=new Session(p);const creating=s.create('房主','测试','1234');s.suspend();await assert.rejects(creating,/取消/);assert.equal(s.socket,null);
  const h=new Session(nativePlatform()),c=new Session(nativePlatform());try{await h.create('房主','测试','1234');await c.join('127.0.0.1','玩家','1234');
    const pending=c.act({type:'ready',value:true});c.suspend();await assert.rejects(pending,/暂停/);assert.equal(c.connected,false);
  }finally{h.stopSocket();c.stopSocket();}
});
test('room invitations admit without password, survive host and guest recovery, and reject stale or forged links',{timeout:40000},async()=>{
  const hostPlatform=nativePlatform(),guestPlatform=nativePlatform(new Map(),true);let host=new Session(hostPlatform),guest=new Session(guestPlatform);const extras=[];
  try{
    await host.create('房主','邀请圆桌 🎲','1234');const original=host.invitation('127.0.0.1');assert(original);assert.equal(host.invitation('invalid'),null);
    const bad=new Session(nativePlatform());extras.push(bad);await assert.rejects(bad.join(original.ip,'伪造邀请','',original.sid,'f'.repeat(64)),/邀请已失效/);assert.equal(host.model.players.length,1);
    await assert.rejects(bad.join(original.ip,'错房间','', 'f'.repeat(64),original.invite),/重新建房/);assert.equal(host.model.players.length,1);
    await guest.join(original.ip,'好友','',original.sid,original.invite);assert.equal(guest.current.room,original.name);assert.equal(guest.password,'');assert.equal(guest.joinInvite,'');
    assert.equal(guest.current.inviteToken,undefined);assert.equal(guest.current.invite,undefined);assert.equal(guestPlatform.storage.get('resume').inviteToken,undefined);
    const token=host.inviteToken;host.suspend();host=new Session(hostPlatform);await host.resume();assert.equal(host.inviteToken,token);assert.deepEqual(host.invitation(original.ip),original);
    guest.suspend();guest=new Session(guestPlatform);await guest.resume();assert.equal(guest.current.room,original.name);assert.equal(host.model.players.length,2);
    const newcomer=new Session(nativePlatform());extras.push(newcomer);await newcomer.join(original.ip,'第二位好友','',original.sid,original.invite);assert.equal(host.model.players.length,3);
    host.leave();await sleep(50);await host.create('房主','新圆桌','5678');assert.notEqual(host.sid,original.sid);assert.notEqual(host.inviteToken,original.invite);
    const stale=new Session(nativePlatform());extras.push(stale);await assert.rejects(stale.join(original.ip,'旧卡片','',original.sid,original.invite),/重新建房/);
    await assert.rejects(stale.join(original.ip,'旧凭据','',host.sid,original.invite),/邀请已失效/);assert.equal(host.model.players.length,1);
    host.model.phase='team';assert.equal(host.invitation(original.ip),null);
  }finally{host.stopSocket();guest.stopSocket();for(const s of extras)s.stopSocket();}
});
