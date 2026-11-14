// 用铜鼓太阳纹徽标生成安卓图标（自适应前景 + 旧版方形 / 圆形）。徽标改动后运行：node scripts/android-assets.mjs
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const svg = readFileSync('public/assets/emblem.svg', 'utf8');
// 前景只要纹样本身：去掉徽标自带的圆角底板，底色交给自适应图标的背景层
const mark = svg.replace(/<rect[^>]*\/>/, '');
const data = s => `data:image/svg+xml;utf8,${encodeURIComponent(s)}`;
const res = 'android/app/src/main/res';
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
async function shot(file, size, html) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent;width:${size}px;height:${size}px;display:grid;place-items:center">${html}</body>`);
  await page.screenshot({ path: file, omitBackground: true });
  await page.close();
}
for (const [name, k] of Object.entries(densities)) {
  mkdirSync(`${res}/mipmap-${name}`, { recursive: true });
  const fg = Math.round(108 * k), legacy = Math.round(48 * k);
  // 自适应图标的安全区是中间 66/108，纹样占 60%
  await shot(`${res}/mipmap-${name}/ic_launcher_foreground.png`, fg, `<img src="${data(mark)}" style="width:${Math.round(fg * .6)}px;height:${Math.round(fg * .6)}px">`);
  await shot(`${res}/mipmap-${name}/ic_launcher.png`, legacy, `<img src="${data(svg)}" style="width:${legacy}px;height:${legacy}px">`);
  await shot(`${res}/mipmap-${name}/ic_launcher_round.png`, legacy, `<div style="width:${legacy}px;height:${legacy}px;border-radius:50%;background:#173f48;display:grid;place-items:center"><img src="${data(mark)}" style="width:${Math.round(legacy * .86)}px;height:${Math.round(legacy * .86)}px"></div>`);
}
await browser.close();
console.log('Android icons written to', res);
