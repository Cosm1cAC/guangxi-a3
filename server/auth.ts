// 账号系统：邮箱注册 / 登录、微信扫码（开放平台网站应用）、小程序 code 登录、手机扫码确认。
// 所有客户端（桌面浏览器、手机浏览器、小程序）共用同一套 Bearer 会话令牌。
import express from 'express';
import os from 'node:os';
import { randomBytes, randomInt, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import QRCode from 'qrcode';
import { pool } from './db';
import { wechatJson, wechatIdentity } from './wechat';
import { normalizeAvatar, randomAvatar, isAvatar, type Avatar } from '../src/core/avatar';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
export const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const SESSION_DAYS = 30;

export type User = { id: number; username: string | null; name: string; email: string | null; emailVerified: boolean; avatar: Avatar; games: number; wins: number; score: number; wechat: boolean };
type Row = { id: string; username?: string | null; name: string; email: string | null; email_verified_at?: unknown; avatar: unknown; games: number; wins: number; score: number; wechat_openid: string | null; mini_openid: string | null; password_hash: string | null };
const toUser = (r: Row): User => ({ id: Number(r.id), username: r.username ?? null, name: r.name, email: r.email, emailVerified: !!r.email_verified_at, avatar: normalizeAvatar(r.avatar), games: r.games, wins: r.wins, score: r.score, wechat: !!(r.wechat_openid || r.mini_openid) });

// ---------- configuration ----------
const env = process.env;
const wechatWeb = env.WECHAT_APP_ID && env.WECHAT_APP_SECRET && env.WECHAT_REDIRECT_BASE ? { id: env.WECHAT_APP_ID, secret: env.WECHAT_APP_SECRET, base: env.WECHAT_REDIRECT_BASE.replace(/\/$/, '') } : null;
const wechatMini = env.WECHAT_MINI_APP_ID && env.WECHAT_MINI_APP_SECRET ? { id: env.WECHAT_MINI_APP_ID, secret: env.WECHAT_MINI_APP_SECRET } : null;
const mockAllowed = !wechatWeb && env.A3_WECHAT_MOCK !== '0';
const smtp = env.SMTP_HOST ? { host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 465), user: env.SMTP_USER || '', pass: env.SMTP_PASS || '', from: env.SMTP_FROM || env.SMTP_USER || '' } : null;

export function lanAddresses() {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) out.push(i.address);
  // 常见家用网段优先
  return out.sort((a, b) => Number(b.startsWith('192.168.')) - Number(a.startsWith('192.168.')));
}
/** 把浏览器所在的 origin 换成局域网内其他设备也能访问的地址。 */
function reachableOrigin(origin: unknown) {
  let url: URL;
  try { url = new URL(String(origin)); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) { const ip = lanAddresses()[0]; if (ip) url.hostname = ip; }
  return url.origin;
}

