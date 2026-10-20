'use strict';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function utf8(s) { const a=[]; for (const ch of s) {const c=ch.codePointAt(0); if(c<128)a.push(c); else if(c<2048)a.push(192|(c>>6),128|(c&63)); else if(c<65536)a.push(224|(c>>12),128|((c>>6)&63),128|(c&63)); else a.push(240|(c>>18),128|((c>>12)&63),128|((c>>6)&63),128|(c&63));} return new Uint8Array(a); }
function text(bytes) {const a=new Uint8Array(bytes), out=[]; for(let i=0;i<a.length;) {let c=a[i++]; if(c<128)out.push(String.fromCodePoint(c)); else {let n=c<224?1:c<240?2:3; c &= n===1?31:n===2?15:7; while(n--)c=(c<<6)|(a[i++]&63); out.push(String.fromCodePoint(c));}} return out.join('');}
function base64(a) {let r=''; for(let i=0;i<a.length;i+=3) {const n=(a[i]<<16)|((a[i+1]||0)<<8)|(a[i+2]||0); r+=alphabet[n>>>18]+alphabet[(n>>>12)&63]+(i+1<a.length?alphabet[(n>>>6)&63]:'=')+(i+2<a.length?alphabet[n&63]:'=');} return r;}
function unbase64(s) {const a=[]; for(let i=0;i<s.length;i+=4) {const n=(alphabet.indexOf(s[i])<<18)|(alphabet.indexOf(s[i+1])<<12)|((alphabet.indexOf(s[i+2])&63)<<6)|(alphabet.indexOf(s[i+3])&63); a.push((n>>>16)&255); if(s[i+2]!=='=')a.push((n>>>8)&255); if(s[i+3]!=='=')a.push(n&255);} return new Uint8Array(a);}
function sha256(value) {
  const bytes=Array.from(utf8(value)), bits=bytes.length*8;
  bytes.push(128); while(bytes.length%64!==56)bytes.push(0);
  for(let i=7;i>=0;i--)bytes.push(i>=4?0:(bits>>>i*8)&255);
  const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], rot=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let b=0;b<bytes.length;b+=64) {
    const w=[]; for(let i=0;i<16;i++)w[i]=(bytes[b+i*4]<<24)|(bytes[b+i*4+1]<<16)|(bytes[b+i*4+2]<<8)|bytes[b+i*4+3];
    for(let i=16;i<64;i++)w[i]=((rot(w[i-2],17)^rot(w[i-2],19)^(w[i-2]>>>10))+w[i-7]+(rot(w[i-15],7)^rot(w[i-15],18)^(w[i-15]>>>3))+w[i-16])|0;
    let [a,c,d,e,f,g,j,l]=h;
    for(let i=0;i<64;i++) {const t1=(l+(rot(f,6)^rot(f,11)^rot(f,25))+((f&g)^(~f&j))+k[i]+w[i])|0,t2=((rot(a,2)^rot(a,13)^rot(a,22))+((a&c)^(a&d)^(c&d)))|0; l=j;j=g;g=f;f=(e+t1)|0;e=d;d=c;c=a;a=(t1+t2)|0;}
    [a,c,d,e,f,g,j,l].forEach((v,i)=>{h[i]=(h[i]+v)|0;});
  } return h.map(n=>(n>>>0).toString(16).padStart(8,'0')).join('');
}
module.exports={utf8,text,base64,unbase64,sha256};
