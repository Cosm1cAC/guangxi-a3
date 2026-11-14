import { test, expect, type Page } from '@playwright/test';

// 需要 API 与 PostgreSQL 在运行（node scripts/start.mjs）；未运行时跳过。
test('账号、形象、好友房多端续局与扫码登录', async ({ page, browser, request }) => {
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

  // 第三台设备：扫码登录，由已登录的手机确认
  const pcCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, baseURL: 'http://127.0.0.1:5173' });
  const pc = await pcCtx.newPage(); pc.on('pageerror', e => errors.push(e.message));
  await pc.goto('/'); await pc.locator('#account').click(); await pc.locator('[data-tab="scan"]').click();
  const link = pc.locator('.scan-box a');
  await expect(link).toBeVisible(); await pc.screenshot({ path: 'artifacts/web-scan.png' });
  const url = new URL((await link.getAttribute('href'))!);
  const scanner = phone; await scanner.goto(`/${url.search}`);   // 手机扫到的就是这个地址
  await expect(scanner.getByRole('heading', { name: '在另一台设备上登录？' })).toBeVisible();
  await scanner.locator('#sc-ok').click();
  await expect(pc.locator('#account')).toContainText('方块阿牛');
  await expect(pc.locator('#resume')).toBeVisible();

  await phoneCtx.close(); await pcCtx.close();
  expect(errors).toEqual([]);
});
