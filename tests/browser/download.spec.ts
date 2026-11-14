import {test,expect} from '@playwright/test';

test('安卓下载页显示正式版本、GitHub附件和手机安装说明',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1000});await page.goto('/download/');
  await expect(page.locator('h1')).toContainText('装进口袋。');
  await expect(page.locator('#version')).toHaveText('v1.0.1');
  await expect(page.locator('#download')).toHaveAttribute('href','https://github.com/Cosm1cAC/guangxi-a3/releases/download/v1.0.1/shanshui-a3.apk');
  await expect(page.locator('#sha')).toHaveText(/^[a-f0-9]{64}$/);
  await page.screenshot({path:'artifacts/download-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/download-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('微信内提示用外部浏览器下载安装',async({browser})=>{
  const context=await browser.newContext({userAgent:'Mozilla/5.0 Android MicroMessenger/8.0',viewport:{width:390,height:844}});
  const page=await context.newPage();await page.goto('/download/');
  await expect(page.locator('#wechat')).toBeVisible();
  await context.close();
});
