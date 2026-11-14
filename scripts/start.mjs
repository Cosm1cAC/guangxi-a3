import { spawn, spawnSync } from 'node:child_process';
import { existsSync, copyFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { cpolarConfig, cpolarArgs, cpolarEnvironment, cpolarPublicUrl } from './cpolar.mjs';
import { ENTRY_URL, publishEntryTarget, prepareEntryTunnel } from './entry.mjs';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const smoke = process.argv.includes('--smoke-test');
const noBrowser = smoke || process.argv.includes('--no-browser');
// --public：公网模式。不启动开发服务器，由 API 进程直接提供构建好的网页，并通过 Cloudflare Tunnel 暴露到公网域名。
const publicMode = process.argv.includes('--public');
const directMode = process.argv.includes('--direct');
const cpolarMode = process.argv.includes('--cpolar');
const productionMode = publicMode || directMode || cpolarMode;
if([publicMode,directMode,cpolarMode].filter(Boolean).length>1)throw new Error('--public、--direct、--cpolar 只能选择一个。');
const TUNNEL_DIR = '.local/cloudflared';
const windows = process.platform === 'win32';
const children = [];
let stopping = false;
let nativeDatabase = null;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = message => console.log(`\n[A3] ${message}`);

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true, ...options });
    children.push(child);
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} 执行失败（退出码 ${code}），请查看上方输出。`)));
  });
}
const npm = args => windows
  ? run(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'npm.cmd', ...args])
  : run('npm', args);
function npmInstalled() {
  const result = windows
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'npm.cmd', 'ls', '--depth=0'], { stdio: 'ignore', windowsHide: true, timeout: 30000 })
    : spawnSync('npm', ['ls', '--depth=0'], { stdio: 'ignore', timeout: 30000 });
  return result.status === 0;
}
async function waitFor(check, timeout, message) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(1000);
  }
  throw new Error(message);
}
async function canBind(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)));
  });
}
async function healthy(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    const data = await response.json();
    return response.ok && data.ok && data.database === 'postgresql';
  } catch { return false; }
}
async function webReady(webPort = 5173) {
  try {
    const response = await fetch(`http://127.0.0.1:${webPort}`, { signal: AbortSignal.timeout(1500) });
    return response.ok && (await response.text()).includes('山水尖3');
  } catch { return false; }
}
function openBrowser(url = 'http://localhost:5173') {
  if (noBrowser) return;
  if (!/^https?:\/\/[a-z0-9.:-]+$/i.test(url)) return;
  // Fixed arguments only; never interpolate project paths into a shell command.
  const child = windows
    ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process '${url}'`], { windowsHide: true, stdio: 'ignore' })
    : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' });
  child.on('error', () => log(`无法自动打开浏览器，请手动访问 ${url} 。`));
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (windows) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill('SIGTERM');
  }
  if (nativeDatabase) {
    try { await nativeDatabase.stop(); }
    catch (error) { console.error(`PostgreSQL 停止失败：${error.message}`); code = 1; }
  }
  process.exit(code);
}
function startService(name, args, env = process.env, command = process.execPath, options = {}) {
  const {critical=true,...spawnOptions}=options;
  const child = spawn(command, args, { stdio: 'inherit', windowsHide: true, env, ...spawnOptions });
  children.push(child);
  child.once('error', error => { console.error(`${name} 启动失败：${error.message}`); if(critical)stop(1); });
  child.once('exit', code => { if (!stopping) { console.error(`${name} 已退出（${code}）。`); if(critical)stop(1); } });
  return child;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

try {
  log('山水尖3 · 一键启动');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('需要 Node.js 22.12 或更新版本。');
  if (!npmInstalled()) {
    log('首次启动或依赖不完整，正在安装依赖，请保持网络连接…');
    await npm(existsSync('package-lock.json') ? ['ci'] : ['install']);
  }
  if (!existsSync('.env')) {
    copyFileSync('.env.example', '.env');
    log('已从 .env.example 创建本地配置；已有配置不会被覆盖。');
  }
  const { config } = await import('dotenv');
  config({ quiet: true });
  const port = Number(process.env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 5173) throw new Error('PORT 必须是 1–65535 内且不同于 5173 的有效端口。');
  let tunnel = null;
  const cpolar = cpolarMode ? cpolarConfig() : null;
  if (publicMode) {
    if (!existsSync(`${TUNNEL_DIR}/public.json`)) throw new Error('尚未配置公网隧道：缺少 .local/cloudflared/public.json，请先完成 README「挂到公网」一节的隧道创建。');
    tunnel = JSON.parse(readFileSync(`${TUNNEL_DIR}/public.json`, 'utf8'));
    if (!/^[a-z0-9.-]+$/i.test(tunnel.hostname || '')) throw new Error('public.json 的 hostname 无效。');
    if (await healthy(port)) throw new Error(`端口 ${port} 上已有游戏服务在运行。请先关闭之前的游戏窗口（Ctrl+C），再启动公网模式。`);
  }
  if (!productionMode && await healthy(port) && await webReady()) {
    log('游戏已经在运行：http://localhost:5173');
    openBrowser();
  } else {
    for (const p of productionMode ? [port] : [port, 5173]) {
      if (!await canBind(p)) throw new Error(`端口 ${p} 已被占用。请关闭之前的游戏窗口或占用程序，再双击启动；脚本不会终止其他程序。`);
    }
    const { default: pg } = await import('pg');
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://a3:a3_local_dev@localhost:5432/a3';
    async function databaseReady() {
      const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 2000 });
      try { await client.connect(); await client.query('SELECT 1'); return true; }
      catch { return false; }
      finally { await client.end().catch(() => {}); }
    }
    if (!await databaseReady()) {
      const url = new URL(databaseUrl);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && (!url.port || url.port === '5432');
      if (!local) throw new Error('无法连接 .env 指定的 PostgreSQL，请检查数据库地址、凭证和网络。');
      if (!await canBind(5432)) throw new Error('5432 端口已有程序运行，但当前数据库配置无法连接。请核对 .env，不会覆盖已有数据库。');
      log('启动本机原生 PostgreSQL（数据保存在 .local/postgres）…');
      const { startNativeDatabase } = await import('./native-db.mjs');
      nativeDatabase = await startNativeDatabase(databaseUrl);
      await waitFor(databaseReady, 30000, '本机 PostgreSQL 未能就绪，请查看上方日志。');
    }
    log('同步数据库结构…');
    await npm(['run', 'db:migrate']);
    log('启动游戏服务…');
    if(cpolarMode){
      log('构建网页，准备 cpolar 国内节点…');
      await run(process.execPath,['node_modules/vite/bin/vite.js','build']);
      startService('API',['node_modules/tsx/dist/cli.mjs','server/index.ts'],{...process.env,A3_WECHAT_MOCK:'0',A3_PUBLIC_URL:'',WECHAT_REDIRECT_BASE:process.env.WECHAT_REDIRECT_BASE||''});
      await waitFor(async()=>await healthy(port)&&await webReady(port),45000,'本机服务启动超时，请查看上方日志。');
      try{await run(process.execPath,['scripts/cf-benchmark.mjs','--edge-only']);}catch(error){console.error(`Cloudflare 节点测速失败，将使用现有或默认节点：${error.message}`);}
      const entryConfig=prepareEntryTunnel();
      startService('固定入口',['scripts/entry-server.mjs']);
      await waitFor(async()=>{try{return (await fetch('http://127.0.0.1:3003/healthz')).ok;}catch{return false;}},10000,'固定入口本机服务启动失败。');
      startService('固定入口 Cloudflare 隧道',['tunnel','--config',entryConfig,'run'],cpolarEnvironment(),'cloudflared',{critical:false});
      const child=startService('cpolar 国内隧道',cpolarArgs(cpolar.config,port),cpolarEnvironment(),cpolar.executable,{stdio:['ignore','pipe','pipe']});
      let publicUrl=null,publishedUrl=null,tail='',refreshing=false;
      const refreshEntry=async()=>{
        if(!publicUrl||publicUrl===publishedUrl||refreshing)return;
        refreshing=true;const candidate=publicUrl;
        try{
          const response=await fetch(`${candidate}/api/health`,{signal:AbortSignal.timeout(5000)});
          const data=await response.json();
          if(!response.ok||!data.ok||data.database!=='postgresql')throw new Error('公网健康检查未通过');
          if(candidate!==publicUrl)return;
          publishEntryTarget(candidate);publishedUrl=candidate;
          log(`固定入口已更新：${ENTRY_URL}\n当前牌桌：${candidate}`);
        }catch(error){console.error(`固定入口暂未更新：${error.message}，将自动重试。`);}
        finally{refreshing=false;if(candidate!==publicUrl)void refreshEntry();}
      };
      const consume=chunk=>{
        const safe=chunk.toString().replaceAll(cpolar.token,'[已隐藏]');
        process.stdout.write(safe);
        tail=(tail+safe).slice(-8192);
        const discovered=cpolarPublicUrl(tail);
        if(discovered&&discovered!==publicUrl){publicUrl=discovered;void refreshEntry();}
      };
      child.stdout.on('data',consume);child.stderr.on('data',consume);
      const refreshTimer=setInterval(()=>void refreshEntry(),30000);
      child.once('exit',()=>clearInterval(refreshTimer));
      await waitFor(async()=>!!publicUrl,60000,'隧道尚未取得 HTTPS 地址，请检查 Token、账号状态与 cpolar 输出。');
      await waitFor(async()=>{await refreshEntry();return !!publishedUrl&&publishedUrl===publicUrl;},45000,'隧道地址已分配，但公网健康检查或入口更新失败。');
      log(`国内内网穿透已就绪：${publicUrl}\n地址由 cpolar 分配，免费随机地址变化时会自动更新固定入口。\n本次仅穿透游戏端口 ${port}，Token 保留在本机。按 Ctrl+C 停止本次服务与隧道。`);
      log(`请长期分享固定入口：${ENTRY_URL}，隧道地址变化后会自动更新。`);
      openBrowser(ENTRY_URL);
      await new Promise(()=>{});
    }
    if(directMode){
      const raw=process.env.A3_DIRECT_URL?.trim();
      const directUrl=raw?new URL(raw):null;
      if(directUrl&&(!['http:','https:'].includes(directUrl.protocol)||directUrl.username||directUrl.password||directUrl.search||directUrl.hash||directUrl.pathname!=='/'))throw new Error('A3_DIRECT_URL 必须为 http(s)://主机[:端口]，不能包含路径、密码或查询参数。');
      log('构建网页，启动本机直连服务（不启动 Cloudflare）…');
      await run(process.execPath,['node_modules/vite/bin/vite.js','build']);
      startService('API',['node_modules/tsx/dist/cli.mjs','server/index.ts'],{...process.env,A3_WECHAT_MOCK:'0',A3_PUBLIC_URL:directUrl?.origin||'',WECHAT_REDIRECT_BASE:process.env.WECHAT_REDIRECT_BASE||directUrl?.origin||''});
      await waitFor(async()=>await healthy(port)&&await webReady(port),45000,'直连服务启动超时，请查看上方日志。');
      const {networkInterfaces}=await import('node:os');
      const addresses=Object.values(networkInterfaces()).flat().filter(i=>i&&i.family==='IPv4'&&!i.internal&&!i.address.startsWith('169.254.')).map(i=>i.address);
      log(`本机直连已就绪：http://localhost:${port}\n${addresses.map(ip=>`局域网：http://${ip}:${port}`).join('\n')}\n${directUrl?`配置的外网地址：${directUrl.origin}（外网可达性需从手机移动网络验证）`:'外网直连需要公网 IPv4 + 路由器端口映射，或公网 IPv6。'}\n此模式不会启动隧道或修改路由器、DNS、防火墙。按 Ctrl+C 停止本次服务。`);
      openBrowser(`http://localhost:${port}`);
      await new Promise(()=>{});
    }
    if (publicMode) {
      const url = `https://${tunnel.hostname}`;
      log('构建网页…');
      await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
      log(`启动游戏服务与 Cloudflare 隧道（${url}）…`);
      // 公网上强制关闭模拟扫码；微信回调域名默认就是公网域名
      startService('API', ['node_modules/tsx/dist/cli.mjs', 'server/index.ts'], { ...process.env, A3_WECHAT_MOCK: '0', A3_PUBLIC_URL: url, WECHAT_REDIRECT_BASE: process.env.WECHAT_REDIRECT_BASE || url });
      await waitFor(async () => await healthy(port) && await webReady(port), 45000, '服务启动超时，请查看上方日志。');
      startService('Cloudflare 隧道', ['tunnel', '--config', `${TUNNEL_DIR}/config.yml`, 'run'], process.env, 'cloudflared');
      await waitFor(async () => { try { return (await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(4000) })).ok; } catch { return false; } }, 60000, '公网地址未能连通，请查看上方 cloudflared 日志。');
      log(`公网已就绪：${url}\n保持此窗口开启。按 Ctrl+C 停止服务与隧道，数据库文件及对局数据保留。`);
      openBrowser(url);
      await new Promise(() => {});
    }
    startService('API', ['node_modules/tsx/dist/cli.mjs', 'watch', 'server/index.ts']);
    startService('Web', ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', '5173', '--strictPort'], { ...process.env, A3_API_PORT: String(port) });
    await waitFor(async () => await healthy(port) && await webReady(), 45000, '服务启动超时，请查看上方日志。');
    const { networkInterfaces } = await import('node:os');
    const lan = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')).map(i => i.address).sort((a, b) => Number(b.startsWith('192.168.')) - Number(a.startsWith('192.168.')));
    if (lan.length) log(`多端互通：手机 / 平板连同一 Wi-Fi 后打开 http://${lan[0]}:5173 ，用同一账号登录即可。\n小程序 API 地址：http://${lan[0]}:${port}/api 。首次使用若打不开，请在 Windows 防火墙弹窗中允许 Node.js 访问专用网络。`);
    log('已就绪：http://localhost:5173\n保持此窗口开启。按 Ctrl+C 停止本次启动的服务，数据库文件及对局数据保留。');
    openBrowser();
    if (smoke) {
      await npm(['run', 'test:api']);
      log('启动与完整对局验证通过，正在关闭本次启动的 Web / API / PostgreSQL。');
      await stop();
    }
  }
} catch (error) {
  console.error(`\n[A3] ${error.message}`);
  stop(1);
}
