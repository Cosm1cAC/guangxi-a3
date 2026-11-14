import dns from 'node:dns/promises';
import net from 'node:net';
import https from 'node:https';
import fs from 'node:fs/promises';
const host='a3.vibelink.cloud';
const output='.local/cloudflared/benchmark.json';
const edgeOnly=process.argv.includes('--edge-only');
const median=values=>{const a=[...values].sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null;};
const connect=ip=>new Promise(resolve=>{
  const start=performance.now(),socket=net.createConnection({host:ip,port:7844});
  socket.setTimeout(1800);socket.once('connect',()=>{resolve(Math.round(performance.now()-start));socket.destroy();});
  socket.once('error',()=>resolve(null));socket.once('timeout',()=>{resolve(null);socket.destroy();});
});
const request=ip=>new Promise(resolve=>{
  const start=performance.now();let settled=false;
  const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);resolve(result);};
  const r=https.get({host,servername:host,path:'/go/target.json?bench='+Date.now(),agent:false,lookup:(_name,options,cb)=>options.all?cb(null,[{address:ip,family:4}]):cb(null,ip,4),timeout:5500},res=>{
    let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>{
      let valid=false;try{valid=res.statusCode===200&&new URL(JSON.parse(body).url).protocol==='https:';}catch{}
      finish({ok:valid,ms:Math.round(performance.now()-start),status:res.statusCode,colo:String(res.headers['cf-ray']||'').split('-').at(-1)});
    });
  });
  const timer=setTimeout(()=>{r.destroy();finish({ok:false,ms:5500});},5500);
  r.on('error',error=>finish({ok:false,ms:Math.round(performance.now()-start),error:error.code||error.message}));
});
async function pool(items,worker,concurrency=6){let cursor=0;const out=[];await Promise.all(Array.from({length:concurrency},async()=>{while(cursor<items.length){const i=cursor++;out[i]=await worker(items[i]);}}));return out;}
const edgeIps=[...new Set((await Promise.all(['region1.v2.argotunnel.com','region2.v2.argotunnel.com'].map(n=>dns.resolve4(n)))).flat())];
const edge=await pool(edgeIps,async ip=>{const samples=[];for(let i=0;i<4;i++)samples.push(await connect(ip));const good=samples.filter(n=>n!==null);return {ip,samples,loss:1-good.length/4,medianMs:median(good),accepted:good.length>=3&&median(good)<=350};});
console.log('隧道出口 TCP 7844 测量完成。');
const resolved=edgeOnly?[]:await dns.resolve4(host);
const frontendIps=[...new Set([...resolved,'104.16.0.1','104.17.0.1','104.18.0.1','104.19.0.1','104.20.0.1','104.21.0.1','104.24.0.1','172.64.0.1','172.67.0.1','162.159.0.1','188.114.96.1','190.93.240.1','198.41.128.1','108.162.192.1','141.101.64.1','173.245.48.1'])];
let previous=null;try{previous=JSON.parse(await fs.readFile(output,'utf8'));}catch{}
const frontend=edgeOnly?(previous?.frontend||[]):await pool(frontendIps,async ip=>{const samples=[];for(let i=0;i<3;i++)samples.push(await request(ip));const good=samples.filter(s=>s.ok);return {ip,samples,loss:1-good.length/3,medianMs:median(good.map(s=>s.ms)),accepted:good.length===3&&median(good.map(s=>s.ms))<=2000};});
const report={time:new Date().toISOString(),host,edge:edge.sort((a,b)=>a.loss-b.loss||(a.medianMs??99999)-(b.medianMs??99999)),frontend:frontend.sort((a,b)=>a.loss-b.loss||(a.medianMs??99999)-(b.medianMs??99999)),note:'TCP7844是候选连接质量，HTTPS是本机实际入口响应；不代表其他玩家的线路。'};
report.frontendTime=edgeOnly?(previous?.frontendTime||previous?.time||null):report.time;
await fs.mkdir('.local/cloudflared',{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({bestEdges:report.edge.filter(e=>e.loss===0&&e.medianMs<=350).slice(0,4).map(({ip,loss,medianMs})=>({ip,loss,medianMs})),testedEdges:report.edge.length,frontend:edgeOnly?'未重复测试访客入口':report.frontend.map(({ip,loss,medianMs,accepted})=>({ip,loss,medianMs,accepted})),output},null,2));
