import { test, expect } from '@playwright/test';
import { createGame, isIdentity } from '../../src/core/game';

test('直排手牌、身份牌提醒，桌面和手机无横向溢出',async({page})=>{
  let n=1;const fixture=createGame(()=>((n=(n*1664525+1013904223)>>>0)/4294967296));
  const owner=fixture.hands.findIndex(h=>h.some(isIdentity));
  [fixture.hands[0],fixture.hands[owner]]=[fixture.hands[owner],fixture.hands[0]];
  fixture.teams=fixture.hands.map(h=>h.some(isIdentity)?1:0);
  fixture.log.push('1号位 · 对子 ♠A ♥A');
  await page.addInitScript(g=>sessionStorage.setItem('a3-practice',JSON.stringify(g)),fixture);
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  await expect(page.locator('#identity-held')).toContainText('你持有 ♠');
  await expect(page.locator('#identity-played')).toContainText('阿桂 已打出：');
  await expect(page.locator('#hand .card')).toHaveCount(13);
  await page.waitForTimeout(1800);
  await page.screenshot({path:'artifacts/straight-hand-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(800);
  await page.screenshot({path:'artifacts/straight-hand-mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
