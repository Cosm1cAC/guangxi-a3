import http from 'node:http';

// Stable request domain for native clients; the existing game server stays the judge.
export function proxyGameApi(req,res,port=3002){
  if(!['GET','POST'].includes(req.method)){res.writeHead(405,{Allow:'GET, POST'});res.end();return;}
  const headers={};
  for(const key of ['authorization','content-type','content-length','x-a3-client','cf-connecting-ip'])if(req.headers[key])headers[key]=req.headers[key];
  let received=0;
  const upstream=http.request({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers,timeout:12000},response=>{
    res.writeHead(response.statusCode||502,{'Content-Type':response.headers['content-type']||'application/json','Cache-Control':'no-store'});response.pipe(res);
  });
  upstream.on('timeout',()=>upstream.destroy(Error('Upstream timed out')));
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json; charset=utf-8'});if(!res.writableEnded)res.end('{"error":"房间服务暂时不可用，请稍后重试"}');});
  req.on('data',chunk=>{received+=chunk.length;if(received>8192){upstream.destroy();if(!res.headersSent)res.writeHead(413,{'Content-Type':'application/json'});res.end('{"error":"请求内容过长"}');}else upstream.write(chunk);});
  req.on('end',()=>{if(!upstream.destroyed)upstream.end();});req.on('aborted',()=>upstream.destroy());
}
