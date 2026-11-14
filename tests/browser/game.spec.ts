import {test,expect} from '@playwright/test';
test('桌面与手机：渲染、规则、选牌、提示出牌与重新开局',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:1000});await page.goto('/');
 await expect(page.getByRole('heading',{name:'山水尖3'})).toBeVisible();await expect(page.locator('body.webgl')).toHaveCount(1);
 await page.screenshot({path:'artifacts/web-lobby.png',fullPage:true});
 await page.getByRole('button',{name:'玩法说明'}).click();await expect(page.getByRole('heading',{name:'一看就会的尖3'})).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('button',{name:/开始练习/}).click();await expect(page.locator('#hand .card')).toHaveCount(13);
 await expect(page.locator('#hint')).toBeEnabled({timeout:15000});
 // 轮到自己时也可能压不过：过牌后等下一手，直到提示能选出牌
 for(let i=0;i<12;i++){await page.locator('#hint').click();if(await page.locator('.card.selected').count())break;await page.locator('#pass').click();await expect(page.locator('#hint')).toBeEnabled({timeout:30000});}
 await expect(page.locator('.card.selected').first()).toBeVisible();
 const before=await page.locator('#hand .card').count();await page.locator('#play').click();await expect.poll(()=>page.locator('#hand .card').count()).toBeLessThan(before);
 await page.screenshot({path:'artifacts/web-table.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/web-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#restart').click();await page.getByRole('button',{name:'开始新练习'}).click();await expect(page.locator('#hand .card')).toHaveCount(13);
 // sound panel toggles persist
 await page.locator('#sound').click();await expect(page.locator('#sound-panel')).toBeVisible();await page.locator('#sound-panel [data-key="music"] + span').click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('a3-sound')||'{}').music)).toBe(false);
 expect(errors).toEqual([]);
});
