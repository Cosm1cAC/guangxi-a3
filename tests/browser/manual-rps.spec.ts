import {test,expect,type Page} from '@playwright/test';
import {createGame,createNextGame,tributeAction,type TributeAction,type Game} from '../../src/core/game';

const apply=(g:Game,seat:number,action:TributeAction)=>{const r=tributeAction(g,seat,action);if(!r.ok)throw Error(r.error);return r.state;};
function duel(){let g=createNextGame({...createGame(),status:'finished',teams:[1,1,0,0],order:[0,1,2,3],scores:[2,2,-2,-2]});g=apply(g,0,{kind:'select',cards:[0,1]});g=apply(g,1,{kind:'select',cards:[1,2]});return apply(g,0,{kind:'rps-start',opponent:1});}
async function restore(page:Page,g:Game){await page.clock.install();await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;Object.defineProperty(HTMLCanvasElement.prototype,'getContext',{value:function(type:string,...args:unknown[]){return type.startsWith('webgl')?null:Reflect.apply(original,this,[type,...args]);}});});await page.addInitScript(state=>sessionStorage.setItem('a3-practice',JSON.stringify(state)),g);await page.goto('/');}
const stored=(page:Page)=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('a3-practice')!));

test('玩家必须手动选手势并确认：等待、快捷键、只选中、刷新都不代出',async({page})=>{
  await restore(page,duel());await expect(page.locator('#rps-arena')).toBeVisible();await expect(page.locator('#rps-confirm')).toBeDisabled();
  await page.clock.runFor(60000);expect((await stored(page)).tribute.selection.duel.moves[0]).toBeUndefined();
  await page.keyboard.press('h');await page.keyboard.press('Space');await page.keyboard.press('Enter');expect((await stored(page)).tribute.selection.duel.moves[0]).toBeUndefined();
  await page.locator('[data-rps="rock"]').click();await expect(page.locator('#rps-confirm')).toBeEnabled();expect((await stored(page)).tribute.selection.duel.moves[0]).toBeUndefined();
  await page.reload();await expect(page.locator('#rps-confirm')).toBeDisabled();expect((await stored(page)).tribute.selection.duel.moves[0]).toBeUndefined();
  await page.locator('[data-rps="paper"]').click();await page.locator('#rps-confirm').click();
  const after=await stored(page),last=after.tribute.contests.at(-1);
  expect(after.tribute.selection?.duel?.moves[0]||last?.moves[last.players.indexOf(0)]).toBe('paper');
});

test('平手后清除选择，必须重新手动确认；像素猜拳区横竖屏可用',async({page})=>{
  let g=duel();const d=g.tribute!.selection!.duel!;g=apply(g,1,{kind:'rps',move:'rock',round:d.round,duelId:d.id});
  await restore(page,g);await page.locator('[data-rps="rock"]').click();await page.locator('#rps-confirm').click();
  await expect(page.locator('.rps-tie')).toContainText('平手');await expect(page.locator('#rps-confirm')).toBeDisabled();
  await page.clock.runFor(60000);expect((await stored(page)).tribute.selection.duel.moves[0]).toBeUndefined();
  for(const size of [{width:1440,height:1000},{width:320,height:568},{width:390,height:844},{width:568,height:320},{width:844,height:390}]){
    await page.setViewportSize(size);await page.clock.runFor(80);const box=(await page.locator('.rps-window').boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width);expect(box.y+box.height).toBeLessThanOrEqual(size.height+1);
    await expect(page.locator('#rps-confirm')).toBeInViewport();await page.screenshot({path:`artifacts/manual-rps-${size.width}.png`});
  }
});

test('先出完的玩家可展开队友手牌，牌为只读，花色有独立像素轮廓',async({page})=>{
  const g={...createGame(),hands:[[],[{rank:9,suit:0}],[{rank:13,suit:1},{rank:13,suit:3}],[{rank:10,suit:2}]],teams:[1,0,1,0],finishedNaturally:[0],order:[0],turn:1,first:false};
  await restore(page,g);await expect(page.locator('#teammate-toggle')).toBeVisible();await expect(page.locator('.observed-card')).toHaveCount(0);
  await page.locator('#teammate-toggle').click();await expect(page.locator('.observed-card')).toHaveCount(2);await expect(page.locator('.observed-card[aria-label="梅花K"]')).toBeVisible();await expect(page.locator('.observed-card[aria-label="黑桃K"]')).toBeVisible();
  await expect(page.locator('.observed-card button')).toHaveCount(0);await expect(page.locator('#play')).toBeDisabled();await page.screenshot({path:'artifacts/teammate-hands.png'});
});
