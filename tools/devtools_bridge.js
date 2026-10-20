'use strict';
// Temporary loopback-only IPv4 bridge for a DevTools CLI service listening on ::1.
// Run only during local validation, then stop this process.
const net=require('node:net');
const port=Number(process.argv[2]);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Pass the observed DevTools service port');
const peers=new Set();
const server=net.createServer(client=>{
  const upstream=net.connect({host:'::1',port});peers.add(client);peers.add(upstream);
  client.pipe(upstream);upstream.pipe(client);
  const close=()=>{client.destroy();upstream.destroy();peers.delete(client);peers.delete(upstream);};client.on('error',close);upstream.on('error',close);client.on('close',close);upstream.on('close',close);
});
server.listen(port,'127.0.0.1',()=>console.log('Loopback IPv4 bridge listening on',port));
function stop(){for(const socket of peers)socket.destroy();server.close(()=>process.exit(0));}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
