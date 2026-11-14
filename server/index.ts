import express from 'express';
import { randomBytes, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {pool} from './db';
import {auth,userOf,requireUser,lanAddresses,type User} from './auth';
import {BOT_AVATARS,DEFAULT_AVATAR,type Avatar} from '../src/core/avatar';
import {createGame,createNextGame,act,returnTribute,tributeAction,botTributeAction,view,legalMoves,type Game} from '../src/core/game';

const app=express();app.disable('x-powered-by');app.set('trust proxy','loopback');app.use(express.json({limit:'8kb'}));
type Member={userId:number|null;name:string;avatar:Avatar;bot:boolean};
type Room={id:string;state:Game;members:Member[];status:'waiting'|'playing'|'finished'};
const createSchema=z.object({practice:z.boolean().default(false)});
const actionSchema=z.object({version:z.number().int().nonnegative(),cards:z.array(z.object({rank:z.number().int().min(2).max(14),suit:z.number().int().min(0).max(3)})).max(5)});
const limits=new Map<string,{count:number;until:number}>();
const RATE_LIMIT=Number(process.env.A3_RATE_LIMIT)||600; // requests per IP per minute
// 经 Cloudflare Tunnel 进来的请求来自本机 cloudflared，真实访客 IP 在 CF-Connecting-IP；只有本机连接才信任这个头。
const loopback=(a:string|undefined)=>!!a&&/^(127\.|::1$|::ffff:127\.)/.test(a);
const clientIp=(req:express.Request)=>{const cf=req.headers['cf-connecting-ip'];return (loopback(req.socket.remoteAddress)&&typeof cf==='string'&&cf)||req.ip||'local';};
app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"frame-ancestors 'none'");if(process.env.A3_PUBLIC_URL?.startsWith('https://'))res.setHeader('Strict-Transport-Security','max-age=15552000');next();});
// 安卓应用的页面打包在安装包内，来源是 https://localhost；接口用 Bearer 令牌而非 Cookie，放行这些来源不会带出任何登录态。
const APP_ORIGINS=new Set(['https://localhost','http://localhost','capacitor://localhost']);
app.use('/api',(req,res,next)=>{const o=req.headers.origin;if(o&&APP_ORIGINS.has(o)){res.setHeader('Access-Control-Allow-Origin',o);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-A3-Client');res.setHeader('Access-Control-Allow-Methods','GET, POST');res.setHeader('Access-Control-Max-Age','86400');}if(req.method==='OPTIONS')return void res.sendStatus(204);next();});
// 公网模式下记录访问日志（不含请求体与令牌），便于排查隧道问题；轮询请求只记慢的或出错的。
if(process.env.A3_PUBLIC_URL)app.use('/api',(req,res,next)=>{const t=Date.now();res.on('finish',()=>{const ms=Date.now()-t;if(req.method!=='GET'||res.statusCode>=400||ms>500)console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${ms}ms ${clientIp(req)}`);});next();});
app.use('/api',(req,res,next)=>{const key=clientIp(req),now=Date.now();Object.defineProperty(req,'ip',{value:key,configurable:true});if(limits.size>10000)for(const[k,v]of limits)if(v.until<now)limits.delete(k);let v=limits.get(key);if(!v||v.until<now){v={count:0,until:now+60000};limits.set(key,v);}if(++v.count>RATE_LIMIT)return void res.status(429).json({error:'请求太频繁，请稍后再试'});next();});
const output=(r:Room,seat:number)=>({...view(r.state,seat),room:r.id,roomStatus:r.status,members:r.members.map(m=>({name:m.name,bot:m.bot,avatar:m.avatar||DEFAULT_AVATAR}))});
const member=(u:User):Member=>({userId:u.id,name:u.name,avatar:u.avatar,bot:false});
function bots(r:Room){
  let count=0;
  while(r.state.status==='tribute'&&count++<40){const seat=r.members.findIndex((m,i)=>m.bot&&m.userId===null&&botTributeAction(r.state,i));if(seat<0)break;const result=tributeAction(r.state,seat,botTributeAction(r.state,seat,()=>randomInt(0,0x100000000)/0x100000000)!);if(!result.ok)throw Error('BOT_INVALID');r.state=result.state;}
  while(r.state.status==='playing'&&r.members[r.state.turn]?.bot&&r.members[r.state.turn]?.userId===null&&count++<500){const result=act(r.state,r.state.turn,legalMoves(r.state,r.state.turn)[0]||[]);if(!result.ok)throw Error('BOT_INVALID');r.state=result.state;}
  if(r.state.status==='finished')r.status='finished';
}
// 座位按账号认领：同一账号在任何设备登录，都是同一个座位。
const seatOf=(r:Room|undefined,user:User|null)=>r&&user?r.members.findIndex(m=>m.userId===user.id):-1;
/** Lock a room row, authorise the caller, run `fn`, persist and respond. */
async function mutate(req:express.Request,res:express.Response,next:express.NextFunction,fn:(r:Room,seat:number,fail:(s:number,e:string)=>Promise<void>)=>Promise<boolean|void>){
  let client;try{const user=await userOf(req);if(!user)return void res.status(401).json({error:'请先登录'});
    client=await pool.connect();await client.query('BEGIN');const row=await client.query('SELECT * FROM rooms WHERE id=$1 FOR UPDATE',[req.params.id]);const r=row.rows[0] as Room|undefined;const seat=seatOf(r,user);
    let failed=false;const fail=async(status:number,error:string)=>{failed=true;await client!.query('ROLLBACK');res.status(status).json({error});};
    if(!r||seat<0)return await fail(403,'你不在这个房间里');
    await fn(r,seat,fail);if(failed)return;
    await client.query('UPDATE rooms SET state=$2,status=$3,updated_at=now() WHERE id=$1',[r.id,JSON.stringify(r.state),r.status]);
    if(r.state.status==='finished'){
      const saved=await client.query('INSERT INTO match_results(room_id,round,scores,ranking) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[r.id,r.state.round||1,JSON.stringify(r.state.scores),JSON.stringify(r.state.order)]);
      // 战绩只记四位真人的牌桌，且每局只记一次
      if(saved.rowCount&&r.members.every(m=>m.userId))for(const[i,m]of r.members.entries())await client.query('UPDATE users SET games=games+1,wins=wins+$2,score=score+$3 WHERE id=$1',[m.userId,r.state.scores[i]>0?1:0,r.state.scores[i]]);
    }
    await client.query('COMMIT');res.json(output(r,seat));
  }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});next(e);}finally{client?.release();}
}
app.get('/api/health',async(_req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true,database:'postgresql'});}catch{res.status(503).json({error:'PostgreSQL 未连接，请启动数据库并执行迁移'});}});
app.use('/api',auth);
app.post('/api/rooms',requireUser(async(req,res,user)=>{
  const parsed=createSchema.safeParse(req.body??{});if(!parsed.success)return void res.status(400).json({error:'开房请求格式不正确'});
  const members:Member[]=[member(user)];
  if(parsed.data.practice)['阿桂','小漓','老邕'].forEach((name,i)=>members.push({userId:null,name,avatar:BOT_AVATARS[i],bot:true}));
  const r:Room={id:randomBytes(5).toString('hex').toUpperCase(),state:createGame(()=>randomInt(0,0x100000000)/0x100000000),members,status:members.length===4?'playing':'waiting'};
  if(r.status==='playing')bots(r);
  await pool.query('INSERT INTO rooms(id,state,members,status) VALUES($1,$2,$3,$4)',[r.id,JSON.stringify(r.state),JSON.stringify(members),r.status]);
  res.status(201).json(output(r,0));
}));
// 加入房间；已在房内（例如换了一台设备）则直接回到原座位。
app.post('/api/rooms/:id/join',requireUser(async(req,res,user)=>{
  const client=await pool.connect();
  try{await client.query('BEGIN');const row=await client.query('SELECT * FROM rooms WHERE id=$1 FOR UPDATE',[req.params.id]);const r=row.rows[0] as Room|undefined;
    let seat=seatOf(r,user);
    if(r&&seat>=0){await client.query('ROLLBACK');return void res.json(output(r,seat));}
    if(!r||r.status!=='waiting'||r.members.length>=4){await client.query('ROLLBACK');return void res.status(409).json({error:'房间不存在、已满或已开始'});}
    seat=r.members.length;r.members.push(member(user));if(r.members.length===4)r.status='playing';
    await client.query('UPDATE rooms SET members=$2,status=$3,updated_at=now() WHERE id=$1',[r.id,JSON.stringify(r.members),r.status]);await client.query('COMMIT');res.json(output(r,seat));
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
}));
// 开局前可离席；牌局开始后座位保留，任何设备登录同一账号都能回来。
app.post('/api/rooms/:id/leave',requireUser(async(req,res,user)=>{
  const client=await pool.connect();
  try{await client.query('BEGIN');const row=await client.query('SELECT * FROM rooms WHERE id=$1 FOR UPDATE',[req.params.id]);const r=row.rows[0] as Room|undefined;const seat=seatOf(r,user);
    if(!r||seat<0||r.status!=='waiting'){await client.query('ROLLBACK');return void res.status(409).json({error:'牌局已开始，座位会为你保留'});}
    r.members.splice(seat,1);
    if(r.members.length)await client.query('UPDATE rooms SET members=$2,updated_at=now() WHERE id=$1',[r.id,JSON.stringify(r.members)]);else await client.query('DELETE FROM rooms WHERE id=$1',[r.id]);
    await client.query('COMMIT');res.json({ok:true});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
}));
app.get('/api/rooms/:id',requireUser(async(req,res,user)=>{const row=await pool.query('SELECT * FROM rooms WHERE id=$1',[req.params.id]);const r=row.rows[0] as Room|undefined;const seat=seatOf(r,user);if(!r||seat<0)return void res.status(403).json({error:'你不在这个房间里'});res.json(output(r,seat));}));
app.post('/api/rooms/:id/actions',(req,res,next)=>{
  const parsed=actionSchema.safeParse(req.body);if(!parsed.success)return void res.status(400).json({error:'出牌请求格式不正确'});
  void mutate(req,res,next,async(r,seat,fail)=>{
    if(r.status!=='playing')return fail(409,'请等待四人到齐或重新开局');
    if(parsed.data.version!==r.state.version)return fail(409,'牌局已更新，请重试');
    const result=act(r.state,seat,parsed.data.cards);if(!result.ok)return fail(422,result.error);r.state=result.state;bots(r);
  });
});
const tributeSchema=z.object({version:z.number().int().nonnegative(),card:z.object({rank:z.number().int().min(2).max(14),suit:z.number().int().min(0).max(3)})});
app.post('/api/rooms/:id/tribute',(req,res,next)=>{
  const parsed=tributeSchema.safeParse(req.body);if(!parsed.success)return void res.status(400).json({error:'还贡请求格式不正确'});
  void mutate(req,res,next,async(r,seat,fail)=>{
    if(parsed.data.version!==r.state.version)return fail(409,'牌局已更新，请重试');
    const result=returnTribute(r.state,seat,parsed.data.card);if(!result.ok)return fail(422,result.error);r.state=result.state;bots(r);
  });
});
const tributeChoiceSchema=z.object({version:z.number().int().nonnegative(),round:z.number().int().positive(),action:z.discriminatedUnion('kind',[
  z.object({kind:z.literal('select'),cards:z.array(z.number().int().min(0).max(5)).min(1).max(6)}),
  z.object({kind:z.literal('rps-start'),opponent:z.number().int().min(0).max(3)}),
  z.object({kind:z.literal('rps'),move:z.enum(['rock','paper','scissors']),round:z.number().int().positive(),duelId:z.number().int().nonnegative()})
])});
app.post('/api/rooms/:id/tribute-choice',(req,res,next)=>{
  const parsed=tributeChoiceSchema.safeParse(req.body);if(!parsed.success)return void res.status(400).json({error:'贡牌预选请求格式不正确'});
  void mutate(req,res,next,async(r,seat,fail)=>{
    if(r.status!=='playing'||parsed.data.round!==(r.state.round||1))return fail(409,'牌局已更新，请重新选择');
    // Independent pre-selections and hidden gestures merge under the room row lock.
    if(parsed.data.version>r.state.version)return fail(409,'牌局版本不正确');
    const result=tributeAction(r.state,seat,parsed.data.action);if(!result.ok)return fail(422,result.error);r.state=result.state;bots(r);
  });
});
// Next round: idempotent — whoever asks first deals; later callers just get the new state.
app.post('/api/rooms/:id/next',(req,res,next)=>{
  void mutate(req,res,next,async r=>{
    if(r.status!=='finished')return;
    r.state=createNextGame(r.state,()=>randomInt(0,0x100000000)/0x100000000);r.status='playing';bots(r);
  });
});

// ---------------- 茶亭闲话 (room chat) ----------------
const chatSchema=z.object({text:z.string().trim().min(1).max(60)});
const lastChat=new Map<string,number>();
app.get('/api/rooms/:id/messages',requireUser(async(req,res,user)=>{
  const row=await pool.query('SELECT id,members FROM rooms WHERE id=$1',[req.params.id]);const r=row.rows[0] as Room|undefined;if(!r||seatOf(r,user)<0)return void res.status(403).json({error:'你不在这个房间里'});
  const after=Math.max(0,Number(req.query.after)||0);
  const m=await pool.query('SELECT * FROM (SELECT id,seat,name,body,created_at FROM room_messages WHERE room_id=$1 AND id>$2 ORDER BY id DESC LIMIT 50) m ORDER BY id',[req.params.id,after]);
  res.json({messages:m.rows.map(x=>({id:Number(x.id),seat:x.seat,name:x.name,text:x.body,at:x.created_at}))});
}));
app.post('/api/rooms/:id/messages',requireUser(async(req,res,user)=>{
  const parsed=chatSchema.safeParse(req.body);if(!parsed.success)return void res.status(400).json({error:'消息需为 1–60 字'});
  const text=parsed.data.text.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g,'').trim();if(!text)return void res.status(400).json({error:'消息不能为空'});
  const row=await pool.query('SELECT id,members FROM rooms WHERE id=$1',[req.params.id]);const r=row.rows[0] as Room|undefined;const seat=seatOf(r,user);if(!r||seat<0)return void res.status(403).json({error:'你不在这个房间里'});
  const key=`${r.id}:${seat}`,now=Date.now();if(now-(lastChat.get(key)||0)<800)return void res.status(429).json({error:'说得太快啦，喝口茶再聊'});lastChat.set(key,now);if(lastChat.size>20000)lastChat.clear();
  const m=await pool.query('INSERT INTO room_messages(room_id,seat,name,body) VALUES($1,$2,$3,$4) RETURNING id,created_at',[r.id,seat,r.members[seat].name,text]);
  res.status(201).json({id:Number(m.rows[0].id),seat,name:r.members[seat].name,text,at:m.rows[0].created_at});
}));
app.use(express.static(fileURLToPath(new URL('../dist',import.meta.url))));
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  console.error(error instanceof Error?error.message:'server error');
  if(error&&typeof error==='object'&&'wechat'in error)return void res.status(502).json({error:'微信接口调用失败，请检查 AppID / Secret 与网络'});
  res.status(503).json({error:'服务暂不可用，请检查 PostgreSQL 与数据库迁移'});
});
const PORT=Number(process.env.PORT||3001);
const server=app.listen(PORT,'0.0.0.0',()=>{console.log(`A3 API http://localhost:${PORT}`);for(const ip of lanAddresses())console.log(`  局域网（手机 / 小程序）: http://${ip}:${PORT}`);});
process.on('SIGTERM',()=>server.close(()=>void pool.end()));
