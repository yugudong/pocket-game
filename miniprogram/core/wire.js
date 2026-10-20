'use strict';
const {utf8,text,base64,unbase64,sha256}=require('./codec');
const PROTOCOL='pbg1', PORT=29861, CHUNK=600, MAX_CHUNKS=96;
function validIP(ip){return typeof ip==='string'&&/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)&&ip.split('.').every(x=>Number(x)<=255)&&ip!=='0.0.0.0'&&ip!=='255.255.255.255';}
function token(v){return typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);}
function encode(packet){return utf8(JSON.stringify(Object.assign({p:PROTOCOL},packet)));}
function decode(bytes){if(bytes.byteLength>1800)return null;try{const packet=JSON.parse(text(bytes));return packet&&packet.p===PROTOCOL?packet:null;}catch(e){return null;}}
function fragments(value,sid,pid,seq){
  const source=JSON.stringify(value),bytes=utf8(source),hash=sha256(source),total=Math.ceil(bytes.length/CHUNK);
  if(total>MAX_CHUNKS)throw new Error('房间记录过大');
  const packets=[];for(let i=0;i<total;i++)packets.push({t:'fragment',sid,pid,seq,hash,i,total,data:base64(bytes.slice(i*CHUNK,(i+1)*CHUNK))});return packets;
}
class Assembler {
  constructor(){this.groups=new Map();}
  accept(p,now){
    if(!token(p.hash)||!Number.isSafeInteger(p.seq)||p.seq<0||!Number.isInteger(p.total)||p.total<1||p.total>MAX_CHUNKS||!Number.isInteger(p.i)||p.i<0||p.i>=p.total||typeof p.data!=='string'||p.data.length>800||!/^[A-Za-z0-9+/]*={0,2}$/.test(p.data)||p.data.length%4)return null;
    for(const [key,g] of this.groups)if(now-g.at>5000)this.groups.delete(key);
    const key=p.seq+':'+p.hash;let g=this.groups.get(key);
    if(!g){if(this.groups.size>=4)this.groups.delete(this.groups.keys().next().value);g={total:p.total,parts:new Map(),at:now};this.groups.set(key,g);}
    if(g.total!==p.total)return null;g.parts.set(p.i,unbase64(p.data));if(g.parts.size!==g.total)return null;
    const size=Array.from(g.parts.values()).reduce((n,a)=>n+a.length,0),bytes=new Uint8Array(size);let at=0;
    for(let i=0;i<g.total;i++){const a=g.parts.get(i);bytes.set(a,at);at+=a.length;}
    this.groups.delete(key);const source=text(bytes);if(sha256(source)!==p.hash)return null;
    try{return JSON.parse(source);}catch(e){return null;}
  }
}
module.exports={PROTOCOL,PORT,validIP,token,encode,decode,fragments,Assembler};
