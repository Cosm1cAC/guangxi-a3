import {expect,test} from 'vitest';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MUSIC_TRACKS} from '../src/core/music';
// @ts-expect-error Launcher helper is native JavaScript.
import {serveGameAudio} from '../scripts/audio-files.mjs';

test('预置音频与四首 CC0 授权清单一致，文件完整',()=>{
  const manifest=JSON.parse(readFileSync('public/audio/manifest.json','utf8'));
  expect(manifest).toHaveLength(4);
  for(const track of MUSIC_TRACKS){
    const asset=manifest.find((m:any)=>m.id===track.id),data=readFileSync('public'+track.src);
    expect(asset).toMatchObject({license:'CC0-1.0',source:track.source,file:track.src});expect(asset.duration).toBeGreaterThan(90);expect(data.length).toBe(asset.bytes);expect(createHash('sha256').update(data).digest('hex')).toBe(asset.sha256);
  }
  expect(readFileSync('public/audio/CC0-1.0.txt','utf8')).toContain('CC0 1.0 Universal');
});

test('固定域名音乐入口提供音频、HEAD 和 byte range，拒绝越界及其他文件',async()=>{
  const server=http.createServer((req,res)=>void serveGameAudio(req,res));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  try{
    const response=await fetch(base+MUSIC_TRACKS[0].src,{headers:{Range:'bytes=0-127'}});expect(response.status).toBe(206);expect(response.headers.get('content-type')).toBe('audio/mpeg');expect((await response.arrayBuffer()).byteLength).toBe(128);
    const head=await fetch(base+MUSIC_TRACKS[0].src,{method:'HEAD'});expect(head.status).toBe(200);expect(Number(head.headers.get('content-length'))).toBeGreaterThan(100000);expect(head.headers.get('accept-ranges')).toBe('bytes');
    expect((await fetch(base+MUSIC_TRACKS[0].src,{headers:{Range:'bytes=999999999-'}})).status).toBe(416);
    expect((await fetch(base+'/audio/.env')).status).toBe(404);expect((await fetch(base+MUSIC_TRACKS[0].src,{method:'POST'})).status).toBe(405);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
