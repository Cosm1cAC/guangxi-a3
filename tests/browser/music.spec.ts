import { test, expect } from '@playwright/test';
import { MUSIC_TRACKS } from '../../src/core/music';

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype,'getContext',{value:function(type:string,...args:unknown[]){return type.startsWith('webgl')?null:Reflect.apply(getContext,this,[type,...args]);}});
    localStorage.setItem('a3-sound',JSON.stringify({sfx:false,ambient:false,music:false,volume:.8}));
  });
});

test('四首真实音频可播放，上一首／下一首、进度、模式、暂停与设置记忆',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.locator('#sound').click();await expect(page.locator('#music-list [data-track]')).toHaveCount(4);
  for(const track of MUSIC_TRACKS){
    await page.locator(`[data-track="${track.id}"]`).click();await expect(page.locator('#music-title')).toHaveText(track.title);
    await expect(page.locator('#music-status')).toHaveText('正在播放');
    await expect.poll(async()=>Number(await page.locator('#music-progress').getAttribute('max'))).toBeGreaterThan(30);
  }
  await page.locator('#music-prev').click();await expect(page.locator('#music-title')).toHaveText(MUSIC_TRACKS[2].title);
  await page.locator('#music-next').click();await expect(page.locator('#music-title')).toHaveText(MUSIC_TRACKS[3].title);
  await page.locator('#music-mode').selectOption('single');
  await page.locator('#music-progress').evaluate((input:HTMLInputElement)=>{input.value='30';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect(page.locator('#music-current')).toHaveText(/0:3\d/);
  await page.locator('#music-volume').evaluate((input:HTMLInputElement)=>{input.value='.35';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#music-play').click();await expect(page.locator('#music-status')).toHaveText('已暂停');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('a3-sound')!).music)).toBe(false);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('a3-music')!));expect(saved).toMatchObject({trackId:MUSIC_TRACKS[3].id,mode:'single',volume:.35,enabled:false});
  await page.reload();await page.locator('#sound').click();await expect(page.locator('#music-title')).toHaveText(MUSIC_TRACKS[3].title);await expect(page.locator('#music-mode')).toHaveValue('single');
  expect(errors).toEqual([]);
});

test('手机横竖屏的留声机完整可操作，授权文件可访问',async({page})=>{
  await page.goto('/');await page.locator('#sound').click();
  await expect(page.locator('body')).toHaveClass(/flat/);await expect(page.locator('#toast')).not.toHaveClass('visible');
  for(const size of [{width:1440,height:1000},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(size);const panel=page.locator('#sound-panel');await expect(panel).toBeVisible();
    const box=(await panel.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width);expect(box.y+box.height).toBeLessThanOrEqual(size.height);
    await page.locator('#music-next').click();await expect(page.locator('#music-title')).toHaveText(/Yoiyami|Vaporware|Mystical|First/);
    await page.screenshot({path:`artifacts/music-player-${size.width}.png`});
  }
  const credits=await page.request.get('/audio/CREDITS.txt');expect(credits.ok()).toBe(true);expect(await credits.text()).toContain('CC0 1.0 Universal');
  expect((await page.request.get('/audio/CC0-1.0.txt')).ok()).toBe(true);
});

test('音频加载失败可重试与切换，不阻断牌局界面',async({page})=>{
  await page.route('**/audio/first-light.mp3',route=>route.abort('failed'));
  await page.goto('/');await page.locator('#sound').click();await page.locator('[data-track="first-light"]').click();
  await expect(page.locator('#music-error')).toBeVisible();await expect(page.locator('#music-retry')).toBeVisible();
  await page.unroute('**/audio/first-light.mp3');await page.locator('#music-retry').click();await expect(page.locator('#music-status')).toHaveText('正在播放');
  await page.locator('#music-next').click();await expect(page.locator('#music-title')).toHaveText(MUSIC_TRACKS[1].title);await expect(page.locator('#music-status')).toHaveText('正在播放');
});
