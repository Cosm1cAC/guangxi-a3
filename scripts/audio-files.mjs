import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve} from 'node:path';

const files=new Set(['first-light.mp3','deep-blue.mp3','vaporware.mp3','mystical-piano.mp3','manifest.json','CREDITS.txt','CC0-1.0.txt']);
/** Stable audio URLs for native clients, including byte ranges for progress seeking. */
export async function serveGameAudio(req,res,root=resolve('public/audio')){
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  const path=new URL(req.url,'http://localhost').pathname;
  const name=path.slice('/audio/'.length);
  if(!path.startsWith('/audio/')||!files.has(name)){res.writeHead(404);res.end();return;}
  let info;try{info=await stat(resolve(root,name));if(!info.isFile())throw Error('Not a file');}catch{res.writeHead(404);res.end();return;}
  let start=0,end=info.size-1,status=200;
  if(req.headers.range){
    const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(range&&(range[1]||range[2])){
      if(!range[1]){start=Math.max(0,info.size-Number(range[2]));}
      else{start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}
      status=206;
    }
    if(!range||(!range[1]&&!range[2])||range[1]===''&&Number(range[2])===0||start>end||start>=info.size||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)){
      res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;
    }
  }
  const headers={'Content-Type':name.endsWith('.mp3')?'audio/mpeg':name.endsWith('.json')?'application/json; charset=utf-8':'text/plain; charset=utf-8','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'public, max-age=3600'};
  if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
  res.writeHead(status,headers);if(req.method==='HEAD'){res.end();return;}
  const stream=createReadStream(resolve(root,name),{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