// ---------- passwords & sessions ----------
async function hashPassword(password: string) { const salt = randomBytes(16); return `scrypt$${salt.toString('hex')}$${(await scryptAsync(password, salt, 64)).toString('hex')}`; }
async function checkPassword(password: string, stored: string | null) {
  const [kind, salt, hash] = (stored || '').split('$');
  // 账号不存在时也做一次等量计算，避免通过响应时间探测邮箱
  const derived = await scryptAsync(password, Buffer.from(kind === 'scrypt' ? salt : '00', 'hex'), 64);
  return kind === 'scrypt' && timingSafeEqual(derived, Buffer.from(hash, 'hex'));
}
const cache = new Map<string, { user: User; until: number }>();
async function createSession(userId: number, device: string) {
  const token = randomBytes(32).toString('hex');
  await pool.query(`INSERT INTO sessions(token_hash,user_id,device,expires_at) VALUES($1,$2,$3,now()+interval '${SESSION_DAYS} days')`, [sha(token), userId, device.slice(0, 80)]);
  return token;
}
const bearer = (req: express.Request) => (req.headers.authorization || '').replace(/^Bearer /, '');
/** 解析请求的登录用户；未登录返回 null。结果缓存 20 秒，减轻轮询压力。 */
export async function userOf(req: express.Request): Promise<User | null> {
  const token = bearer(req); if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const key = sha(token), hit = cache.get(key), now = Date.now();
  if (hit && hit.until > now) return hit.user;
  const r = await pool.query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()', [key]);
  if (!r.rows[0]) { cache.delete(key); return null; }
  const user = toUser(r.rows[0]);
  if (cache.size > 5000) cache.clear();
  cache.set(key, { user, until: now + 20000 });
  return user;
}
function forget(userId: number) { for (const [k, v] of cache) if (v.user.id === userId) cache.delete(k); }
export function requireUser(handler: (req: express.Request, res: express.Response, user: User) => Promise<unknown>): express.RequestHandler {
  return async (req, res, next) => { try { const user = await userOf(req); if (!user) return void res.status(401).json({ error: '请先登录' }); await handler(req, res, user); } catch (e) { next(e); } };
}
const wrap = (handler: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler => (req, res, next) => { handler(req, res).catch(next); };
const device = (req: express.Request) => String(req.headers['x-a3-client'] || req.headers['user-agent'] || '');

// ---------- throttles (in-memory; single local server) ----------
const attempts = new Map<string, { count: number; until: number }>();
function throttled(key: string, max: number, windowMs: number) {
  const now = Date.now(); let v = attempts.get(key);
  if (!v || v.until < now) { v = { count: 0, until: now + windowMs }; attempts.set(key, v); }
  if (attempts.size > 20000) for (const [k, x] of attempts) if (x.until < now) attempts.delete(k);
  return ++v.count > max;
}

// ---------- e-mail verification (only when SMTP is configured) ----------
async function sendCode(email: string, code: string) {
  const { createTransport } = await import('nodemailer');
  const transport = createTransport({ host: smtp!.host, port: smtp!.port, secure: smtp!.port === 465, auth: smtp!.user ? { user: smtp!.user, pass: smtp!.pass } : undefined });
  await transport.sendMail({ from: smtp!.from, to: email, subject: `山水尖3 验证码 ${code}`, text: `你的验证码是 ${code}，10 分钟内有效。若非本人操作请忽略。` });
}
async function consumeCode(email: string, code: string | undefined) {
  if (!smtp) return true;
  if (!code) return false;
  const r = await pool.query('UPDATE email_codes SET attempts=attempts+1 WHERE email=$1 AND expires_at>now() AND attempts<5 RETURNING code_hash', [email]);
  if (!r.rows[0] || r.rows[0].code_hash !== sha(`${email}:${code}`)) return false;
  await pool.query('DELETE FROM email_codes WHERE email=$1', [email]);
  return true;
}

const emailSchema = z.string().trim().toLowerCase().max(254).email();
const passwordSchema = z.string().min(8).max(72);
const nameSchema = z.string().trim().min(1).max(12);
const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/);
const cleanName = (s: string) => s.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, '').trim().slice(0, 12) || '山水客';
const ticketSchema = z.string().regex(/^[a-f0-9]{32}$/);

async function wechatUser(ids: { openid?: string; mini?: string; unionid?: string }, nickname: string) {
  const found = await pool.query('SELECT * FROM users WHERE ($1::text IS NOT NULL AND wechat_unionid=$1) OR ($2::text IS NOT NULL AND wechat_openid=$2) OR ($3::text IS NOT NULL AND mini_openid=$3) ORDER BY id LIMIT 1', [ids.unionid ?? null, ids.openid ?? null, ids.mini ?? null]);
  if (found.rows[0]) {
    // 同一微信主体在网站应用与小程序间靠 unionid 归并到同一账号
    const r = await pool.query('UPDATE users SET wechat_unionid=COALESCE(wechat_unionid,$2), wechat_openid=COALESCE(wechat_openid,$3), mini_openid=COALESCE(mini_openid,$4) WHERE id=$1 RETURNING *', [found.rows[0].id, ids.unionid ?? null, ids.openid ?? null, ids.mini ?? null]);
    return toUser(r.rows[0]);
  }
  const r = await pool.query('INSERT INTO users(name,avatar,wechat_unionid,wechat_openid,mini_openid) VALUES($1,$2,$3,$4,$5) RETURNING *', [cleanName(nickname), JSON.stringify(randomAvatar()), ids.unionid ?? null, ids.openid ?? null, ids.mini ?? null]);
  return toUser(r.rows[0]);
}
export const auth = express.Router();

