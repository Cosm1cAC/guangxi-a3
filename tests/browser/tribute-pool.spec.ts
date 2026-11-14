import { test, expect } from '@playwright/test';
import { createGame, createNextGame, tributeAction, type Game, type TributeAction } from '../../src/core/game';

function apply(g:Game,seat:number,action:TributeAction){const r=tributeAction(g,seat,action);if(!r.ok)throw Error(r.error);return r.state;}
async function restore(page:import('@playwright/test').Page,g:Game){
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;Object.defineProperty(HTMLCanvasElement.prototype,'getContext',{value:function(type:string,...args:unknown[]){return type.startsWith('webgl')?null:Reflect.apply(original,this,[type,...args]);}});});
  await page.addInitScript(game=>sessionStorage.setItem('a3-practice',JSON.stringify(game)),g);await page.goto('/');
}
const next=()=>createNextGame({...createGame(),status:'finished',teams:[1,1,0,0],order:[0,1,2,3],scores:[2,2,-2,-2]});

test('贡牌池预选与改选：大贡选两张，无冲突后才能等量还贡',async({page})=>{
  await page.clock.install();await restore(page,next());
  await expect(page.locator('#tribute-choice')).toBeVisible();await expect(page.locator('[data-tribute-card]')).toHaveCount(4);
  await expect(page.locator('#play')).toBeDisabled();await expect(page.locator('#tribute-confirm')).toBeDisabled();
  await page.locator('[data-tribute-card="0"]').click();await page.locator('[data-tribute-card="1"]').click();
  await expect(page.locator('#tribute-confirm')).toBeEnabled();await page.locator('#tribute-confirm').click();
  await expect(page.locator('#tribute-choice')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('a3-practice')!).hands[0].length)).toBe(13);
  await page.locator('[data-tribute-card="0"]').click();await page.locator('[data-tribute-card="2"]').click();await page.locator('#tribute-confirm').click();
  const pre=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('a3-practice')!));expect(pre.tribute.selection.choices[0]).toEqual([1,2]);
  await page.clock.runFor(10000);
  await expect(page.locator('#tribute-choice')).toBeHidden();await expect(page.locator('#turn-banner')).toContainText('待还 2 张');
  await page.locator('#hint').click();await page.locator('#play').click();await expect(page.locator('#turn-banner')).toContainText('待还 1 张');
  await page.locator('#hint').click();await page.locator('#play').click();await page.clock.runFor(10000);
  const after=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('a3-practice')!));
  expect(after.status).toBe('playing');expect(after.tribute.transfers.every((t:any)=>!!t.back)).toBe(true);
});

test('猜拳处理冲突：对方手势提交前不公开，胜者保留预选',async({page})=>{
  let g=apply(next(),0,{kind:'select',cards:[0,1]});g=apply(g,1,{kind:'select',cards:[1,2]});
  await page.clock.install();await restore(page,g);
  await expect(page.locator('.tribute-status')).toContainText('选牌有冲突');await expect(page.locator('[data-rps-start="1"]')).toBeVisible();
  await page.locator('[data-rps-start="1"]').click();await expect(page.locator('[data-rps]')).toHaveCount(3);
  for(const size of [{width:1440,height:1000},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(size);const box=(await page.locator('#tribute-choice').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width);expect(box.y).toBeGreaterThanOrEqual(0);
    await page.screenshot({path:`artifacts/tribute-rps-${size.width}.png`});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-rps="rock"]').click();await expect(page.locator('.tribute-status')).toContainText('你已出拳');
  await expect(page.locator('[data-rps="paper"]')).toBeDisabled();
  // The stored move is private; the UI shows only submission status until both move.
  await expect(page.locator('.rps-result')).toHaveCount(0);
  await page.clock.runFor(1500);
  await expect.poll(async()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('a3-practice')!).tribute.contests.length)).toBeGreaterThan(0);
});

test('结算显示独食身份，去掉补位字样',async({page})=>{
  const g={...createGame(),status:'finished' as const,teams:[0,0,0,1],order:[0,2,3,1],finishedNaturally:[0,2,3],scores:[2,-6,2,2]};
  // Seat 1 is the solo player in this result; retain the early-finish metadata.
  g.teams=[0,1,0,0];await restore(page,g);
  await expect(page.locator('dialog.result')).toBeVisible();await expect(page.locator('.results')).toContainText('独食');await expect(page.locator('.results')).not.toContainText('补位');
  await page.screenshot({path:'artifacts/solo-result.png'});
});
