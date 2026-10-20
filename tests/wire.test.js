'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const c=require('../miniprogram/core/codec'),w=require('../miniprogram/core/wire');
test('UTF-8 and SHA-256 match Node for Chinese and emoji',()=>{for(const value of ['','口袋桌游 🎲 阿瓦隆','a'.repeat(4096)]){assert.equal(c.text(c.utf8(value)),value);assert.equal(c.sha256(value),crypto.createHash('sha256').update(value).digest('hex'));assert.deepEqual(c.unbase64(c.base64(c.utf8(value))),c.utf8(value));}});
test('fragment reconstruction handles out of order duplicates and rejects corruption',()=>{
  const value={text:'玩家圆桌🃏'.repeat(1000)},sid='a'.repeat(64),pid='b'.repeat(64),packets=w.fragments(value,sid,pid,11),a=new w.Assembler();let completed=null;
  for(const p of packets.slice().reverse()){assert(w.encode(p).length<1800);a.accept(p,0);const result=a.accept(p,0);if(result)completed=result;}
  // The first copy of the final packet may complete the group.
  for(const p of packets){const result=a.accept(p,0);if(result)completed=result;}
  assert.deepEqual(completed,value);const bad=packets.map(p=>({...p}));bad[0].data=c.base64(c.utf8('corrupted'));const b=new w.Assembler();for(const p of bad)assert.equal(b.accept(p,0),null);
});
test('bounded malformed packets and address validation',()=>{
  assert(w.validIP('192.168.1.8'));for(const ip of ['999.1.1.1','0.0.0.0','localhost','255.255.255.255'])assert(!w.validIP(ip));
  assert.equal(w.decode(c.utf8('{invalid')),null);assert.equal(w.decode(c.utf8(JSON.stringify({p:'another'}))),null);
  const a=new w.Assembler();for(const bad of [{total:100000},{i:-1},{data:'%bad'},{seq:Infinity}])assert.equal(a.accept(Object.assign({hash:'a'.repeat(64),seq:1,total:1,i:0,data:'YWJj'},bad),0),null);
});
test('long 10-player full history fits bounded snapshots without exposing mission choices',()=>{
  const r=require('../miniprogram/core/avalon'),ids=Array.from({length:10},(_,i)=>crypto.createHash('sha256').update('seat'+i).digest('hex'));
  let s=r.create(ids[0],'长昵称'.repeat(5),'十人圆桌');for(let i=1;i<10;i++)r.addPlayer(s,ids[i],'长昵称'.repeat(5));s.players.forEach(p=>p.ready=true);
  const action=(actor,type,extra={})=>{s=r.apply(s,actor,{type,epoch:s.epoch,...extra},()=>.42);};
  action(ids[0],'start');for(const id of ids)action(id,'seen');action(ids[0],'begin');
  for(let quest=0;quest<5;quest++){
    const fail=quest%2===1;
    for(let attempt=0;attempt<5;attempt++){
      const evil=ids.filter(id=>r.ROLES[s.roles[id]].side==='evil'),good=ids.filter(id=>r.ROLES[s.roles[id]].side==='good');
      const failures=fail?(quest===3?2:1):0;
      const team=evil.slice(0,failures).concat(good,evil.slice(failures)).slice(0,r.SIZES[10][quest]);
      action(s.players[s.leader].id,'propose',{team});for(const id of ids)action(id,'vote',{approve:attempt===4});
      if(attempt===4)for(const id of team)action(id,'quest',{success:!evil.slice(0,failures).includes(id)});
    }
    if(quest<4)action(ids[0],'next');
  }
  assert.equal(s.phase,'assassinate');assert.equal(s.history.length,30);
  for(const id of ids){const v=r.view(s,id),packets=w.fragments(v,'a'.repeat(64),id,100);assert(packets.length<=96);assert.equal(v.cards,undefined);assert(v.history.filter(x=>x.kind==='quest').every(x=>!x.cards));}
});
