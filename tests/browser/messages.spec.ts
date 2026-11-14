import { test, expect } from '@playwright/test';
import { createGame } from '../../src/core/game';

test('桌面与手机：牌局提示居中，长提示不溢出',async({page})=>{
  const g=createGame();g.turn=0;g.first=false;
  // Exercise the responsive HUD without depending on software WebGL screenshots.
  await page.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype,'getContext',{value:function(type:string,...args:unknown[]){
      return type.startsWith('webgl')?null:Reflect.apply(getContext,this,[type,...args]);
    }});
  });
  await page.addInitScript(state=>sessionStorage.setItem('a3-practice',JSON.stringify(state)),g);
  await page.goto('/');
  for(const size of [{width:1440,height:1000},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(size);
    await expect(page.locator('#turn-banner')).toBeVisible();
    await expect.poll(async()=>{
      const box=(await page.locator('#turn-banner').boundingBox())!;
      return Math.abs(box.y+box.height/2-size.height/2);
    }).toBeLessThan(2);
    const banner=(await page.locator('#turn-banner').boundingBox())!;
    expect(Math.abs(banner.x+banner.width/2-size.width/2)).toBeLessThan(2);
    // With no selection, the keyboard action produces a transient game prompt.
    await page.keyboard.press('Space');
    await expect(page.locator('#toast')).toHaveClass('visible');
    await expect.poll(async()=>{
      const box=(await page.locator('#toast').boundingBox())!;
      return Math.abs(box.y+box.height/2-(size.height/2+56));
    }).toBeLessThan(2);
    const toast=(await page.locator('#toast').boundingBox())!;
    expect(toast.y).toBeGreaterThanOrEqual(banner.y+banner.height);
    expect(Math.abs(toast.x+toast.width/2-size.width/2)).toBeLessThan(2);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`artifacts/centered-messages-${size.width}.png`});
  }
});
