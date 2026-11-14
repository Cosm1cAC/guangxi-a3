// 账号面板：邮箱注册 / 登录、微信扫码、个人资料、多端互通二维码、排行榜、手机端扫码确认。
import { headPixels, normalizeAvatar, randomAvatar, avatarKey, type Avatar } from '../core/avatar';

export type User = { id: number; name: string; email: string | null; avatar: Avatar; games: number; wins: number; score: number; wechat: boolean };
type Session = { token: string; user: User };
type AuthResult = { token: string; user: User };

const KEY = 'a3-session', AVATAR_KEY = 'a3-avatar';
let current: Session | null = null;
try { const raw = localStorage.getItem(KEY); if (raw) { current = JSON.parse(raw); current!.user.avatar = normalizeAvatar(current!.user.avatar); } } catch { current = null; }
const listeners: ((user: User | null) => void)[] = [];
export const session = {
  get user() { return current?.user ?? null; },
  get token() { return current?.token ?? null; },
  set(next: Session | null) { current = next; next ? localStorage.setItem(KEY, JSON.stringify(next)) : localStorage.removeItem(KEY); if (next) localStorage.setItem(AVATAR_KEY, JSON.stringify(next.user.avatar)); listeners.forEach(fn => fn(current?.user ?? null)); },
  setUser(user: User) { if (current) session.set({ token: current.token, user }); },
  onChange(fn: (user: User | null) => void) { listeners.push(fn); },
};
/** 我的形象：登录后取账号形象；游客形象存在本机，注册时一并带上。 */
export function myAvatar(): Avatar {
  if (current) return current.user.avatar;
  try { const raw = localStorage.getItem(AVATAR_KEY); if (raw) return normalizeAvatar(JSON.parse(raw)); } catch { /* fall through */ }
  const a = randomAvatar(); localStorage.setItem(AVATAR_KEY, JSON.stringify(a)); return a;
}
export function saveGuestAvatar(a: Avatar) { localStorage.setItem(AVATAR_KEY, JSON.stringify(a)); }

