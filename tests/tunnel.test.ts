import { expect, test } from 'vitest';
// @ts-expect-error Node startup helpers are plain JavaScript.
import { cpolarArgs, cpolarEnvironment, cpolarPublicUrl } from '../scripts/cpolar.mjs';

test('国内穿透只映射游戏、使用HTTPS，不沿用系统代理',()=>{
  const args=cpolarArgs('local-auth.yml',3001);
  expect(args).toContain('-region=cn');
  expect(args).toContain('-proto=https');
  expect(args).toContain('-inspect-addr=127.0.0.1:0');
  expect(args.at(-1)).toBe('127.0.0.1:3001');
  expect(args).not.toContain('-authtoken');
  expect(cpolarEnvironment({PATH:'safe',HTTP_PROXY:'proxy',https_proxy:'proxy',ALL_PROXY:'proxy',NO_PROXY:'localhost'})).toEqual({PATH:'safe',NO_PROXY:'localhost'});
});

test('从穿透输出提取HTTPS地址，排除后台、HTTP与伪造域名',()=>{
  expect(cpolarPublicUrl('Forwarding https://abc.cpolar.cn -> 127.0.0.1:3001')).toBe('https://abc.cpolar.cn');
  expect(cpolarPublicUrl('url=https://abc.cpolar.top')).toBe('https://abc.cpolar.top');
  expect(cpolarPublicUrl('url=https://abc.r9.cpolar.cn')).toBe('https://abc.r9.cpolar.cn');
  expect(cpolarPublicUrl('https://old.r9.cpolar.cn https://new.r9.cpolar.cn')).toBe('https://new.r9.cpolar.cn');
  for(const value of ['http://abc.cpolar.cn','https://dashboard.cpolar.com','https://abc.cpolar.cn.evil.example','https://other.example'])expect(cpolarPublicUrl(value)).toBeNull();
});
