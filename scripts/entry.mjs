import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cpolarPublicUrl } from './cpolar.mjs';

export const ENTRY_URL='https://a3.vibelink.cloud/go/';

export function publishEntryTarget(value,root='.'){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||cpolarPublicUrl(url.origin)!==url.origin)throw new Error('跳转目标必须为有效的 cpolar HTTPS 根地址');
  const target={url:url.origin,updatedAt:new Date().toISOString()};
  for(const directory of ['public/go','dist/go']){
    const dir=resolve(root,directory);mkdirSync(dir,{recursive:true});
    const path=resolve(dir,'target.json'),temp=resolve(dir,'target.json.tmp');
    writeFileSync(temp,JSON.stringify(target)+'\n',{mode:0o644});renameSync(temp,path);
  }
  const local=resolve(root,'.local/cpolar');mkdirSync(local,{recursive:true});
  writeFileSync(resolve(local,'public.json.tmp'),JSON.stringify({url:target.url,verifiedAt:target.updatedAt})+'\n',{mode:0o600});
  renameSync(resolve(local,'public.json.tmp'),resolve(local,'public.json'));
  return target;
}

export function prepareEntryTunnel(root='.'){
  const dir=resolve(root,'.local/cloudflared');
  const original=JSON.parse(readFileSync(resolve(dir,'public.json'),'utf8'));
  if(original.hostname!=='a3.vibelink.cloud'||! /^[a-f0-9-]{36}$/i.test(original.tunnelId))throw Error('固定入口域名／隧道配置不匹配');
  const config={tunnel:original.tunnelId,'credentials-file':resolve(dir,'a3-vibelink.json'),protocol:'http2','edge-ip-version':'4',ingress:[{hostname:original.hostname,service:'http://127.0.0.1:3003'},{service:'http_status:404'}]};
  const benchmark=resolve(dir,'benchmark.json');
  if(existsSync(benchmark)){
    const report=JSON.parse(readFileSync(benchmark,'utf8'));
    if(Date.now()-Date.parse(report.time)<24*60*60*1000){
      const good=report.edge.filter(e=>e.loss===0&&e.medianMs>0&&e.medianMs<=350).sort((a,b)=>a.medianMs-b.medianMs);
      if(good.length>=4){config.edge=good.slice(0,4).map(e=>`${e.ip}:7844`);config['ha-connections']=4;}
    }
  }
  const path=resolve(dir,'entry-config.yml');writeFileSync(path,JSON.stringify(config,null,2)+'\n');return path;
}