// 浏览器里接口与页面同源（/api）。安卓应用的页面打包在安装包内，接口走绝对地址：
// 默认是构建时写入的公网服务，也可在登录窗口改成局域网里的本机服务。
const BUILT_IN_API: string = import.meta.env.VITE_API_BASE || '';
export const isApp = !!BUILT_IN_API;
const SERVER_KEY = 'a3-server';
// 公网走国内穿透时，牌桌地址由服务商分配、每次启动可能变化；固定入口（VITE_ENTRY_URL）始终给出当前地址。
// 应用启动时先问一次入口，连不上服务器时再问一次；问不到就沿用上次的地址，再不行退回构建时写入的默认地址。
const ENTRY_URL: string = import.meta.env.VITE_ENTRY_URL || '';
const ENTRY_KEY = 'a3-entry';
const ENTRY_HOST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.cpolar\.(cn|top|io|net|vip|xyz|site|cyou)$/i;
let located = localStorage.getItem(ENTRY_KEY) || '', locating: Promise<void> | null = null, locatedAt = 0;
const custom = () => localStorage.getItem(SERVER_KEY) || '';
export const apiBase = () => isApp ? (custom() || located || BUILT_IN_API) : '/api';
async function locate() {
  try {
    // 入口不带跨域头，用原生网络请求读取（不受页面同源限制）
    const { CapacitorHttp } = await import('@capacitor/core');
    let found = '';
    for (let attempt = 1; attempt <= 3 && !found; attempt++) {
      try {
        const r = await CapacitorHttp.get({ url: `${ENTRY_URL}?t=${Date.now()}`, connectTimeout: 12000, readTimeout: 12000, responseType: 'json' });
        const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data, u = new URL(String(data?.url));
        if (r.status === 200 && u.protocol === 'https:' && !u.port && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash && ENTRY_HOST.test(u.hostname)) found = `${u.origin}/api`;
        else break;   // 入口有回应但没有可用地址：不必重试
      } catch { await pause(500 * attempt); }
    }
    // 入口给的地址可能已过期（比如改回了直连域名的启动方式），确认能通才采用
    if (found && found !== located) {
      const ok = await fetch(`${found}/health`, { signal: AbortSignal.timeout(8000) }).then(r => r.ok, () => false);
      if (!ok) found = '';
    }
    if (found) { located = found; localStorage.setItem(ENTRY_KEY, found); }
    else if (located && !(await fetch(`${located}/health`, { signal: AbortSignal.timeout(8000) }).then(r => r.ok, () => false))) { located = ''; localStorage.removeItem(ENTRY_KEY); }
  } catch { /* 保持现状 */ }
  locatedAt = Date.now();
}
/** 向固定入口询问当前牌桌地址；force 用于连不上时重新询问（15 秒内不重复）。地址变了返回 true。 */
async function locateServer(force = false) {
  if (!isApp || !ENTRY_URL || custom()) return false;
  const before = apiBase();
  if (!locating && (!locatedAt || (force && Date.now() - locatedAt > 15000))) locating = locate().finally(() => { locating = null; });
  if (locating) await locating;
  return apiBase() !== before;
}
void locateServer();   // 应用一启动就问，登录窗口打开前地址通常已就绪
/** 给其他设备看的网页地址：应用内取服务端地址，浏览器里就是当前页面。 */
export const shareOrigin = () => isApp ? new URL(apiBase()).origin : location.origin;
/** 应用内切换服务器；传空串恢复默认。地址无效时返回 false。 */
export function setServer(input: string) {
  const text = input.trim();
  if (!text) { localStorage.removeItem(SERVER_KEY); return true; }
  try { const u = new URL(/^https?:\/\//i.test(text) ? text : `http://${text}`); if (u.protocol !== 'http:' && u.protocol !== 'https:') return false; localStorage.setItem(SERVER_KEY, `${u.origin}/api`); return true; } catch { return false; }
}

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
/**
 * 公网走隧道时链路可能丢包：读请求和「加入房间」这类可重复的请求自动重试；
 * 注册、出牌等不可重复的请求只发一次，失败时给出明确提示，由玩家决定是否重试。
 */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const token = current?.token, repeatable = !body || /^\/rooms\/[A-F0-9]{10}\/join$/.test(path), tries = repeatable ? 3 : 1;
  await locateServer();
  let relocated = false;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(apiBase() + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-A3-Client': isApp ? 'android' : 'web', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(repeatable ? 10000 : 25000) });
    } catch {
      if (attempt < tries) { await pause(400 * attempt); continue; }
      // 重试也连不上：可能是牌桌地址换了。问到新地址后，可重复的请求再试一轮
      if (!relocated && await locateServer(true) && repeatable) { relocated = true; attempt = 0; continue; }
      throw new ApiError(repeatable ? '网络不稳定，暂时连不上服务器，请稍后再试' : '网络不稳定，这次请求没有得到回应。请稍等几秒再试一次', 0);
    }
    const data = await res.json().catch(() => null);
    if (!data && !res.ok) {   // 不是游戏服务的回应：多半是隧道 / 网关的 5xx 错误页
      if (attempt < tries && res.status >= 500) { await pause(400 * attempt); continue; }
      if (!relocated && await locateServer(true) && repeatable) { relocated = true; attempt = 0; continue; }
      throw new ApiError(`服务器暂时没有响应（${res.status}），请稍后再试`, res.status);
    }
    if (res.status === 401 && token && current?.token === token && !path.startsWith('/auth/')) session.set(null);   // 会话过期：回到游客状态
    if (!res.ok) throw new ApiError(data?.error || '请求失败', res.status);
    return data as T;
  }
}

const faces = new Map<string, string>();
/** 8×8 像素头像（data URL），配合 CSS image-rendering: pixelated 放大。 */
export function faceURL(a: Avatar) {
  const k = avatarKey(a); let url = faces.get(k);
  if (!url) {
    const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d')!;
    headPixels(a, 'front').forEach((row, y) => row.forEach((color, x) => { g.fillStyle = color; g.fillRect(x, y, 1, 1); }));
    url = c.toDataURL(); faces.set(k, url);
  }
  return url;
}
export const faceImg = (a: Avatar, cls = '') => `<img class="face ${cls}" src="${faceURL(a)}" alt="">`;

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const svgURL = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
const msg = (e: unknown) => e instanceof Error ? e.message : '请求失败';

