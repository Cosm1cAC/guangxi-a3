import 'dotenv/config';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {pool,schema} from '../server/db';
import {canReturnTribute,createGame,createNextGame,movesFor,tributeAction,type GameView,type Game,type TributeAction} from '../src/core/game';
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
type Remote=GameView&{room:string;roomStatus:string;members:{name:string;bot:boolean}[];canFillBots:boolean;rankedRound:boolean;replacedBot?:boolean};
try{
  await pool.query(`CREATE SCHEMA ${namespace}`);await database.query(schema);
  service=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs',import.meta.url)),'server/index.ts'],{cwd:fileURLToPath(new URL('..',import.meta.url)),windowsHide:true,env:{...process.env,DATABASE_URL:connection.href,PORT:String(port),SMTP_HOST:'',A3_PUBLIC_URL:'',A3_WECHAT_MOCK:'0',A3_RATE_LIMIT:'100000'},stdio:['ignore','pipe','pipe']});
  service.stdout?.on('data',chunk=>{logs+=chunk;});service.stderr?.on('data',chunk=>{logs+=chunk;});
  let ready=false;for(let i=0;i<100;i++){if(service.exitCode!==null)throw Error(logs);try{ready=(await req('/health')).status===200;}catch{}if(ready)break;await delay(100);}assert(ready,'Test server did not start');
  for(let i=0;i<5;i++){const username=`bots_${Date.now()}_${i}`,password='test-bots-password';const registered=ok(await req('/auth/register',{username,email:`${username}@example.com`,password,name:`牌友${i}`}),201);tokens.push(registered.token);users.push(registered.user);if(i===0)assert.equal(ok(await req('/auth/login',{identifier:username.toUpperCase(),password})).user.id,registered.user.id);}
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
    mixedRooms.push(waiting.room);
  }
  // Joining can claim a bot even when filling the empty seats wins the row lock first.
  const race=await room();ok(await req(`/rooms/${race.room}/join`,{},tokens[1]));
  const [filled,joined]=await Promise.all([req(`/rooms/${race.room}/fill-bots`,{},tokens[0]),req(`/rooms/${race.room}/join`,{},tokens[2])]);ok(filled);ok(joined);
  const raced:Remote=ok(await req(`/rooms/${race.room}`,undefined,tokens[0]));assert.equal(raced.members.length,4);assert.equal(raced.members.filter(m=>!m.bot).length,3);
  // The first remaining player becomes host after the original host leaves.
  const transfer=await room();ok(await req(`/rooms/${transfer.room}/join`,{},tokens[1]));ok(await req(`/rooms/${transfer.room}/leave`,{},tokens[0]));assert.equal(ok(await req(`/rooms/${transfer.room}`,undefined,tokens[1])).canFillBots,true);ok(await req(`/rooms/${transfer.room}/fill-bots`,{},tokens[1]));
  const full=await room();for(const token of tokens.slice(1,4))ok(await req(`/rooms/${full.room}/join`,{},token));assert.equal((await req(`/rooms/${full.room}/fill-bots`,{},tokens[0])).status,409);
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
  // Claiming a live bot seat preserves the entire game and changes only its owner/version.
  const takeover=await room();ok(await req(`/rooms/${takeover.room}/join`,{},tokens[1]));ok(await req(`/rooms/${takeover.room}/fill-bots`,{},tokens[0]));
  const putState=async(roomId:string,state:Game,status='playing')=>{await database.query('UPDATE rooms SET state=$2,status=$3 WHERE id=$1',[roomId,JSON.stringify(state),status]);};
  const storedRoom=async(roomId:string)=>(await database.query('SELECT * FROM rooms WHERE id=$1',[roomId])).rows[0];
  const live={...createGame(),first:false,turn:2,version:70};await putState(takeover.room,live);
  const before=await storedRoom(takeover.room),claimed:Remote=ok(await req(`/rooms/${takeover.room}/join`,{},tokens[2]));
  assert.equal(claimed.seat,2);assert.equal(claimed.replacedBot,true);assert.equal(claimed.turn,2);assert.deepEqual(claimed.hand,live.hands[2]);assert.equal(claimed.rankedRound,false);
  const after=await storedRoom(takeover.room);assert.deepEqual({...after.state,version:before.state.version},before.state);assert.deepEqual(after.members.slice(0,2),before.members.slice(0,2));assert.deepEqual(after.members[3],before.members[3]);assert.equal(after.members[2].userId,users[2].id);assert.equal(after.members[2].bot,false);
  assert.equal((await req(`/rooms/${takeover.room}/actions`,{version:live.version,cards:[]},tokens[0])).status,409);
  const resumed:Remote=ok(await req(`/rooms/${takeover.room}/join`,{},tokens[2]));assert.equal(resumed.seat,2);assert.equal(resumed.version,claimed.version);assert.equal(resumed.members.filter(m=>m.bot).length,1);
  const secondDevice=ok(await req('/auth/login',{identifier:users[2].username,password:'test-bots-password'}));assert.notEqual(secondDevice.token,tokens[2]);assert.equal(ok(await req(`/rooms/${takeover.room}/join`,{},secondDevice.token)).seat,2);
  ok(await req(`/rooms/${takeover.room}/actions`,{version:claimed.version,cards:movesFor(claimed.hand,null,false)[0]},tokens[2]));
  const claimRace=await Promise.all([req(`/rooms/${takeover.room}/join`,{},tokens[3]),req(`/rooms/${takeover.room}/join`,{},tokens[4])]);assert.deepEqual(claimRace.map(r=>r.status).sort(),[200,409]);const winner=claimRace[0].status===200?3:4,allHuman:Remote=ok(await req(`/rooms/${takeover.room}`,undefined,tokens[0]));assert.equal(allHuman.members.length,4);assert.equal(allHuman.members.filter(m=>m.bot).length,0);assert.equal(allHuman.rankedRound,false);
  const quick=(round:number):Game=>({...createGame(),round,first:false,turn:0,version:100+round,hands:[[{rank:4,suit:0}],[{rank:5,suit:0}],[{rank:6,suit:0}],[{rank:7,suit:0}]],teams:[1,1,0,0]});
  for(let round=1;round<=2;round++){
    await putState(takeover.room,quick(round));
    for(let seat=0;seat<2;seat++){const v:Remote=ok(await req(`/rooms/${takeover.room}`,undefined,tokens[seat]));ok(await req(`/rooms/${takeover.room}/actions`,{version:v.version,cards:v.hand},tokens[seat]));}
    const done:Remote=ok(await req(`/rooms/${takeover.room}`,undefined,tokens[0]));assert.equal(done.status,'finished');assert.equal(done.rankedRound,round===2);
    for(const i of [0,1,2,winner])assert.equal(ok(await req('/me',undefined,tokens[i])).user.games,round-1,'Only the next complete four-human round is ranked');
    if(round===1)assert.equal(ok(await req(`/rooms/${takeover.room}/next`,{},tokens[0])).rankedRound,true);
  }
  // Prefer a bot that still holds cards; if all bots finished, keep the finished seat.
  for(const allOut of [false,true]){const lobby=await room();ok(await req(`/rooms/${lobby.room}/join`,{},tokens[1]));ok(await req(`/rooms/${lobby.room}/fill-bots`,{},tokens[0]));const g=createGame();g.hands[2]=[];g.finishedNaturally=[2];g.order=[2];if(allOut){g.hands[3]=[];g.finishedNaturally.push(3);g.order.push(3);}await putState(lobby.room,g);const v:Remote=ok(await req(`/rooms/${lobby.room}/join`,{},tokens[2]));assert.equal(v.seat,allOut?2:3);assert.deepEqual(v.hand,g.hands[v.seat]);}
  // Claim during hidden RPS: the former robot no longer submits a gesture or return.
  const swap=await room();ok(await req(`/rooms/${swap.room}/join`,{},tokens[1]));ok(await req(`/rooms/${swap.room}/fill-bots`,{},tokens[0]));
  let duel=createNextGame({...createGame(),status:'finished',teams:[1,0,1,0],order:[0,2,1,3],finishedNaturally:[0,2],scores:[2,-2,2,-2]});
  const apply=(seat:number,action:TributeAction)=>{const result=tributeAction(duel,seat,action);if(!result.ok)throw Error(result.error);duel=result.state;};
  apply(0,{kind:'select',cards:[0,1]});apply(2,{kind:'select',cards:[1,2]});apply(0,{kind:'rps-start',opponent:2});await putState(swap.room,duel);
  const receiver:Remote=ok(await req(`/rooms/${swap.room}/join`,{},tokens[2]));assert.equal(receiver.seat,2);assert.equal(receiver.tribute!.selection!.duel!.ownMove,null);const d=receiver.tribute!.selection!.duel!;
  ok(await req(`/rooms/${swap.room}/tribute-choice`,{version:receiver.version,round:receiver.round,action:{kind:'rps',move:'rock',round:d.round,duelId:d.id}},tokens[0]));
  const pending:Remote=ok(await req(`/rooms/${swap.room}`,undefined,tokens[2]));assert.equal(pending.tribute!.selection!.duel!.ownMove,null);assert.deepEqual(pending.tribute!.selection!.duel!.submitted,[0]);
  ok(await req(`/rooms/${swap.room}/tribute-choice`,{version:pending.version,round:pending.round,action:{kind:'rps',move:'scissors',round:d.round,duelId:d.id}},tokens[2]));
  const reselect:Remote=ok(await req(`/rooms/${swap.room}`,undefined,tokens[2]));ok(await req(`/rooms/${swap.room}/tribute-choice`,{version:reselect.version,round:reselect.round,action:{kind:'select',cards:[2,3]}},tokens[2]));const returning:Remote=ok(await req(`/rooms/${swap.room}`,undefined,tokens[2]));assert.equal(returning.pendingReturns,2);
  const sender:Remote=ok(await req(`/rooms/${swap.room}`,undefined,tokens[0]));ok(await req(`/rooms/${swap.room}/tribute`,{version:sender.version,card:sender.hand.find(canReturnTribute)},tokens[0]));assert.equal(ok(await req(`/rooms/${swap.room}`,undefined,tokens[2])).pendingReturns,2);
  const between=await room();ok(await req(`/rooms/${between.room}/fill-bots`,{},tokens[0]));const finished={...quick(1),status:'finished' as const,order:[0,1,2,3],scores:[2,2,-2,-2]};await putState(between.room,finished,'finished');const joinedBetween:Remote=ok(await req(`/rooms/${between.room}/join`,{},tokens[1]));assert.equal(joinedBetween.roomStatus,'finished');assert.deepEqual(joinedBetween.hand,finished.hands[joinedBetween.seat]);assert.equal(ok(await req(`/rooms/${between.room}/next`,{},tokens[0])).round,2);
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
      for(const size of [{width:1440,height:900},{width:390,height:844},{width:844,height:390},{width:320,height:568}]){await host.setViewportSize(size);const box=(await host.locator('#fill-bots').boundingBox())!;assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=size.width&&box.y+box.height<=size.height);assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const share=(await host.locator('#share-room').boundingBox())!;assert(share.x>=0&&share.x+share.width<=size.width);await host.screenshot({path:`artifacts/room-bots-${size.width}.png`});}
      await host.locator('#fill-bots').click();await host.locator('#room-waiting').waitFor({state:'hidden'});await guest.locator('#room-waiting').waitFor({state:'hidden'});assert.equal(await host.locator('.bot-badge').count(),2);assert.equal(await guest.locator('.bot-badge').count(),2);assert((await guest.locator('#footer-state').textContent())?.includes('不计账号排行'));
      await guest.reload();await guest.locator('#room-waiting').waitFor({state:'hidden'});await guest.locator('.bot-badge').first().waitFor();assert.equal(await guest.locator('.bot-badge').count(),2);
      await host.setViewportSize({width:390,height:844});await host.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async function(text){window.copiedInvite=text;}}});Object.defineProperty(navigator,'share',{configurable:true,value:async function(data){window.sharedInvite=data;}});");await host.locator('#share-room').click();const link=await host.locator('#invite-url').inputValue();assert.equal(link,`https://a3.vibelink.cloud/go/?room=${waiting.room}`);assert.deepEqual([...new URL(link).searchParams.keys()],['room']);await host.locator('#invite-copy').click();assert.equal(await host.evaluate(()=>(window as any).copiedInvite),link);await host.locator('#invite-native').click();assert.equal((await host.evaluate(()=>(window as any).sharedInvite)).url,link);await host.screenshot({path:'artifacts/room-share-mobile.png'});await host.getByRole('button',{name:'关闭',exact:true}).click();
      const entrantContext=await browser.newContext({viewport:{width:390,height:844}});await entrantContext.addInitScript(({token,user,oldRoom})=>{localStorage.setItem('a3-session',JSON.stringify({token,user}));localStorage.setItem('a3-room',oldRoom);const original=HTMLCanvasElement.prototype.getContext;Object.defineProperty(HTMLCanvasElement.prototype,'getContext',{value:function(type:string,...args:any[]){return type.startsWith('webgl')?null:Reflect.apply(original,this,[type,...args]);}});},{token:tokens[2],user:users[2],oldRoom:takeover.room});
      const entrant=await entrantContext.newPage();await entrant.goto(base+'/?room='+waiting.room.toLowerCase());await entrant.locator('#me').waitFor();assert.equal(await entrant.locator('.bot-badge').count(),1);assert.equal(await entrant.evaluate(()=>localStorage.getItem('a3-room')),waiting.room);assert.equal(new URL(entrant.url()).searchParams.has('room'),false);
      await host.waitForFunction(()=>document.querySelectorAll('.bot-badge').length===1);await guest.waitForFunction(()=>document.querySelectorAll('.bot-badge').length===1);assert((await entrant.locator('#footer-state').textContent())?.includes('不计账号排行'));await entrant.screenshot({path:'artifacts/room-bot-takeover-mobile.png'});
      const fresh=await browser.newContext({viewport:{width:390,height:844}});await fresh.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;Object.defineProperty(HTMLCanvasElement.prototype,'getContext',{value:function(type:string,...args:any[]){return type.startsWith('webgl')?null:Reflect.apply(original,this,[type,...args]);}});});const login=await fresh.newPage();let joinAttempts=0;login.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/join'))joinAttempts++;});
      await login.goto(base+'/?room='+waiting.room);await login.locator('#au-email').waitFor();assert.equal(joinAttempts,0);assert((await login.locator('.invite-context').textContent())?.includes(waiting.room));await login.evaluate(()=>history.replaceState(null,'','/'));await login.reload();await login.locator('#au-email').waitFor();assert.equal(joinAttempts,0);assert.equal(await login.evaluate(()=>sessionStorage.getItem('a3-room-invite')),waiting.room);await login.screenshot({path:'artifacts/room-invite-login-mobile.png'});
      await login.locator('#au-email').fill(users[3].username);await login.locator('#au-pass').fill('wrong-password');await login.locator('#au-submit').click();await login.waitForFunction(()=>document.querySelector('#au-error')!.textContent!.length>0);assert.equal(joinAttempts,0);await login.locator('#au-pass').fill('test-bots-password');await login.locator('#au-submit').click();await login.locator('#me').waitFor();assert.equal(joinAttempts,1);assert.equal(await login.evaluate(()=>sessionStorage.getItem('a3-room-invite')),null);await host.waitForFunction(()=>document.querySelectorAll('.bot-badge').length===0);await guest.waitForFunction(()=>document.querySelectorAll('.bot-badge').length===0);assert((await login.locator('#footer-state').textContent())?.includes('不计账号排行'));
      const expired=await browser.newContext({viewport:{width:390,height:844}});await expired.addInitScript(user=>{localStorage.setItem('a3-session',JSON.stringify({token:'expired-token',user}));const original=HTMLCanvasElement.prototype.getContext;Object.defineProperty(HTMLCanvasElement.prototype,'getContext',{value:function(type:string,...args:any[]){return type.startsWith('webgl')?null:Reflect.apply(original,this,[type,...args]);}});},users[4]);const fullPage=await expired.newPage();await fullPage.goto(base+'/?room='+waiting.room);await fullPage.locator('#au-email').waitFor();await fullPage.locator('#au-email').fill(users[4].username);await fullPage.locator('#au-pass').fill('test-bots-password');await fullPage.locator('#au-submit').click();await fullPage.locator('#invite-error').waitFor();assert((await fullPage.locator('#invite-error').textContent())?.includes('房间已满'));assert.equal(await fullPage.evaluate(()=>sessionStorage.getItem('a3-room-invite')),waiting.room);await fullPage.locator('#invite-cancel').click();assert.equal(await fullPage.evaluate(()=>sessionStorage.getItem('a3-room-invite')),null);await fullPage.goto(base+'/?room=bad%26token%3Dsecret');await fullPage.locator('#toast.visible').filter({hasText:'邀请链接无效'}).waitFor();
    }finally{await browser.close();}
  }
  console.log(`PASS: account login; 1/2/3-human fill; host permissions; bot persistence; join/fill race; live takeover preserves state; last-seat race; rejoin; bot stops automating claimed seat; RPS/return/between-round takeover; active/out seat preference; mixed round unranked, next all-human round ranked; 2 rounds (${moves} human actions, ${returns} returns)${process.argv.includes('--browser')?'; responsive controls; fixed-domain share/copy; logged-in invite priority; login-required/reload/wrong-password/expired-session/full-room/invalid-link invitation flows; live member polling':''}.`);
}finally{
  if(service&&service.exitCode===null){const exited=new Promise<void>(resolve=>service!.once('exit',()=>resolve()));if(process.platform==='win32'){const stop=spawn('taskkill',['/PID',String(service.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await new Promise<void>(resolve=>stop.once('exit',()=>resolve()));}else service.kill('SIGTERM');await Promise.race([exited,delay(5000)]);}
  await database.end();await pool.query(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`);await pool.end();
}
