import { test, expect, type Page } from '@playwright/test';

// 需要 API 与 PostgreSQL 在运行（node scripts/start.mjs）；未运行时跳过。
test('账号名与邮箱登录、独立昵称、形象与好友房多端续局', async ({ page, browser, request }) => {
  const health = await request.get('/api/health').catch(() => null);
  test.skip(!health?.ok(), 'API 未运行');
  test.setTimeout(360000);   // 三个软件渲染的 WebGL 页面同时运行，比较慢
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const email = `e2e-${Date.now().toString(36)}@example.com`, password = 'e2e-password-1';
  const token = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem('a3-session') || 'null')?.token as string | undefined);

  // 邮箱注册
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto('/');
  await expect(page.locator('body.webgl')).toHaveCount(1);
  await page.locator('#account').click();
  await expect(page.getByRole('heading', { name: '登录山水尖3' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/web-login.png' });
  await page.locator('#au-switch').click();
  await expect(page.locator('[data-tab=scan], #scan-box')).toHaveCount(0);
  await page.locator('#au-username').fill('e2e_'+Date.now().toString(36));
  const username=await page.locator('#au-username').inputValue();
  await page.locator('#au-email').fill(email); await page.locator('#au-pass').fill('short'); await page.locator('#au-name').fill('方块阿牛');
  await page.locator('#au-submit').click(); await expect(page.locator('#au-error')).toContainText('至少 8 位');
  await page.locator('#au-pass').fill(password); await page.locator('#au-submit').click();
  await expect(page.locator('#account')).toContainText('方块阿牛');

  // 换装并保存到账号
  await page.locator('#dress').click(); await expect(page.locator('#wardrobe')).toBeVisible();
  await page.locator('#wardrobe .chip', { hasText: '斗笠' }).click(); await page.locator('#wardrobe .chip', { hasText: '眼镜' }).click();
  await page.locator('#wd-save').click(); await expect(page.locator('#wardrobe')).toBeHidden();
  const me = await request.get('/api/me', { headers: { Authorization: `Bearer ${await token(page)}` } });
  expect((await me.json()).user.avatar).toMatchObject({ hat: 1, extra: 1 });

  // 资料页：局域网二维码
  await page.locator('#account').click(); await expect(page.locator('#pf-lan .qr, #pf-lan p').first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/web-profile.png' });
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  // 创建好友房
  await page.locator('#online').click(); await page.locator('#create-room').click();
  await expect(page.locator('#turn-banner')).toContainText('等待牌友入座');
  const room = (await page.locator('.room-code').first().textContent())!.trim();
  expect(room).toMatch(/^[A-F0-9]{10}$/);

  // 第二台设备（手机）：同一账号登录，大厅出现「回到牌桌」，回到同一房间
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: 'http://127.0.0.1:5173' });
  const phone = await phoneCtx.newPage(); phone.on('pageerror', e => errors.push(e.message));
  await phone.goto('/'); await phone.locator('#account').click();
  await phone.locator('#au-email').fill(email); await phone.locator('#au-pass').fill(password); await phone.locator('#au-submit').click();
  await expect(phone.locator('#resume')).toBeVisible(); await expect(phone.locator('#resume-room')).toContainText(room);
  await phone.locator('#resume').click();
  await expect(phone.locator('#turn-banner')).toContainText(room);

  // 第三台设备使用独立账号名登录同一账号。
  const pcCtx = await browser.newContext({viewport:{width:1280,height:800},baseURL:'http://127.0.0.1:5173'});
  const pc=await pcCtx.newPage();pc.on('pageerror',e=>errors.push(e.message));
  await pc.goto('/');await pc.locator('#account').click();
  await pc.locator('#au-email').fill(username.toUpperCase());await pc.locator('#au-pass').fill(password);await pc.locator('#au-submit').click();
  await expect(pc.locator('#account')).toContainText('方块阿牛');
  await expect(pc.locator('#account')).not.toContainText(username);
  await expect(pc.locator('#resume')).toBeVisible();
  await expect(pc.locator('#server-presence')).toHaveText(/在线 \d+\/20/);

  await phoneCtx.close(); await pcCtx.close();
  expect(errors).toEqual([]);
});
