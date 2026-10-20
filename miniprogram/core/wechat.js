'use strict';
const {sha256}=require('./codec');
function entropy(){return new Promise((resolve,reject)=>{
  if(typeof wx.getRandomValues!=='function'){reject(new Error('请更新微信，基础库至少需要 2.24.0'));return;}
  wx.getRandomValues({length:32,success:r=>resolve(Array.from(new Uint8Array(r.randomValues)).map(n=>n.toString(16).padStart(2,'0')).join('')),fail:()=>reject(new Error('无法生成设备身份，请重试'))});
});}
async function platform(){
  const seed=await entropy();let counter=0;
  return {
    randomToken:()=>sha256(seed+':'+(++counter)),random:()=>parseInt(sha256(seed+':'+(++counter)).slice(0,13),16)/4503599627370496,
    now:()=>Date.now(),every:(fn,ms)=>setInterval(fn,ms),cancel:id=>clearInterval(id),
    read:key=>wx.getStorageSync('pocket.'+key),write:(key,value)=>{if(value===null)wx.removeStorageSync('pocket.'+key);else wx.setStorageSync('pocket.'+key,value);},
    socket:()=>{
      if(typeof wx.createUDPSocket!=='function')throw new Error('当前微信不支持局域网通信，请更新微信');
      const socket=wx.createUDPSocket();
      return {onMessage:fn=>socket.onMessage(r=>fn(r.message,r.remoteInfo.address,r.remoteInfo.port)),onError:fn=>socket.onError(fn),
        bind:port=>Promise.resolve(socket.bind(port||undefined)),
        send:(ip,port,bytes,broadcast=false)=>socket.send({address:ip,port,message:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),setBroadcast:broadcast}),
        close:()=>socket.close()};
    }
  };
}
function localIP(){return new Promise(resolve=>{
  if(typeof wx.getLocalIPAddress!=='function'){resolve('');return;}
  wx.getLocalIPAddress({success:r=>resolve(r.localip||''),fail:()=>resolve('')});
});}
module.exports={platform,localIP};