type Deps = { modal: (html: string, cls?: string) => void; close: () => void; toast: (s: string) => void; error: () => void; openWardrobe: () => void; canDress: () => boolean };
export function createAccount(d: Deps) {
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
  const dialog = $<HTMLDialogElement>('#dialog');
  let scanTimer: ReturnType<typeof setInterval> | undefined;
  dialog.addEventListener('close', () => clearInterval(scanTimer));
  let config: { emailCode: boolean; wechat: 'real' | 'mock' | 'off'; mini: boolean } | null = null;
  const getConfig = async () => config ??= await api<NonNullable<typeof config>>('/auth/config');

  // ---------- 登录 / 注册 ----------
  function openLogin(after?: () => void, tab: 'email' | 'scan' = 'email') {
    d.modal(`<div class="seal">户</div><div class="eyebrow">账号 · 多端互通</div><h2>登录山水尖3</h2>
    <div class="tabs" role="tablist"><button role="tab" data-tab="email">邮箱</button><button role="tab" data-tab="scan">微信扫码</button></div>
    <form data-pane="email" id="au-form" novalidate>
      <label class="field">邮箱<input id="au-email" type="email" autocomplete="email" placeholder="you@example.com"></label>
      <label class="field">密码<input id="au-pass" type="password" autocomplete="current-password" placeholder="至少 8 位"></label>
      <div id="au-reg" hidden>
        <label class="field">昵称<input id="au-name" maxlength="12" placeholder="牌桌上显示的名字" autocomplete="nickname"></label>
        <div class="code-row" id="au-code-row" hidden><label class="field">邮箱验证码<input id="au-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label><button type="button" class="btn ghost" id="au-send">发送验证码</button></div>
      </div>
      <button class="btn lacquer wide" id="au-submit" type="submit">登录</button>
      <button type="button" class="link" id="au-switch">没有账号？用邮箱注册</button>
    </form>
    <div data-pane="scan" hidden><div class="scan-box" id="scan-box"></div><p class="muted" id="scan-tip"></p></div>
    ${isApp ? `<button type="button" class="link" id="au-server">服务器：${esc(shareOrigin().replace(/^https?:\/\//, ''))} · 更改</button>` : ''}
    <p id="au-error" class="form-error" role="alert"></p>`, 'paper');
    const err = $('#au-error'); let register = false;
    if (isApp) $('#au-server').onclick = () => {
      const next = prompt('服务器地址（留空恢复默认）。局域网示例：http://192.168.1.10:3001', shareOrigin());
      if (next === null) return;
      if (!setServer(next)) return void (err.textContent = '服务器地址无效');
      config = null; session.set(null); openLogin(after, tab);   // 换服务器后账号需重新登录
    };
    const done = (r: AuthResult) => { session.set(r); d.close(); d.toast(`欢迎，${r.user.name}`); after?.(); };
    const setRegister = async (on: boolean) => {
      register = on; $('#au-reg').hidden = !on; $('#au-submit').textContent = on ? '注册并登录' : '登录'; $('#au-switch').textContent = on ? '已有账号？直接登录' : '没有账号？用邮箱注册';
      $<HTMLInputElement>('#au-pass').autocomplete = on ? 'new-password' : 'current-password'; err.textContent = '';
      if (on) { try { $('#au-code-row').hidden = !(await getConfig()).emailCode; } catch { /* 注册时服务端仍会校验 */ } }
    };
    $('#au-switch').onclick = () => void setRegister(!register);
    $('#au-send').onclick = async () => {
      const b = $<HTMLButtonElement>('#au-send');
      try { await api('/auth/email/code', { email: $<HTMLInputElement>('#au-email').value }); b.disabled = true; b.textContent = '已发送'; setTimeout(() => { b.disabled = false; b.textContent = '重新发送'; }, 60000); err.textContent = ''; }
      catch (e) { err.textContent = msg(e); d.error(); }
    };
    $('#au-form').addEventListener('submit', async e => {
      e.preventDefault(); const b = $<HTMLButtonElement>('#au-submit'); b.disabled = true; err.textContent = '';
      const email = $<HTMLInputElement>('#au-email').value.trim(), password = $<HTMLInputElement>('#au-pass').value;
      try {
        if (!/^\S+@\S+\.\S+$/.test(email)) throw Error('请输入有效的邮箱地址');
        if (password.length < 8) throw Error('密码至少 8 位');
        if (register) {
          const name = $<HTMLInputElement>('#au-name').value.trim(); if (!name) throw Error('请填写昵称');
          done(await api<AuthResult>('/auth/register', { email, password, name, code: $<HTMLInputElement>('#au-code').value.trim() || undefined, avatar: myAvatar() }));
        } else done(await api<AuthResult>('/auth/login', { email, password }));
      } catch (e2) { err.textContent = msg(e2); d.error(); } finally { b.disabled = false; }
    });
    const show = (name: 'email' | 'scan') => {
      document.querySelectorAll<HTMLElement>('#dialog [data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === name); b.setAttribute('aria-selected', String(b.dataset.tab === name)); });
      document.querySelectorAll<HTMLElement>('#dialog [data-pane]').forEach(p => p.hidden = p.dataset.pane !== name);
      err.textContent = ''; clearInterval(scanTimer);
      if (name === 'scan') void startScan(done);
    };
    document.querySelectorAll<HTMLElement>('#dialog [data-tab]').forEach(b => b.onclick = () => show(b.dataset.tab as 'email' | 'scan'));
    show(tab);
  }

  async function startScan(done: (r: AuthResult) => void) {
    const box = $('#scan-box'), tip = $('#scan-tip');
    box.innerHTML = '<div class="scan-wait">正在生成二维码…</div>'; tip.textContent = '';
    try {
      const s = await api<{ ticket: string; mode: 'real' | 'mock'; url: string; qr?: string }>('/auth/scan/start', { origin: shareOrigin() });
      if (s.mode === 'real') { box.innerHTML = `<iframe title="微信扫码登录" src="${esc(s.url)}" sandbox="allow-scripts allow-same-origin allow-top-navigation"></iframe>`; tip.textContent = '打开微信「扫一扫」，在手机上确认登录。'; }
      else {
        box.innerHTML = `<img class="qr" src="${svgURL(s.qr!)}" alt="登录二维码"><a class="link" href="${esc(s.url)}" target="_blank" rel="noopener">在本机新标签页打开确认页</a>`;
        tip.innerHTML = '<b>本机模拟扫码</b>：服务端尚未配置微信开放平台 AppID，这不是真实的微信授权。用同一 Wi‑Fi 下的手机（微信或相机）扫码，在手机上确认即可登录；流程与正式扫码一致。';
      }
      clearInterval(scanTimer);
      scanTimer = setInterval(async () => {
        try {
          const p = await api<{ status: 'pending' | 'expired' | 'done' } & Partial<AuthResult>>(`/auth/scan/poll?ticket=${s.ticket}`);
          if (p.status === 'done') { clearInterval(scanTimer); done({ token: p.token!, user: p.user! }); }
          else if (p.status === 'expired') { clearInterval(scanTimer); box.innerHTML = '<button class="btn ghost" id="scan-refresh">二维码已过期 · 点击刷新</button>'; $('#scan-refresh').onclick = () => void startScan(done); }
        } catch { /* 网络抖动：下次轮询再试 */ }
      }, 1500);
    } catch (e) { box.innerHTML = ''; tip.textContent = msg(e); }
  }

  // ---------- 个人资料 ----------
  async function openProfile() {
    const u = session.user; if (!u) return openLogin();
    d.modal(`<div class="eyebrow">我的账号</div>
    <div class="profile-head">${faceImg(u.avatar, 'big')}<div><h2>${esc(u.name)}</h2><p class="muted">${u.email ? esc(u.email) : '微信账号 · 未绑定邮箱'}${u.wechat ? ' · 已关联微信' : ''}</p></div></div>
    <div class="stats"><div><b>${u.games}</b><span>好友局</span></div><div><b>${u.wins}</b><span>胜局</span></div><div><b class="${u.score > 0 ? 'up' : u.score < 0 ? 'down' : ''}">${u.score > 0 ? '+' : ''}${u.score}</b><span>累计积分</span></div></div>
    <div class="code-row"><label class="field">昵称<input id="pf-name" maxlength="12" value="${esc(u.name)}"></label><button class="btn ghost" id="pf-save">保存</button></div>
    <div class="row"><button class="btn lacquer" id="pf-dress">更换形象</button><button class="btn ghost" id="pf-logout">退出登录</button></div>
    ${u.email ? '' : `<div class="divider"><span>绑定邮箱 · 之后可在任意设备用邮箱登录</span></div><div class="code-row"><label class="field">邮箱<input id="pf-email" type="email" autocomplete="email"></label><label class="field">设置密码<input id="pf-pass" type="password" autocomplete="new-password"></label></div><div class="code-row" id="pf-code-row" hidden><label class="field">邮箱验证码<input id="pf-code" inputmode="numeric" maxlength="6"></label><button class="btn ghost" id="pf-send">发送验证码</button></div><button class="btn ghost wide" id="pf-bind">绑定邮箱</button>`}
    <div class="divider"><span>多端互通</span></div>
    <div class="lan" id="pf-lan"><p class="muted">正在获取本机局域网地址…</p></div>
    <div class="divider"><span>积分榜</span></div>
    <div class="board" id="pf-board"><p class="muted">加载中…</p></div>
    <p id="au-error" class="form-error" role="alert"></p>`, 'paper');
    const err = $('#au-error');
    $('#pf-dress').onclick = () => { if (!d.canDress()) return void (err.textContent = '牌局进行中，回到大厅后再换装'); d.close(); d.openWardrobe(); };
    $('#pf-logout').onclick = async () => { await api('/auth/logout', {}).catch(() => {}); session.set(null); d.close(); d.toast('已退出登录'); };
    $('#pf-save').onclick = async () => { try { const r = await api<{ user: User }>('/me', { name: $<HTMLInputElement>('#pf-name').value.trim() }); session.setUser(r.user); d.toast('昵称已更新'); void openProfile(); } catch (e) { err.textContent = msg(e); d.error(); } };
    if (!u.email) {
      void getConfig().then(c => { const row = document.querySelector<HTMLElement>('#pf-code-row'); if (row) row.hidden = !c.emailCode; }).catch(() => {});
      $('#pf-send').onclick = async () => { try { await api('/auth/email/code', { email: $<HTMLInputElement>('#pf-email').value }); d.toast('验证码已发送'); } catch (e) { err.textContent = msg(e); } };
      $('#pf-bind').onclick = async () => { try { const r = await api<{ user: User }>('/me/email', { email: $<HTMLInputElement>('#pf-email').value.trim(), password: $<HTMLInputElement>('#pf-pass').value, code: $<HTMLInputElement>('#pf-code').value.trim() || undefined }); session.setUser(r.user); d.toast('邮箱已绑定'); void openProfile(); } catch (e) { err.textContent = msg(e); d.error(); } };
    }
    api<{ user: User }>('/me').then(r => { if (avatarKey(r.user.avatar) !== avatarKey(u.avatar) || r.user.games !== u.games || r.user.name !== u.name) { session.setUser(r.user); if (document.querySelector('#pf-lan')) void openProfile(); } }).catch(() => {});
    api<{ url: string; local: boolean; qr: string }>(`/lan?origin=${encodeURIComponent(shareOrigin())}`).then(l => {
      const el = document.querySelector('#pf-lan'); if (!el) return;
      el.innerHTML = l.local ? '<p class="muted">没有检测到局域网地址。连接 Wi‑Fi 或网线后，其他设备才能访问本机服务。</p>'
        : `<img class="qr" src="${svgURL(l.qr)}" alt="手机访问二维码"><div><b class="room-code">${esc(l.url)}</b><p class="muted">${/^https:/.test(l.url) ? '任何网络下的手机、电脑' : '手机连同一 Wi‑Fi，'}扫码或输入地址打开，用同一账号登录：形象、积分和进行中的牌局都在。小程序把 API 地址指向这里同样互通。</p></div>`;
    }).catch(() => { const el = document.querySelector('#pf-lan'); if (el) el.innerHTML = '<p class="muted">暂时无法获取局域网地址。</p>'; });
    api<{ top: { name: string; avatar: Avatar; games: number; wins: number; score: number }[] }>('/leaderboard').then(b => {
      const el = document.querySelector('#pf-board'); if (!el) return;
      el.innerHTML = b.top.length ? b.top.map((p, i) => `<div><span class="place">${i + 1}</span>${faceImg(normalizeAvatar(p.avatar))}<b>${esc(p.name)}</b><span class="muted">${p.wins}/${p.games} 胜</span><strong class="${p.score > 0 ? 'up' : p.score < 0 ? 'down' : ''}">${p.score > 0 ? '+' : ''}${p.score}</strong></div>`).join('') : '<p class="muted">还没有完成的好友局。四位真人打完一局后上榜。</p>';
    }).catch(() => { const el = document.querySelector('#pf-board'); if (el) el.innerHTML = '<p class="muted">积分榜暂不可用。</p>'; });
  }

  // ---------- 手机端：扫码后的确认页 (?scan=ticket) ----------
  async function handleScan() {
    const ticket = new URLSearchParams(location.search).get('scan'); if (!ticket) return;
    const clean = () => history.replaceState(null, '', location.pathname);
    let info: { valid: boolean; mock: boolean };
    try { info = await api('/auth/scan/info?ticket=' + encodeURIComponent(ticket)); } catch { return; }
    if (!info.valid) { clean(); return d.toast('二维码已过期，请在电脑上刷新'); }
    const render = () => {
      const u = session.user;
      d.modal(`<div class="seal">扫</div><div class="eyebrow">扫码登录</div><h2>在另一台设备上登录？</h2>
      ${u ? `<div class="profile-head">${faceImg(u.avatar, 'big')}<div><b>${esc(u.name)}</b><p class="muted">将用这个账号登录电脑端</p></div></div><button class="btn lacquer wide" id="sc-ok">确认登录</button>`
        : `${info.mock ? `<label class="field">微信昵称（模拟）<input id="sc-name" maxlength="12" value="微信牌友"></label><button class="btn lacquer wide" id="sc-mock">模拟微信授权并登录</button><p class="muted">开发模式：服务端未配置微信 AppID，这里以本机固定的模拟身份代替微信授权。</p><div class="divider"><span>或</span></div>` : ''}<button class="btn ghost wide" id="sc-login">用邮箱账号登录后确认</button>`}
      <p id="au-error" class="form-error" role="alert"></p>`, 'paper');
      const confirm = async (mock?: { deviceId: string; name: string }) => {
        try {
          const r = await api<{ user: User; token?: string }>('/auth/scan/confirm', { ticket, mock });
          if (r.token) session.set({ token: r.token, user: r.user });
          clean(); d.close(); d.toast('已确认，电脑端即将登录');
        } catch (e) { $('#au-error').textContent = msg(e); d.error(); }
      };
      if (u) $('#sc-ok').onclick = () => void confirm();
      else {
        if (info.mock) $('#sc-mock').onclick = () => {
          let deviceId = localStorage.getItem('a3-device');
          if (!deviceId) { deviceId = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('a3-device', deviceId); }
          void confirm({ deviceId, name: $<HTMLInputElement>('#sc-name').value.trim() || '微信牌友' });
        };
        $('#sc-login').onclick = () => openLogin(render);
      }
    };
    render();
  }

  return { openLogin, openProfile, handleScan };
}
