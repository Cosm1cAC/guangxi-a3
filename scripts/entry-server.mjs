import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {cpolarPublicUrl} from './cpolar.mjs';
import {proxyGameApi} from './api-proxy.mjs';
import {serveGameAudio} from './audio-files.mjs';
const port=Number(process.env.A3_ENTRY_PORT||3003);
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('Pragma','no-cache');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  const incoming=new URL(req.url,'http://localhost');
  if(incoming.pathname.startsWith('/api/')){proxyGameApi(req,res,Number(process.env.A3_GAME_PORT||3002));return;}
  if(incoming.pathname.startsWith('/audio/')){await serveGameAudio(req,res);return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  if(incoming.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');return;}
  if(!['/','/go','/go/','/go/target.json','/download','/download/'].includes(incoming.pathname)){res.writeHead(404);res.end('Not found');return;}
  try{
    const data=JSON.parse(await readFile('.local/cpolar/public.json','utf8'));
    const target=new URL(data.url);
    if(target.protocol!=='https:'||target.username||target.password||target.port||cpolarPublicUrl(target.origin)!==target.origin)throw Error('Invalid target');
    if(incoming.pathname==='/go/target.json'){res.writeHead(200,{'Content-Type':'application/json'});res.end(req.method==='HEAD'?'':JSON.stringify({url:target.origin,updatedAt:data.verifiedAt}));return;}
    target.pathname=incoming.pathname.startsWith('/download')?'/download/':'/';target.search=incoming.search;
    res.writeHead(302,{Location:target.href});res.end();
  }catch{
    res.writeHead(503,{'Content-Type':'text/html; charset=utf-8','Retry-After':'5'});
    res.end(req.method==='HEAD'?'':'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>山水尖3</title><p>牌桌正在连接，请稍后刷新。</p>');
  }
});
server.listen(port,'127.0.0.1',()=>console.log(`固定入口本机服务：http://127.0.0.1:${port}`));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
