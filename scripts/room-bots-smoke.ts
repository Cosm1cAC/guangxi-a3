import 'dotenv/config';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {pool,schema} from '../server/db';
import {canReturnTribute,createGame,createNextGame,movesFor,type GameView} from '../src/core/game';
import {chromium} from '@playwright/test';

// Run against a disposable schema, never create accounts or rooms in the live schema.
const namespace=`a3_bots_test_${Date.now()}_${process.pid}`;
if(!/^a3_bots_test_\d+_\d+$/.test(namespace))throw Error('Invalid test schema');
const connection=new URL(process.env.DATABASE_URL||'postgresql://a3:a3_local_dev@localhost:5432/a3');
connection.searchParams.set('options',`-c search_path=${namespace}`);
const database=new pg.Pool({connectionString:connection.href});
let service:ReturnType<typeof spawn>|undefined,logs='';
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));
const port=(socket.address() as {port:number}).port;await new Promise<void>(resolve=>socket.close(()=>resolve()));
const base=`http://127.0.0.1:${port}`;
const tokens:string[]=[],users:any[]=[];
async function req(path:string,body?:unknown,token?:string){const response=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});return {status:response.status,data:await response.json()};}
const ok=(response:{status:number;data:any},status=200)=>{assert.equal(response.status,status,JSON.stringify(response.data));return response.data;};
const room=async()=>ok(await req('/rooms',{},tokens[0]),201);
type Remote=GameView&{room:string;roomStatus:string;members:{name:string;bot:boolean}[];canFillBots:boolean};
try{
  await pool.query(`CREATE SCHEMA ${namespace}`);await database.query(schema);
  service=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs',import.meta.url)),'server/index.ts'],{cwd:fileURLToPath(new URL('..',import.meta.url)),windowsHide:true,env:{...process.env,DATABASE_URL:connection.href,PORT:String(port),SMTP_HOST:'',A3_PUBLIC_URL:'',A3_WECHAT_MOCK:'0',A3_RATE_LIMIT:'100000'},stdio:['ignore','pipe','pipe']});
  service.stdout?.on('data',chunk=>{logs+=chunk;});service.stderr?.on('data',chunk=>{logs+=chunk;});
  let ready=false;for(let i=0;i<100;i++){if(service.exitCode!==null)throw Error(logs);try{ready=(await req('/health')).status===200;}catch{}if(ready)break;await delay(100);}assert(ready,'Test server did not start');
  for(let i=0;i<4;i++){const username=`bots_${Date.now()}_${i}`,password='test-bots-password';const registered=ok(await req('/auth/register',{username,email:`${username}@example.com`,password,name:`牌友${i}`}),201);tokens.push(registered.token);users.push(registered.user);if(i===0)assert.equal(ok(await req('/auth/login',{identifier:username.toUpperCase(),password})).user.id,registered.user.id);}
  const mixedRooms:string[]=[];
  for(let humans=1;humans<=3;humans++){
    const waiting=await room();assert.equal(waiting.canFillBots,true);
    for(let seat=1;seat<humans;seat++){const joined=ok(await req(`/rooms/${waiting.room}/join`,{},tokens[seat]));assert.equal(joined.canFillBots,false);assert.equal((await req(`/rooms/${waiting.room}/fill-bots`,{},tokens[seat])).status,403);}
    assert.equal((await req(`/rooms/${waiting.room}/fill-bots`,{})).status,401);
    assert.equal((await req(`/rooms/${waiting.room}/fill-bots`,{},tokens[3])).status,403);
    const filled:Remote=ok(await req(`/rooms/${waiting.room}/fill-bots`,{},tokens[0]));
    assert.equal(filled.members.length,4);assert.equal(filled.members.filter(m=>m.bot).length,4-humans);assert.equal(filled.canFillBots,false);assert.equal(filled.roomStatus,'playing');assert(!filled.members[filled.turn].bot,'Bots must advance to a human turn');
    assert(!('hands'in filled));assert(!('userId'in filled.members[0]));
    const stored=(await database.query('SELECT members FROM rooms WHERE id=$1',[waiting.room])).rows[0].members;
    for(let i=0;i<4;i++){assert.equal(stored[i].bot,i>=humans);assert.equal(stored[i].userId,i<humans?users[i].id:null);}
    for(let seat=0;seat<humans;seat++){const resumed=ok(await req(`/rooms/${waiting.room}/join`,{},tokens[seat]));assert.equal(resumed.seat,seat);}
    assert.equal((await req(`/rooms/${waiting.room}/fill-bots`,{},tokens[0])).status,409);
    assert.equal((await req(`/rooms/${waiting.room}/join`,{},tokens[3])).status,409);mixedRooms.push(waiting.room);
  }
  // A join racing the host's action either takes a real seat first, or sees a full room.
  const race=await room();ok(await req(`/rooms/${race.room}/join`,{},tokens[1]));
  const [filled,joined]=await Promise.all([req(`/rooms/${race.room}/fill-bots`,{},tokens[0]),req(`/rooms/${race.room}/join`,{},tokens[2])]);ok(filled);assert([200,409].includes(joined.status));
  const raced:Remote=ok(await req(`/rooms/${race.room}`,undefined,tokens[0]));assert.equal(raced.members.length,4);assert.equal(raced.members.filter(m=>!m.bot).length,joined.status===200?3:2);
  // The first remaining player becomes host after the original host leaves.
  const transfer=await room();ok(await req(`/rooms/${transfer.room}/join`,{},tokens[1]));ok(await req(`/rooms/${transfer.room}/leave`,{},tokens[0]));assert.equal(ok(await req(`/rooms/${transfer.room}`,undefined,tokens[1])).canFillBots,true);ok(await req(`/rooms/${transfer.room}/fill-bots`,{},tokens[1]));
  const full=await room();for(const token of tokens.slice(1))ok(await req(`/rooms/${full.room}/join`,{},token));assert.equal((await req(`/rooms/${full.room}/fill-bots`,{},tokens[0])).status,409);
  // Two humans play two full rounds; only authenticated humans choose human actions.
  const id=mixedRooms[1];let moves=0,returns=0;
  for(let round=1;round<=2;round++){
    for(let step=0;step<500;step++){
      const s:Remote=ok(await req(`/rooms/${id}`,undefined,tokens[0]));if(s.status==='finished')break;
      if(s.status==='tribute'){
        let advanced=false;
        for(let seat=0;seat<2;seat++){
          const v:Remote=ok(await req(`/rooms/${id}`,undefined,tokens[seat])),choice=v.tribute?.selection;
          if(choice){const quota=choice.quotas[seat];if(!quota||choice.locked.includes(seat)||choice.choices[seat]?.length===quota)continue;const taken=new Set(Object.entries(choice.choices).filter(([who])=>Number(who)!==seat).flatMap(([,cards])=>cards));const cards=v.tribute!.transfers.map((_,i)=>i).filter(i=>!taken.has(i)).slice(0,quota);ok(await req(`/rooms/${id}/tribute-choice`,{version:v.version,round:v.round,action:{kind:'select',cards}},tokens[seat]));advanced=true;break;}
          if(v.pendingReturns){ok(await req(`/rooms/${id}/tribute`,{version:v.version,card:v.hand.find(canReturnTribute)},tokens[seat]));returns++;advanced=true;break;}
        }
        assert(advanced,'Tribute did not advance');
      }else{assert(s.turn<2,'Robot turn was not played');const v:Remote=ok(await req(`/rooms/${id}`,undefined,tokens[s.turn]));ok(await req(`/rooms/${id}/actions`,{version:v.version,cards:movesFor(v.hand,v.last?.cards||null,v.first)[0]||[]},tokens[s.turn]));moves++;}
    }
    const finished:Remote=ok(await req(`/rooms/${id}`,undefined,tokens[0]));assert.equal(finished.status,'finished');assert.equal(finished.round,round);assert.equal(finished.totals.reduce((a,b)=>a+b,0),0);if(round===1)ok(await req(`/rooms/${id}/next`,{},tokens[0]));
  }
  // Force a big-tribute fixture: human 0 and bot 2 receive two cards each.
  const tribute=createNextGame({...createGame(),status:'finished',teams:[1,0,1,0],order:[0,2,1,3],finishedNaturally:[0,2],scores:[2,-2,2,-2]});
  assert.equal(tribute.tribute?.transfers.length,4);
  await database.query("UPDATE rooms SET state=$2,status='playing' WHERE id=$1",[id,JSON.stringify(tribute)]);
  let exchange:Remote=ok(await req(`/rooms/${id}`,undefined,tokens[0]));
  exchange=ok(await req(`/rooms/${id}/tribute-choice`,{version:exchange.version,round:exchange.round,action:{kind:'select',cards:[0,1]}},tokens[0]));
  assert.equal(exchange.pendingReturns,2);assert.equal(exchange.tribute!.transfers.filter(t=>t.to===2&&t.returned).length,2,'Robot receiver returns its two tribute cards');
  for(let i=0;i<2;i++){exchange=ok(await req(`/rooms/${id}/tribute`,{version:exchange.version,card:exchange.hand.find(canReturnTribute)},tokens[0]));returns++;}
  assert.equal(exchange.status,'playing');assert(exchange.tribute!.transfers.every(t=>t.returned));assert(!exchange.members[exchange.turn].bot);
  for(const token of tokens){const me=ok(await req('/me',undefined,token));assert.equal(me.user.games,0);assert.equal(me.user.score,0);}
  if(process.argv.includes('--browser')){
    mkdirSync('artifacts',{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    try{
      const waiting=await room();ok(await req(`/rooms/${waiting.room}/join`,{},tokens[1]));
      const contexts=[];
      for(let seat=0;seat<2;seat++){
        const context=await browser.newContext({viewport:seat?{width:390,height:844}:{width:1440,height:900}});contexts.push(context);
        await context.addInitScript(({token,user,room})=>{localStorage.setItem('a3-session',JSON.stringify({token,user}));localStorage.setItem('a3-room',room);const original=HTMLCanvasElement.prototype.getContext;Object.defineProperty(HTMLCanvasElement.prototype,'getContext',{value:function(type:string,...args:any[]){return type.startsWith('webgl')?null:Reflect.apply(original,this,[type,...args]);}});},{token:tokens[seat],user:users[seat],room:waiting.room});
      }
      const host=await contexts[0].newPage(),guest=await contexts[1].newPage();await Promise.all([host.goto(base),guest.goto(base)]);
      await host.locator('#fill-bots').waitFor({state:'visible'});await guest.locator('#room-waiting').waitFor({state:'visible'});assert.equal(await guest.locator('#fill-bots').isHidden(),true);
      for(const size of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]){await host.setViewportSize(size);const box=(await host.locator('#fill-bots').boundingBox())!;assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=size.width&&box.y+box.height<=size.height);assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await host.screenshot({path:`artifacts/room-bots-${size.width}.png`});}
      await host.locator('#fill-bots').click();await host.locator('#room-waiting').waitFor({state:'hidden'});await guest.locator('#room-waiting').waitFor({state:'hidden'});assert.equal(await host.locator('.bot-badge').count(),2);assert.equal(await guest.locator('.bot-badge').count(),2);assert((await guest.locator('#footer-state').textContent())?.includes('不计账号排行'));
      await guest.reload();await guest.locator('#room-waiting').waitFor({state:'hidden'});await guest.locator('.bot-badge').first().waitFor();assert.equal(await guest.locator('.bot-badge').count(),2);
    }finally{await browser.close();}
  }
  console.log(`PASS: independent account login; 1/2/3-human rooms; host permissions; bot persistence; rejoin; join/fill concurrency; host transfer; full room protection; 2 rounds (${moves} human actions, ${returns} returns); no ranked stats${process.argv.includes('--browser')?'; desktop/phone/landscape controls and guest polling':''}.`);
}finally{
  if(service&&service.exitCode===null){const exited=new Promise<void>(resolve=>service!.once('exit',()=>resolve()));if(process.platform==='win32'){const stop=spawn('taskkill',['/PID',String(service.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await new Promise<void>(resolve=>stop.once('exit',()=>resolve()));}else service.kill('SIGTERM');await Promise.race([exited,delay(5000)]);}
  await database.end();await pool.query(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`);await pool.end();
}