auth.get('/auth/config', (_req, res) => res.json({ emailCode: !!smtp, wechat: wechatWeb ? 'real' : mockAllowed ? 'mock' : 'off', mini: !!wechatMini }));

auth.post('/auth/email/code', wrap(async (req, res) => {
  if (!smtp) return void res.status(400).json({ error: '本机未配置邮件服务，注册无需验证码' });
  const email = emailSchema.safeParse(req.body?.email); if (!email.success) return void res.status(400).json({ error: '邮箱格式不正确' });
  if (throttled(`code-ip:${req.ip}`, 10, 3600000)) return void res.status(429).json({ error: '验证码请求过多，请稍后再试' });
  const recent = await pool.query("SELECT 1 FROM email_codes WHERE email=$1 AND sent_at>now()-interval '60 seconds'", [email.data]);
  if (recent.rows[0]) return void res.status(429).json({ error: '验证码已发送，请 60 秒后重试' });
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  await pool.query("INSERT INTO email_codes(email,code_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes') ON CONFLICT(email) DO UPDATE SET code_hash=$2,attempts=0,sent_at=now(),expires_at=now()+interval '10 minutes'", [email.data, sha(`${email.data}:${code}`)]);
  try { await sendCode(email.data, code); } catch (e) { console.error('SMTP', e instanceof Error ? e.message : e); return void res.status(502).json({ error: '验证码邮件发送失败，请检查 SMTP 配置' }); }
  res.json({ ok: true });
}));

auth.post('/auth/register', wrap(async (req, res) => {
  // username 对旧版安卓客户端可省略；新版注册界面必填，并支持老账号后续补设。
  const parsed = z.object({ username: usernameSchema.optional(), email: emailSchema, password: passwordSchema, name: nameSchema, code: z.string().regex(/^\d{6}$/).optional(), avatar: z.unknown().optional() }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: '请填写有效邮箱、8–72 位密码和 1–12 字昵称；账号名须为 3–24 位字母、数字或下划线' });
  if (throttled(`register:${req.ip}`, 20, 3600000)) return void res.status(429).json({ error: '注册过于频繁，请稍后再试' });
  const { username, email, password, name, code, avatar } = parsed.data;
  if (code && (!smtp || !await consumeCode(email, code))) return void res.status(400).json({ error: '邮箱验证码不正确或已过期' });
  const r = await pool.query('INSERT INTO users(email,password_hash,name,avatar,username,email_verified_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING *', [email, await hashPassword(password), cleanName(name), JSON.stringify(isAvatar(avatar) ? avatar : randomAvatar()), username ?? null, code ? new Date() : null]);
  if (!r.rows[0]) return void res.status(409).json({ error: '账号名或邮箱已注册，请直接登录' });
  const user = toUser(r.rows[0]);
  res.status(201).json({ token: await createSession(user.id, device(req)), user });
}));

auth.post('/auth/login', wrap(async (req, res) => {
  const parsed = z.object({ identifier: z.string().trim().toLowerCase().min(3).max(254).optional(), email: emailSchema.optional(), password: z.string().min(1).max(72) }).safeParse(req.body);
  if (!parsed.success || !(parsed.data.identifier || parsed.data.email)) return void res.status(400).json({ error: '请输入账号名或邮箱和密码' });
  const identifier = parsed.data.identifier || parsed.data.email!;
  if (throttled(`login:${identifier}`, 8, 600000) || throttled(`login-ip:${req.ip}`, 40, 600000)) return void res.status(429).json({ error: '尝试次数过多，请 10 分钟后再试' });
  const r = await pool.query('SELECT * FROM users WHERE email=$1 OR lower(username)=$1', [identifier]);
  if (!await checkPassword(parsed.data.password, r.rows[0]?.password_hash ?? null)) return void res.status(401).json({ error: '账号名、邮箱或密码不正确' });
  attempts.delete(`login:${identifier}`);
  const user = toUser(r.rows[0]);
  res.json({ token: await createSession(user.id, device(req)), user });
}));

