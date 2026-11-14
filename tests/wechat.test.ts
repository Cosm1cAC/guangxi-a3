import { afterEach, describe, expect, test, vi } from 'vitest';
import { wechatIdentity, wechatJson } from '../server/wechat';

afterEach(() => vi.unstubAllGlobals());

describe('微信服务端响应', () => {
  test('有效凭证保留 openid / unionid，不向账号系统传递 access_token', () => {
    expect(wechatIdentity({ openid: 'test-openid', unionid: 'test-unionid', access_token: 'private-token' }, true))
      .toEqual({ openid: 'test-openid', unionid: 'test-unionid' });
  });
  test.each([{}, { openid: '' }, { openid: 123 }, { openid: 'valid' }])('网站授权缺少身份凭证时拒绝建号：%j', data => {
    expect(() => wechatIdentity(data, true)).toThrow('微信授权响应缺少身份凭证');
  });
  test('小程序只要求 openid，忽略无效 unionid', () => {
    expect(wechatIdentity({ openid: 'mini-openid', unionid: {} })).toEqual({ openid: 'mini-openid', unionid: undefined });
  });
  test('正常微信响应可解析，错误码可诊断', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ openid: 'test' }))
      .mockResolvedValueOnce(Response.json({ errcode: 40125, errmsg: 'invalid secret' })));
    expect(await wechatJson('https://api.weixin.qq.com/test')).toEqual({ openid: 'test' });
    await expect(wechatJson('https://api.weixin.qq.com/test')).rejects.toMatchObject({ wechat: true, message: '微信接口错误 40125' });
  });
  test.each([new Response('bad gateway', { status: 502 }), new Response('<html>error</html>'), Response.json(null), Response.json([])])('HTTP 或响应故障归为微信错误', async response => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(wechatJson('https://api.weixin.qq.com/test')).rejects.toMatchObject({ wechat: true });
  });
  test('网络异常不泄漏请求 URL 中的 Secret', async () => {
    const secretUrl = 'https://api.weixin.qq.com/test?secret=private-secret';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error(`failed ${secretUrl}`)));
    await expect(wechatJson(secretUrl)).rejects.toMatchObject({ message: '微信接口连接失败或响应无效', wechat: true });
  });
});
