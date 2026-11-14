import { expect, test } from 'vitest';
import { createPresence } from '../server/presence';

test('在线人数按浏览器或账号去重，登录后合并游客，超时下线', () => {
  let now = 100000;
  const presence = createPresence(20, () => now);
  expect(presence.touch('browser-a')).toEqual({online:1,capacity:20});
  expect(presence.touch('browser-a')).toEqual({online:1,capacity:20});
  expect(presence.touch('browser-b')).toEqual({online:2,capacity:20});
  expect(presence.touch('browser-a', 7).online).toBe(2);
  expect(presence.touch('browser-a').online).toBe(2);
  expect(presence.touch('browser-a', 7).online).toBe(2);
  expect(presence.touch('browser-c', 7).online).toBe(2);
  now += 59000;
  expect(presence.touch('browser-c', 7).online).toBe(2);
  now += 1000;
  expect(presence.count()).toEqual({online:1,capacity:20});
  now += 60000;
  expect(presence.count().online).toBe(0);
});