auth.post('/auth/logout', wrap(async (req, res) => { const key = sha(bearer(req)); cache.delete(key); await pool.query('DELETE FROM sessions WHERE token_hash=$1', [key]); res.json({ ok: true }); }));

auth.get('/me', requireUser(async (_req, res, cached) => {
  // 战绩在对局结算时更新，这里绕过会话缓存读最新值
  const fresh = await pool.query('SELECT * FROM users WHERE id=$1', [cached.id]);
  const user = fresh.rows[0] ? toUser(fresh.rows[0]) : cached;
  const room = await pool.query("SELECT id,status FROM rooms WHERE members @> $1::jsonb AND updated_at>now()-interval '2 hours' ORDER BY updated_at DESC LIMIT 1", [JSON.stringify([{ userId: user.id }])]);
  res.json({ user, activeRoom: room.rows[0] ? { id: room.rows[0].id, status: room.rows[0].status } : null });
}));
auth.post('/me', requireUser(async (req, res, user) => {
  const parsed = z.object({ username: usernameSchema.optional(), name: nameSchema.optional(), avatar: z.unknown().optional() }).safeParse(req.body);
  if (!parsed.success || (parsed.data.avatar !== undefined && !isAvatar(parsed.data.avatar))) return void res.status(400).json({ error: '昵称需为 1–12 字，账号名需为 3–24 位字母、数字或下划线，形象数据需合法' });
  try {
    const r = await pool.query('UPDATE users SET name=COALESCE($2,name), avatar=COALESCE($3,avatar), username=COALESCE(username,$4) WHERE id=$1 AND ($4::text IS NULL OR username IS NULL OR username=$4) RETURNING *', [user.id, parsed.data.name ? cleanName(parsed.data.name) : null, parsed.data.avatar ? JSON.stringify(parsed.data.avatar) : null, parsed.data.username ?? null]);
    if (!r.rows[0]) return void res.status(409).json({ error: '账号名设置后不能修改' });
    forget(user.id); res.json({ user: toUser(r.rows[0]) });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return void res.status(409).json({ error: '该账号名已被使用' });
    throw error;
  }
}));
/** 微信账号补绑邮箱，之后可在任意设备用邮箱密码登录同一账号。 */
auth.post('/me/email', requireUser(async (req, res, user) => {
  const parsed = z.object({ email: emailSchema, password: passwordSchema, code: z.string().regex(/^\d{6}$/).optional() }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: '请填写有效邮箱和 8–72 位密码' });
  if (user.email) return void res.status(409).json({ error: '此账号已绑定邮箱' });
  if (parsed.data.code && (!smtp || !await consumeCode(parsed.data.email, parsed.data.code))) return void res.status(400).json({ error: '邮箱验证码不正确或已过期' });
  const taken = await pool.query('SELECT 1 FROM users WHERE email=$1', [parsed.data.email]);
  if (taken.rows[0]) return void res.status(409).json({ error: '该邮箱已被其他账号使用' });
  const r = await pool.query('UPDATE users SET email=$2,password_hash=$3,email_verified_at=$4 WHERE id=$1 RETURNING *', [user.id, parsed.data.email, await hashPassword(parsed.data.password), parsed.data.code ? new Date() : null]);
  forget(user.id); res.json({ user: toUser(r.rows[0]) });
}));

/** 邮箱验证可随时补做；未验证不限制注册、登录或游戏。 */
auth.post('/me/email/verify', requireUser(async (req, res, user) => {
  if (!smtp) return void res.status(501).json({ error: '邮箱验证暂未开通，不影响账号登录和游戏' });
  const code = z.string().regex(/^\d{6}$/).safeParse(req.body?.code);
  if (!user.email || !code.success || !await consumeCode(user.email, code.data)) return void res.status(400).json({ error: '邮箱验证码不正确或已过期' });
  const r = await pool.query('UPDATE users SET email_verified_at=now() WHERE id=$1 RETURNING *', [user.id]);
  forget(user.id); res.json({ user: toUser(r.rows[0]) });
}));

