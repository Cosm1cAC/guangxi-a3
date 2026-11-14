import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { DEFAULT_AVATAR } from '../src/core/avatar';

const database = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../server/db', () => ({ pool: database }));

let server: Server, base: string;
const actualFetch = globalThis.fetch;
const tickets = new Map<string, number | null>();
const user = { id: '73', name: '测试牌友', email: null, avatar: DEFAULT_AVATAR, games: 0, wins: 0, score: 0, wechat_openid: 'fixture-openid', mini_openid: null, password_hash: null };
let registered = false;

beforeAll(async () => {
  vi.stubEnv('WECHAT_APP_ID', 'wx0000000000000000');
  vi.stubEnv('WECHAT_APP_SECRET', 'fixture-secret');
  vi.stubEnv('WECHAT_REDIRECT_BASE', 'https://login.example.com');
  vi.stubEnv('A3_WECHAT_MOCK', '0');
  database.query.mockImplementation(async (sql: string, values: any[] = []) => {
    if (sql.startsWith('DELETE FROM login_tickets WHERE expires_at')) return { rows: [] };
    if (sql.startsWith('INSERT INTO login_tickets')) { tickets.set(values[0], null); return { rows: [] }; }
    if (sql.startsWith('SELECT 1 FROM login_tickets')) return { rows: tickets.has(values[0]) && (!sql.includes('user_id IS NULL') || tickets.get(values[0]) === null) ? [{}] : [] };
    if (sql.startsWith('SELECT * FROM users WHERE (')) return { rows: registered ? [user] : [] };
    if (sql.startsWith('INSERT INTO users')) { registered = true; return { rows: [user] }; }
    if (sql.startsWith('UPDATE users SET wechat_unionid')) return { rows: [user] };
    if (sql.startsWith('UPDATE login_tickets')) {
      const eligible = tickets.has(values[0]) && tickets.get(values[0]) === null;
      if (eligible) tickets.set(values[0], values[1]);
      return { rows: [], rowCount: eligible ? 1 : 0 };
    }
    if (sql.startsWith('DELETE FROM login_tickets WHERE id=')) {
      const id = tickets.get(values[0]);
      if (id) { tickets.delete(values[0]); return { rows: [{ user_id: id }] }; }
      return { rows: [] };
    }
    if (sql.startsWith('SELECT * FROM users WHERE id=')) return { rows: [user] };
    if (sql.startsWith('INSERT INTO sessions')) return { rows: [] };
    throw Error(`Unexpected fixture query: ${sql}`);
  });
  vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname !== 'api.weixin.qq.com') return actualFetch(input, init);
    return Promise.resolve(Response.json(url.pathname.endsWith('access_token')
      ? { openid: 'fixture-openid', unionid: 'fixture-unionid', access_token: 'fixture-token' }
      : { nickname: '测试牌友', unionid: 'fixture-unionid' }));
  }));
  const { auth } = await import('../server/auth');
  const app = express(); app.use(express.json());
  app.use((_req, res, next) => { res.setHeader('Content-Security-Policy', "frame-ancestors 'none'"); next(); });
  app.use('/api', auth);
  server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});

afterAll(async () => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
});

test('网站扫码 → 官方回调 → 游戏会话；重复登录复用账号，票据不能重放', async () => {
  const config = await (await fetch(base + '/api/auth/config')).json();
  expect(config.wechat).toBe('real');
  expect(JSON.stringify(config)).not.toContain('fixture-secret');
  for (let attempt = 0; attempt < 2; attempt++) {
    const scan = await (await fetch(base + '/api/auth/scan/start', { method: 'POST' })).json();
    expect(scan.mode).toBe('real');
    const qr = new URL(scan.url);
    expect(qr.hostname).toBe('open.weixin.qq.com');
    expect(qr.searchParams.get('scope')).toBe('snsapi_login');
    expect(qr.searchParams.get('redirect_uri')).toBe('https://login.example.com/api/auth/wechat/callback');
    expect(qr.searchParams.get('state')).toBe(scan.ticket);
    const callback = await fetch(base + `/api/auth/wechat/callback?state=${scan.ticket}&code=fixture-code`);
    expect(await callback.text()).toContain('登录成功');
    expect(callback.headers.get('content-security-policy')).not.toContain("frame-ancestors 'none'");
    expect(callback.headers.get('cache-control')).toBe('no-store');
    const replay = await fetch(base + `/api/auth/wechat/callback?state=${scan.ticket}&code=fixture-code`);
    expect(await replay.text()).toContain('二维码已过期');
    const session = await (await fetch(base + `/api/auth/scan/poll?ticket=${scan.ticket}`)).json();
    expect(session).toMatchObject({ status: 'done', user: { id: 73, wechat: true } });
    expect(session.token).toMatch(/^[a-f0-9]{64}$/);
    expect(await (await fetch(base + `/api/auth/scan/poll?ticket=${scan.ticket}`)).json()).toEqual({ status: 'expired' });
  }
  expect(database.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO users'))).toHaveLength(1);
  const storedSessions = database.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO sessions'));
  expect(storedSessions).toHaveLength(2);
  expect(storedSessions[0][1][0]).toMatch(/^[a-f0-9]{64}$/);
});

test('伪造 state 或空 code 不访问微信接口', async () => {
  const before = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('api.weixin.qq.com')).length;
  const response = await fetch(base + '/api/auth/wechat/callback?state=invalid&code=invalid');
  expect(await response.text()).toContain('参数无效');
  expect(await (await fetch(base + '/api/auth/wechat/callback?state=' + 'a'.repeat(32) + '&code=')).text()).toContain('参数无效');
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('api.weixin.qq.com'))).toHaveLength(before);
});
