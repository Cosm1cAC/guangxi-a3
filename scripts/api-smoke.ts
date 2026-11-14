import assert from 'node:assert/strict';
import {movesFor,isIdentity,power,id} from '../src/core/game';
const base=process.env.A3_API_BASE||'http://127.0.0.1:3001/api';
async function req(path:string,body?:unknown,token?:string){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
// ---- 账号：注册、重复邮箱、错误密码、资料与形象 ----
const run=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const mail=(n:string)=>`smoke-${run}-${n}@example.com`;
assert.equal((await req('/auth/config')).status,200);
assert.equal((await req('/auth/register',{email:'not-an-email',password:'12345678',name:'坏'})).status,400);
assert.equal((await req('/auth/register',{email:mail('x'),password:'short',name:'坏'})).status,400);
const tokens:string[]=[];
for(const[i,name]of['测试南','测试东','测试北','测试西'].entries()){const r=await req('/auth/register',{email:mail(String(i)),password:`pass-${run}-${i}`,name,avatar:{skin:i,hair:i,hairColor:i,eyes:i,top:i,pants:i,hat:i,extra:i%4}});assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.user.avatar.hat,i);assert(!('password_hash'in r.data.user));tokens.push(r.data.token);}
assert.equal((await req('/auth/register',{email:mail('0').toUpperCase(),password:'another-pass',name:'重复'})).status,409);
assert.equal((await req('/auth/login',{email:mail('0'),password:'wrong-password'})).status,401);
assert.equal((await req('/auth/login',{email:mail('nobody'),password:'wrong-password'})).status,401);
assert.equal((await req('/me')).status,401);
assert.equal((await req('/me',{avatar:{skin:99}},tokens[0])).status,400);
const dressed=await req('/me',{name:'换装南',avatar:{skin:2,hair:1,hairColor:3,eyes:1,top:4,pants:2,hat:5,extra:1}},tokens[0]);assert.equal(dressed.status,200);assert.equal(dressed.data.user.avatar.hat,5);
// ---- 房间：必须登录；座位按账号认领 ----
assert.equal((await req('/rooms',{})).status,401);
const room=await req('/rooms',{},tokens[0]);assert.equal(room.status,201);assert.equal(room.data.members[0].name,'换装南');assert.equal(room.data.members[0].avatar.hat,5);
const R=room.data.room;
// 开局前可离席再回来
assert.equal((await req(`/rooms/${R}/join`,{},tokens[1])).status,200);assert.equal((await req(`/rooms/${R}/leave`,{},tokens[1])).status,200);assert.equal((await req(`/rooms/${R}`,undefined,tokens[1])).status,403);
for(const t of tokens.slice(1)){const joined=await req(`/rooms/${R}/join`,{},t);assert.equal(joined.status,200);}
assert.equal((await req(`/rooms/${R}/leave`,{},tokens[1])).status,409);
assert.equal((await req(`/rooms/${R}`)).status,401);
// ---- 多端互通：同一账号在第二台设备登录，回到同一座位、同一手牌 ----
const phone=await req('/auth/login',{email:mail('2'),password:`pass-${run}-2`});assert.equal(phone.status,200);assert.notEqual(phone.data.token,tokens[2]);
const me=await req('/me',undefined,phone.data.token);assert.equal(me.data.activeRoom.id,R);
const [pcView,phoneView]=await Promise.all([req(`/rooms/${R}`,undefined,tokens[2]),req(`/rooms/${R}/join`,{},phone.data.token)]);
assert.equal(phoneView.status,200);assert.equal(phoneView.data.seat,2);assert.deepEqual(phoneView.data.hand,pcView.data.hand);
// ---- 扫码登录：电脑取票 → 手机（已登录）确认 → 电脑轮询拿到会话；票据一次性 ----
const scan=await req('/auth/scan/start',{origin:'http://localhost:5173'});
if(scan.status===200&&scan.data.mode==='mock'){
  assert(scan.data.url.includes('/?scan='+scan.data.ticket));assert(scan.data.qr.startsWith('<svg'));
  assert.equal((await req(`/auth/scan/poll?ticket=${scan.data.ticket}`)).data.status,'pending');
  assert.equal((await req('/auth/scan/confirm',{ticket:scan.data.ticket})).status,401);
  assert.equal((await req('/auth/scan/confirm',{ticket:scan.data.ticket},phone.data.token)).status,200);
  assert.equal((await req('/auth/scan/confirm',{ticket:scan.data.ticket},tokens[1])).status,410);
  const done=await req(`/auth/scan/poll?ticket=${scan.data.ticket}`);assert.equal(done.data.status,'done');assert.equal(done.data.user.name,'测试北');
  assert.equal((await req('/me',undefined,done.data.token)).status,200);
  assert.equal((await req(`/auth/scan/poll?ticket=${scan.data.ticket}`)).data.status,'expired');
  // 未登录的手机走模拟微信授权：同一设备始终是同一账号，之后可补绑邮箱
  const s2=await req('/auth/scan/start',{origin:'http://localhost:5173'}),dev=(run+'0'.repeat(32)).replace(/[^a-f0-9]/g,'a').slice(0,32);
  const wx=await req('/auth/scan/confirm',{ticket:s2.data.ticket,mock:{deviceId:dev,name:'微信牌友'}});assert.equal(wx.status,200);assert.equal(wx.data.user.wechat,true);assert.equal(wx.data.user.email,null);
  const wxPc=await req(`/auth/scan/poll?ticket=${s2.data.ticket}`);assert.equal(wxPc.data.user.id,wx.data.user.id);
  const s3=await req('/auth/scan/start',{origin:'http://localhost:5173'});const again=await req('/auth/scan/confirm',{ticket:s3.data.ticket,mock:{deviceId:dev,name:'换个名'}});assert.equal(again.data.user.id,wx.data.user.id);
  assert.equal((await req('/me/email',{email:mail('0'),password:'bind-pass-1'},wx.data.token)).status,409);
  const bound=await req('/me/email',{email:mail('wx'),password:'bind-pass-1'},wx.data.token);assert.equal(bound.status,200);
  assert.equal((await req('/auth/login',{email:mail('wx'),password:'bind-pass-1'})).data.user.id,wx.data.user.id);
}
assert.equal((await req('/auth/logout',{},phone.data.token)).status,200);assert.equal((await req('/me',undefined,phone.data.token)).status,401);
async function playOut(checkConcurrency:boolean){
  let turns=0,last:any;
  while(turns++<260){const r=await req(`/rooms/${R}`,undefined,tokens[0]);assert.equal(r.status,200);assert(!('hands'in r.data));assert(!('teams'in r.data));assert(!('userId'in r.data.members[0]));last=r.data;if(last.status==='finished')break;
    if(last.status==='tribute'){ // Every receiver explicitly chooses its own card; returning the original is legal.
      for(let seat=0;seat<4;seat++){const s=(await req(`/rooms/${R}`,undefined,tokens[seat])).data;const t=s.tribute.transfers.find((t:any)=>t.to===seat&&!t.returned);if(!t)continue;
        assert(t.card,'receiver sees its tribute card');const identity=s.hand.find((c:any)=>isIdentity(c));if(identity)assert.equal((await req(`/rooms/${R}/tribute`,{version:s.version,card:identity},tokens[seat])).status,422);const card=t.card;
        assert.equal((await req(`/rooms/${R}/actions`,{version:s.version,cards:[]},tokens[seat])).status,422);
        const ok=await req(`/rooms/${R}/tribute`,{version:s.version,card},tokens[seat]);assert.equal(ok.status,200,JSON.stringify(ok.data));}
      continue;}
    const seat=r.data.turn;const s=(await req(`/rooms/${R}`,undefined,tokens[seat])).data;const cards=movesFor(s.hand,s.last?.cards||null,s.first)[0]||[];
    if(checkConcurrency&&turns===1){const body={version:s.version,cards};const results=await Promise.all([req(`/rooms/${R}/actions`,body,tokens[seat]),req(`/rooms/${R}/actions`,body,tokens[seat])]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);}
    else{const played=await req(`/rooms/${R}/actions`,{version:s.version,cards},tokens[seat]);assert.equal(played.status,200,JSON.stringify(played.data));}
  }
  assert.equal(last.status,'finished');assert.equal(last.scores.reduce((a:number,b:number)=>a+b,0),0);assert.equal(last.totals.reduce((a:number,b:number)=>a+b,0),0);return {turns,last};
}
const first=await playOut(true);
// chat: auth, validation, throttle, ordering
assert.equal((await req(`/rooms/${R}/messages`,{text:'hi'})).status,401);
assert.equal((await req(`/rooms/${R}/messages`,{text:'x'.repeat(61)},tokens[1])).status,400);
assert.equal((await req(`/rooms/${R}/messages`,{text:'好牌！<b>'},tokens[1])).status,201);
assert.equal((await req(`/rooms/${R}/messages`,{text:'太快'},tokens[1])).status,429);
assert.equal((await req(`/rooms/${R}/messages`,{text:'再来一局'},tokens[2])).status,201);
const msgs=(await req(`/rooms/${R}/messages?after=0`,undefined,tokens[0])).data.messages;
assert.deepEqual(msgs.map((m:any)=>[m.seat,m.text]),[[1,'好牌！<b>'],[2,'再来一局']]);
assert.equal((await req(`/rooms/${R}/messages?after=${msgs[0].id}`,undefined,tokens[3])).data.messages.length,1);
// next round is idempotent and carries totals + tribute
const [n1,n2]=await Promise.all([req(`/rooms/${R}/next`,{},tokens[0]),req(`/rooms/${R}/next`,{},tokens[2])]);
assert.equal(n1.status,200);assert.equal(n2.status,200);assert.equal(n1.data.round,2);assert.equal(n2.data.round,2);
assert.deepEqual(n1.data.totals,first.last.totals);
const second=await playOut(false);assert.equal(second.last.round,2);
// 战绩随账号累计，积分榜可见
const after=await req('/me',undefined,tokens[0]);assert.equal(after.data.user.games,2);assert.equal(after.data.user.score,second.last.totals[0]);
const board=await req('/leaderboard');assert(board.data.top.length>0);assert(!('email'in board.data.top[0]));
console.log(`API PASS: accounts (register/login/profile/avatar), cross-device seat, scan login, 4 seats, privacy, auth, concurrent stale action, round 1 ${first.turns} turns, chat auth/validation/throttle, idempotent next round, tribute ${n1.data.tribute?.exempt??`${n1.data.tribute?.transfers.length??0} transfers`}, round 2 ${second.turns} turns, zero-sum totals ${JSON.stringify(second.last.totals)}. Room ${R}`);
