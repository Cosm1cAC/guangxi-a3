import {expect,test} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
// @ts-expect-error Startup helpers are JavaScript.
import {publishEntryTarget,prepareEntryTunnel} from '../scripts/entry.mjs';

test('固定入口只允许cpolar HTTPS，地址变化后源码和构建产物同步更新',()=>{
  const root=mkdtempSync(join(tmpdir(),'a3-entry-'));
  try{
    for(const bad of ['http://abc.cpolar.cn','https://evil.example','https://abc.cpolar.cn.evil.example','https://u:p@abc.cpolar.cn','https://abc.cpolar.cn/path','https://abc.cpolar.cn?token=secret'])expect(()=>publishEntryTarget(bad,root)).toThrow();
    publishEntryTarget('https://old.r9.cpolar.cn',root);
    publishEntryTarget('https://new.r9.cpolar.cn',root);
    const source=JSON.parse(readFileSync(join(root,'public/go/target.json'),'utf8'));
    const built=JSON.parse(readFileSync(join(root,'dist/go/target.json'),'utf8'));
    expect(source).toEqual(built);expect(source.url).toBe('https://new.r9.cpolar.cn');expect(Object.keys(source).sort()).toEqual(['updatedAt','url']);
  }finally{
    if(!resolve(root).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe cleanup path');
    rmSync(root,{recursive:true});
  }
});

test('优选池排除丢包和高延迟候选，过期结果恢复默认发现',()=>{
  const root=mkdtempSync(join(tmpdir(),'a3-entry-'));
  try{
    const dir=join(root,'.local/cloudflared');mkdirSync(dir,{recursive:true});
    writeFileSync(join(dir,'public.json'),JSON.stringify({hostname:'a3.vibelink.cloud',tunnelId:'3fad7a64-df99-419a-b0b1-eeec96e76acf'}));
    const edge=[{ip:'198.41.192.7',loss:0,medianMs:220},{ip:'198.41.192.27',loss:0,medianMs:230},{ip:'198.41.200.53',loss:0,medianMs:240},{ip:'198.41.200.63',loss:0,medianMs:250},{ip:'198.41.200.13',loss:0,medianMs:900},{ip:'198.41.192.37',loss:.25,medianMs:100}];
    writeFileSync(join(dir,'benchmark.json'),JSON.stringify({time:new Date().toISOString(),edge}));
    const config=JSON.parse(readFileSync(prepareEntryTunnel(root),'utf8'));
    expect(config.edge).toEqual(edge.slice(0,4).map(e=>e.ip+':7844'));
    expect(config.protocol).toBe('http2');expect(config.ingress[0].service).toBe('http://127.0.0.1:3003');
    writeFileSync(join(dir,'benchmark.json'),JSON.stringify({time:'2020-01-01',edge}));
    expect(JSON.parse(readFileSync(prepareEntryTunnel(root),'utf8')).edge).toBeUndefined();
  }finally{
    if(!resolve(root).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe cleanup path');
    rmSync(root,{recursive:true});
  }
});
