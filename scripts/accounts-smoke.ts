// 隔离 PostgreSQL schema + 本机 SMTP 收件器；不会使用玩家账号或向外发邮件。
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import express from 'express';
import pg from 'pg';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { createPresence } from '../server/presence';

const admin = new pg.Client({connectionString:process.env.DATABASE_URL});
const namespace = `a3_accounts_test_${randomBytes(8).toString('hex')}`;
const messages: string[] = [];
const smtp = net.createServer(socket => {
  socket.write('220 localhost test SMTP\r\n');
  let buffer='', data=false, message='';
  socket.on('data', chunk => {
    buffer += chunk.toString();
    let end: number;
    while ((end=buffer.indexOf('\r\n'))>=0) {
      const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
      if(data){if(line==='.') {messages.push(message);message='';data=false;socket.write('250 accepted\r\n');}else message+=line+'\r\n';continue;}
      if(/^DATA/i.test(line)){data=true;socket.write('354 end with dot\r\n');}
      else if(/^QUIT/i.test(line))socket.end('221 bye\r\n');
      else socket.write('250 OK\r\n');
    }
  });
});
await new Promise<void>(r=>smtp.listen(0,'127.0.0.1',r));
process.env.SMTP_HOST='127.0.0.1';process.env.SMTP_PORT=String((smtp.address() as net.AddressInfo).port);
process.env.SMTP_USER='';process.env.SMTP_PASS='';process.env.SMTP_FROM='test@example.invalid';
const connection=new URL(process.env.DATABASE_URL!);connection.searchParams.set('options',`-c search_path=${namespace}`);process.env.DATABASE_URL=connection.href;
let pool: pg.Pool | undefined, server: ReturnType<express.Express['listen']> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await admin.connect();await admin.query(`CREATE SCHEMA ${namespace}`);
  const db=await import('../server/db');pool=db.pool;await pool.query(db.schema);
  const {auth,userOf}=await import('../server/auth');
  const app=express();app.use(express.json());app.use('/api',auth);
  const presence=createPresence(20);
  app.post('/api/presence',async(req,res)=>res.json(presence.touch(req.body.visitorId,(await userOf(req))?.id)));
  app.use(express.static(resolve('dist')));
  server=await new Promise<ReturnType<express.Express['listen']>>(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
  const base=`http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  const req=async(path:string,body?:unknown,token?:string)=>{
    const response=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json()};
  };
  const password='Accounts-test-pass-7';
  const registered=await req('/auth/register',{username:'Pixel_User',email:'player@example.invalid',password,name:'牌桌昵称'});
  assert.equal(registered.status,201);assert.equal(registered.data.user.username,'pixel_user');assert.equal(registered.data.user.name,'牌桌昵称');assert.equal(registered.data.user.emailVerified,false);
  const token=registered.data.token;
  for(const identifier of ['PIXEL_USER','PLAYER@example.invalid']){
    const login=await req('/auth/login',{identifier,password});assert.equal(login.status,200);assert.equal(login.data.user.id,registered.data.user.id);assert.equal(login.data.user.name,'牌桌昵称');
  }
  assert.equal((await req('/auth/login',{identifier:'pixel_user',password:'wrong-password'})).status,401);
  assert.equal((await req('/auth/register',{username:'PIXEL_USER',email:'another@example.invalid',password,name:'其他'})).status,409);
  assert.equal((await req('/auth/register',{username:'different_user',email:'PLAYER@example.invalid',password,name:'其他'})).status,409);
  const renamed=await req('/me',{name:'新牌桌昵称'},token);assert.equal(renamed.data.user.username,'pixel_user');assert.equal(renamed.data.user.email,'player@example.invalid');assert.equal(renamed.data.user.name,'新牌桌昵称');
  assert.equal((await req('/me',{username:'rename_forbidden'},token)).status,409);
  const legacy=await req('/auth/register',{email:'legacy@example.invalid',password,name:'老玩家'});assert.equal(legacy.status,201);assert.equal(legacy.data.user.username,null);
  assert.equal((await req('/me',{username:'pixel_user'},legacy.data.token)).status,409);
  const claimed=await req('/me',{username:'Legacy_Player'},legacy.data.token);assert.equal(claimed.data.user.username,'legacy_player');assert.equal(claimed.data.user.name,'老玩家');
  assert.equal((await req('/auth/login',{identifier:'LEGACY_PLAYER',password})).data.user.id,legacy.data.user.id);
  assert.equal((await req('/auth/email/code',{email:'player@example.invalid'})).status,200);
  const raw=messages.at(-1)!;
  const decoded=raw.replace(/=\?UTF-8\?B\?([^?]+)\?=/gi,(_,s)=>Buffer.from(s,'base64').toString('utf8'));
  const code=decoded.match(/验证码\s+(\d{6})/)?.[1] || raw.split('\r\n\r\n').slice(1).join('\n').match(/\b(\d{6})\b/)?.[1];
  assert(code,'SMTP fixture received verification code');
  assert.equal((await req('/me/email/verify',{code},token)).data.user.emailVerified,true);
  assert.equal((await req('/me/email/verify',{code},token)).status,400);
  assert.equal((await req('/auth/login',{email:'player@example.invalid',password})).data.user.emailVerified,true);
  assert.equal((await req('/auth/logout',{},token)).status,200);assert.equal((await req('/me',undefined,token)).status,401);
  console.log('API PASS: optional verification with SMTP enabled; username/email login; unique names; nickname separation; legacy username claim; SMTP receipt and one-use verification; logout.');

  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});const failures:string[]=[];page.on('pageerror',e=>failures.push(e.message));
  await page.goto(base);await page.locator('#account').click();assert.equal(await page.locator('#scan-box,[data-tab="scan"]').count(),0);
  await page.locator('#au-switch').click();await page.locator('#au-username').fill('browser_player');await page.locator('#au-email').fill('browser@example.invalid');await page.locator('#au-pass').fill(password);await page.locator('#au-name').fill('方块牌友');
  await page.locator('#au-code-row').waitFor({state:'visible'});await page.locator('#au-submit').click();await page.locator('#account').filter({hasText:'方块牌友'}).waitFor();
  await page.locator('#account').click();assert((await page.locator('#dialog').innerText()).includes('browser_player'));assert((await page.locator('#dialog').innerText()).includes('未验证，可正常登录'));
  await page.locator('#pf-name').fill('独立昵称');await page.locator('#pf-save').click();await page.locator('#pf-name').filter({visible:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#account')?.textContent?.includes('独立昵称'));
  await page.locator('#pf-logout').click();await page.locator('#account').click();await page.locator('#au-email').fill('BROWSER_PLAYER');await page.locator('#au-pass').fill(password);await page.locator('#au-submit').click();
  await page.waitForFunction(()=>document.querySelector('#account')?.textContent?.includes('独立昵称'));
  await page.locator('#server-presence').filter({hasText:/在线 \d+\/20/}).waitFor();
  await page.screenshot({path:'artifacts/account-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.locator('#account').click();await page.screenshot({path:'artifacts/account-mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(failures,[]);
  console.log('BROWSER PASS: no scan page; registration without verification; username login; distinct nickname/profile; online/capacity display; desktop/mobile layout.');
} finally {
  await browser?.close();if(server)await new Promise<void>(r=>server!.close(()=>r()));
  await pool?.end();
  // namespace 只由固定前缀与本地随机十六进制组成，仅删除本测试创建的 schema。
  if(/^a3_accounts_test_[a-f0-9]{16}$/.test(namespace))await admin.query(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`).catch(()=>{});
  await admin.end();await new Promise<void>(r=>smtp.close(()=>r()));
}
