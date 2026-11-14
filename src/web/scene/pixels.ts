import * as THREE from 'three';

// 自绘 16×16 像素纹理：全部由代码生成，不含任何第三方美术素材。
export function rand(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
export type Put = (x: number, y: number, color: string) => void;

export function pixelTexture(w: number, h: number, draw: (put: Put, r: () => number) => void, seed = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw((x, y, color) => { g.fillStyle = color; g.fillRect(x, y, 1, 1); }, rand(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** 把十六进制颜色网格画成纹理（人物头部、躯干用）。 */
export function gridTexture(grid: string[][], flipX = false) {
  const h = grid.length, w = grid[0].length;
  const t = pixelTexture(w, h, put => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(flipX ? w - 1 - x : x, y, grid[y][x]); });
  t.generateMipmaps = false; t.minFilter = THREE.NearestFilter;
  return t;
}
const noise = (palette: string[], seed: number) => pixelTexture(16, 16, (put, r) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) put(x, y, palette[Math.floor(r() * r() * palette.length)]); }, seed);

export function blockTextures() {
  const grass = ['#6fb34a', '#63a543', '#7cc152', '#588f3c', '#86cc5a'];
  const dirt = ['#8a6238', '#7c5631', '#96703f', '#6c4a2a', '#a17b48'];
  const stone = ['#9aa3a6', '#8c9598', '#a8b0b2', '#7c8689', '#b5bcbd'];
  const grassTop = noise(grass, 11);
  const dirtTex = noise(dirt, 23);
  const grassSide = pixelTexture(16, 16, (put, r) => {
    for (let x = 0; x < 16; x++) { const d = 2 + Math.floor(r() * 3); for (let y = 0; y < 16; y++) put(x, y, (y < d ? grass : dirt)[Math.floor(r() * r() * 5)]); }
  }, 31);
  const stoneTex = pixelTexture(16, 16, (put, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) put(x, y, stone[Math.floor(r() * r() * 5)]);
    for (let k = 0; k < 5; k++) { const x = Math.floor(r() * 13), y = Math.floor(r() * 15); for (let i = 0; i < 3 + Math.floor(r() * 3); i++) put((x + i) % 16, y + (i > 2 ? 1 : 0), '#6d777a'); }
  }, 47);
  const mossTex = pixelTexture(16, 16, (put, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) put(x, y, r() < .42 - y * .012 ? grass[Math.floor(r() * 5)] : stone[Math.floor(r() * r() * 5)]);
  }, 53);
  const planks = pixelTexture(16, 16, (put, r) => {
    const tones = ['#b98a4e', '#ad7f46', '#c39558', '#a3763f'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / 4), seam = y % 4 === 3 || (x + row * 5) % 16 === 0;
      put(x, y, seam ? '#7a5529' : tones[(row + (r() < .25 ? 1 : 0)) % 4]);
    }
  }, 61);
  const darkPlanks = pixelTexture(16, 16, (put, r) => {
    const tones = ['#6b3f26', '#62381f', '#75472b', '#5a321c'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const row = Math.floor(y / 4); put(x, y, y % 4 === 3 || (x + row * 7) % 16 === 0 ? '#3d2112' : tones[(row + (r() < .25 ? 1 : 0)) % 4]); }
  }, 67);
  const logSide = pixelTexture(16, 16, (put, r) => {
    const tones = ['#6a4a2a', '#5c3f22', '#775432', '#50361d'];
    for (let x = 0; x < 16; x++) { let c = Math.floor(r() * 4); for (let y = 0; y < 16; y++) { if (r() < .18) c = Math.floor(r() * 4); put(x, y, tones[c]); } }
  }, 71);
  const logTop = pixelTexture(16, 16, put => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); put(x, y, d > 7 ? '#5c3f22' : Math.floor(d) % 2 ? '#b58d55' : '#c9a36a'); }
  });
  const leaves = pixelTexture(16, 16, (put, r) => {
    const tones = ['#3f8a35', '#35782d', '#4a9b3e', '#2b6425', '#57ab49'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) put(x, y, r() < .16 ? '#1f4a1c' : tones[Math.floor(r() * 5)]);
  }, 83);
  const felt = pixelTexture(16, 16, (put, r) => {
    const tones = ['#2f7d5c', '#2b7556', '#338563', '#286e50'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) put(x, y, (x % 4 === 0 && y % 4 === 0) ? '#3c9471' : tones[Math.floor(r() * r() * 4)]);
  }, 89);
  // 桌心：像素铜鼓太阳纹
  const emblem = pixelTexture(16, 16, (put, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy), ray = Math.abs(dx) < 1 || Math.abs(dy) < 1 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 1;
      put(x, y, d < 2.2 ? '#f0d59a' : d < 5.2 && ray ? '#d6b36e' : Math.abs(d - 6.6) < .6 ? '#d6b36e' : ['#2f7d5c', '#2b7556', '#338563'][Math.floor(r() * 3)]);
    }
  }, 97);
  const roof = pixelTexture(16, 16, (put, r) => {
    const tones = ['#34525c', '#2d4850', '#3c5d68'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const row = Math.floor(y / 4), edge = y % 4 === 3 || (x + row * 4) % 8 === 0; put(x, y, edge ? '#1f3238' : tones[Math.floor(r() * 3)]); }
  }, 101);
  const water = pixelTexture(16, 16, (put, r) => {
    const tones = ['#3f8fd0', '#3987c8', '#4698d8', '#3380c0'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) put(x, y, tones[Math.floor(r() * r() * 4)]);
    for (let k = 0; k < 6; k++) { const x = Math.floor(r() * 16), y = Math.floor(r() * 16), n = 2 + Math.floor(r() * 4); for (let i = 0; i < n; i++) put((x + i) % 16, y, '#8cc8f2'); }
  }, 107);
  const sand = noise(['#e2d3a0', '#d8c892', '#ebdcab', '#cdbd86'], 113);
  const lantern = pixelTexture(16, 16, put => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const frame = x === 0 || x === 15 || y === 0 || y === 15, bar = x === 5 || x === 10 || y === 7 || y === 8;
      put(x, y, frame ? '#5a2a14' : bar ? '#d6a03a' : (x + y) % 5 === 0 ? '#ffd27a' : '#ff8a3a');
    }
  });
  const straw = pixelTexture(16, 16, (put, r) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) put(x, y, (x + y) % 4 === 0 ? '#a8843f' : ['#d9b86a', '#cdaa5c', '#e3c478'][Math.floor(r() * 3)]); }, 127);
  // 壮锦：菱形回纹
  const brocade = pixelTexture(16, 4, put => {
    const tones = ['#b8322a', '#f0d59a', '#2f5d8a', '#3f7b4a'];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) put(x, y, y === 0 || y === 3 ? '#7e1d17' : tones[(x + (y === 1 ? 0 : 2)) % 4 === 0 ? 1 : (Math.floor(x / 4) % 2 ? 2 : 0)]);
  });
  return { grassTop, grassSide, dirt: dirtTex, stone: stoneTex, moss: mossTex, planks, darkPlanks, logSide, logTop, leaves, felt, emblem, roof, water, sand, lantern, straw, brocade };
}
export type BlockTextures = ReturnType<typeof blockTextures>;
