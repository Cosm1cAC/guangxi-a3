import {expect,test} from 'vitest';
import http from 'node:http';
// @ts-expect-error Native ESM helper shared by launcher and verification.
import {proxyGameApi} from '../scripts/api-proxy.mjs';

test('fixed API proxy preserves account authentication, payloads and server errors',async()=>{
  const backend=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{res.writeHead(req.url==='/api/forbidden'?403:200,{'Content-Type':'application/json'});res.end(JSON.stringify({path:req.url,token:req.headers.authorization,body}));});});
  await new Promise<void>(r=>backend.listen(0,'127.0.0.1',r));
  const proxy=http.createServer((req,res)=>proxyGameApi(req,res,(backend.address() as any).port));
  await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r));
  try{
    const base=`http://127.0.0.1:${(proxy.address() as any).port}`;
    const response=await fetch(base+'/api/rooms/123/actions',{method:'POST',headers:{Authorization:'Bearer test-session','content-type':'application/json'},body:JSON.stringify({version:1,cards:[]})});
    expect(await response.json()).toEqual({path:'/api/rooms/123/actions',token:'Bearer test-session',body:'{"version":1,"cards":[]}'});
    expect((await fetch(base+'/api/forbidden')).status).toBe(403);expect((await fetch(base+'/api/rooms',{method:'DELETE'})).status).toBe(405);
  }finally{await Promise.all([new Promise<void>(r=>proxy.close(()=>r())),new Promise<void>(r=>backend.close(()=>r()))]);}
});