auth.get('/leaderboard', wrap(async (_req, res) => {
  const r = await pool.query('SELECT name,avatar,games,wins,score FROM users WHERE games>0 ORDER BY score DESC, wins DESC, id LIMIT 20');
  res.json({ top: r.rows.map(x => ({ name: x.name, avatar: normalizeAvatar(x.avatar), games: x.games, wins: x.wins, score: x.score })) });
}));

/** 局域网入口：给手机 / 小程序看的地址和二维码。 */
auth.get('/lan', wrap(async (req, res) => {
  const origin = reachableOrigin(req.query.origin);
  if (!origin) return void res.status(400).json({ error: 'origin 无效' });
  res.json({ url: origin, addresses: lanAddresses(), local: /\/\/(localhost|127\.0\.0\.1)/.test(origin), qr: await QRCode.toString(origin, { type: 'svg', margin: 1 }) });
}));

// ---------- 扫码登录 ----------
// real：微信开放平台网站应用的官方二维码（需 AppID / Secret / 已备案授权域名）。
// mock：未配置 AppID 时的本机模拟，二维码指向本机页面，手机扫码后确认即可，流程与真实扫码一致。
auth.post('/auth/scan/start', wrap(async (req, res) => {
  if (throttled(`scan:${req.ip}`, 30, 600000)) return void res.status(429).json({ error: '二维码请求过多，请稍后再试' });
  if (!wechatWeb && !mockAllowed) return void res.status(501).json({ error: '微信扫码登录尚未开通：服务端还没有配置微信开放平台的 AppID / Secret。请先用邮箱登录。' });
  const ticket = randomBytes(16).toString('hex'), mode = wechatWeb ? 'real' : 'mock';
  await pool.query("DELETE FROM login_tickets WHERE expires_at<now()");
  await pool.query("INSERT INTO login_tickets(id,mode,expires_at) VALUES($1,$2,now()+interval '5 minutes')", [ticket, mode]);
  if (wechatWeb) return void res.json({ ticket, mode, url: `https://open.weixin.qq.com/connect/qrconnect?appid=${wechatWeb.id}&redirect_uri=${encodeURIComponent(`${wechatWeb.base}/api/auth/wechat/callback`)}&response_type=code&scope=snsapi_login&state=${ticket}&self_redirect=true#wechat_redirect` });
  const origin = reachableOrigin(req.body?.origin); if (!origin) return void res.status(400).json({ error: 'origin 无效' });
  const url = `${origin}/?scan=${ticket}`;
  res.json({ ticket, mode, url, qr: await QRCode.toString(url, { type: 'svg', margin: 1 }) });
}));
auth.get('/auth/wechat/callback', wrap(async (req, res) => {
  // 微信二维码内嵌 iframe 会跳到这里；页面只显示静态结果，不继承全站的禁止嵌入策略。
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const page = (text: string) => res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;display:grid;place-items:center;height:100vh;font:16px system-ui;background:#16302a;color:#f3ead3">${text}</body>`);
  const ticket = ticketSchema.safeParse(req.query.state);
  if (!wechatWeb || !ticket.success || typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 512) return void page('授权已取消或参数无效，请回到游戏重新扫码。');
  const pending = await pool.query("SELECT 1 FROM login_tickets WHERE id=$1 AND mode='real' AND user_id IS NULL AND expires_at>now()", [ticket.data]);
  if (!pending.rows[0]) return void page('二维码已过期，请回到游戏刷新后重新扫码。');
  const tok = await wechatJson(`https://api.weixin.qq.com/sns/oauth2/access_token?appid=${wechatWeb.id}&secret=${wechatWeb.secret}&code=${encodeURIComponent(req.query.code)}&grant_type=authorization_code`);
  const identity = wechatIdentity(tok, true);
  const info = await wechatJson(`https://api.weixin.qq.com/sns/userinfo?access_token=${encodeURIComponent(tok.access_token)}&openid=${encodeURIComponent(identity.openid)}`).catch((): Record<string, any> => ({}));
  const profile = wechatIdentity({ openid: identity.openid, unionid: identity.unionid || info.unionid });
  const user = await wechatUser(profile, typeof info.nickname === 'string' && info.nickname.trim() ? info.nickname : '微信牌友');
  const completed = await pool.query("UPDATE login_tickets SET user_id=$2 WHERE id=$1 AND mode='real' AND user_id IS NULL AND expires_at>now()", [ticket.data, user.id]);
  if (!completed.rowCount) return void page('二维码已过期或已被使用，请回到游戏重新扫码。');
  page('登录成功，请回到游戏。');
}));
auth.get('/auth/scan/info', wrap(async (req, res) => {
  const ticket = ticketSchema.safeParse(req.query.ticket);
  const r = ticket.success ? await pool.query('SELECT mode,user_id FROM login_tickets WHERE id=$1 AND expires_at>now()', [ticket.data]) : { rows: [] };
  res.json({ valid: !!r.rows[0] && !r.rows[0].user_id && r.rows[0].mode === 'mock', mock: mockAllowed });
}));
/** 手机端确认：已登录则把当前账号授权给电脑；未登录可走「模拟微信授权」（每台手机一个固定模拟身份）。 */
auth.post('/auth/scan/confirm', wrap(async (req, res) => {
  const parsed = z.object({ ticket: ticketSchema, mock: z.object({ deviceId: z.string().regex(/^[a-f0-9]{16,64}$/), name: nameSchema }).optional() }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: '二维码无效' });
  let user = await userOf(req), token: string | undefined;
  if (!user) {
    if (!parsed.data.mock || !mockAllowed) return void res.status(401).json({ error: '请先在手机上登录，或使用模拟微信授权' });
    user = await wechatUser({ openid: `mock:${parsed.data.mock.deviceId}` }, parsed.data.mock.name);
    token = await createSession(user.id, device(req));
  }
  const r = await pool.query("UPDATE login_tickets SET user_id=$2 WHERE id=$1 AND mode='mock' AND user_id IS NULL AND expires_at>now()", [parsed.data.ticket, user.id]);
  if (!r.rowCount) return void res.status(410).json({ error: '二维码已过期或已被使用，请在电脑上刷新' });
  res.json({ ok: true, user, token });
}));
auth.get('/auth/scan/poll', wrap(async (req, res) => {
  const ticket = ticketSchema.safeParse(req.query.ticket); if (!ticket.success) return void res.status(400).json({ error: '二维码无效' });
  const r = await pool.query('DELETE FROM login_tickets WHERE id=$1 AND user_id IS NOT NULL AND expires_at>now() RETURNING user_id', [ticket.data]);
  if (!r.rows[0]) { const alive = await pool.query('SELECT 1 FROM login_tickets WHERE id=$1 AND expires_at>now()', [ticket.data]); return void res.json({ status: alive.rows[0] ? 'pending' : 'expired' }); }
  const u = await pool.query('SELECT * FROM users WHERE id=$1', [r.rows[0].user_id]);
  const user = toUser(u.rows[0]);
  res.json({ status: 'done', token: await createSession(user.id, device(req)), user });
}));

/** 小程序：wx.login 的 code 换 openid；与网站应用同属一个开放平台账号时靠 unionid 归并。 */
auth.post('/auth/wechat/mini', wrap(async (req, res) => {
  if (!wechatMini) return void res.status(501).json({ error: '服务端未配置小程序 AppID / Secret，请使用邮箱登录' });
  const parsed = z.object({ code: z.string().min(1).max(128), name: nameSchema.optional() }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: '登录凭证无效' });
  const s = await wechatJson(`https://api.weixin.qq.com/sns/jscode2session?appid=${wechatMini.id}&secret=${wechatMini.secret}&js_code=${encodeURIComponent(parsed.data.code)}&grant_type=authorization_code`);
  const identity = wechatIdentity(s);
  const user = await wechatUser({ mini: identity.openid, unionid: identity.unionid }, parsed.data.name || '微信牌友');
  res.json({ token: await createSession(user.id, device(req)), user });
}));
