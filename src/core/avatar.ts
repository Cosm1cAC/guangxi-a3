// 人物形象：平台无关的数据定义与像素生成，Web、服务端、小程序共用。
// 所有部位都是「调色板下标」，服务端只需校验整数范围。
export type Avatar = { skin: number; hair: number; hairColor: number; eyes: number; top: number; pants: number; hat: number; extra: number };

export const AVATAR_OPTIONS = {
  skin: ['#f4d0ab', '#e8b88a', '#d6a47a', '#b9835a', '#8f5d3b', '#63402a'],
  hair: ['短发', '长发', '丸子头', '光头', '斜刘海', '双马尾'],
  hairColor: ['#1d1a18', '#4a2f1d', '#8a5a2b', '#c9a24a', '#b9442e', '#d9d9d9', '#3d6fb5', '#b06ac2'],
  eyes: ['#2b2118', '#3b6fb0', '#3f8a55', '#7a4a22', '#7d5bb5'],
  top: ['#2f5d8a', '#b8322a', '#3f7b4a', '#d6a03a', '#7a4fa0', '#e8e2d0', '#2b2f36', '#d9668b', '#2c8f8f'],
  pants: ['#30415c', '#3b2a22', '#4a4a4a', '#7a6a4a', '#1f3b2c', '#6a2a2a'],
  hat: ['不戴', '斗笠', '壮锦头巾', '草帽', '鸭舌帽', '金冠'],
  extra: ['无', '眼镜', '胡子', '腮红'],
} as const;
export const AVATAR_LABELS: Record<keyof Avatar, string> = { skin: '肤色', hair: '发型', hairColor: '发色', eyes: '瞳色', top: '上衣', pants: '裤子', hat: '帽子', extra: '配饰' };
export const AVATAR_KEYS = Object.keys(AVATAR_LABELS) as (keyof Avatar)[];
export const DEFAULT_AVATAR: Avatar = { skin: 1, hair: 0, hairColor: 0, eyes: 0, top: 0, pants: 0, hat: 0, extra: 0 };
/** 机器人牌友的固定形象（座位 1–3）。 */
export const BOT_AVATARS: Avatar[] = [
  { skin: 2, hair: 0, hairColor: 0, eyes: 0, top: 0, pants: 1, hat: 1, extra: 2 },
  { skin: 0, hair: 5, hairColor: 1, eyes: 3, top: 7, pants: 0, hat: 2, extra: 3 },
  { skin: 3, hair: 3, hairColor: 5, eyes: 0, top: 2, pants: 3, hat: 3, extra: 1 },
];

/** 把任意输入收敛成合法形象；非法字段回落到默认值。 */
export function normalizeAvatar(input: unknown): Avatar {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_AVATAR };
  for (const k of AVATAR_KEYS) { const v = src[k]; if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < AVATAR_OPTIONS[k].length) out[k] = v; }
  return out;
}
export function isAvatar(input: unknown): input is Avatar {
  if (!input || typeof input !== 'object') return false;
  const src = input as Record<string, unknown>;
  return AVATAR_KEYS.every(k => { const v = src[k]; return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < AVATAR_OPTIONS[k].length; });
}
export function randomAvatar(random: () => number = Math.random): Avatar {
  const out = { ...DEFAULT_AVATAR };
  for (const k of AVATAR_KEYS) out[k] = Math.floor(random() * AVATAR_OPTIONS[k].length);
  return out;
}
export const avatarKey = (a: Avatar) => AVATAR_KEYS.map(k => a[k]).join('.');

export function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f <= 1 ? v * f : v + (255 - v) * (f - 1)))).toString(16).padStart(2, '0');
  return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

export type HeadFace = 'front' | 'back' | 'side' | 'top' | 'bottom';
/** 头发覆盖：side 面的 x=0 为靠脸一侧。 */
function hairAt(style: number, face: HeadFace, x: number, y: number) {
  if (style === 3 || face === 'bottom') return false;
  if (face === 'top') return true;
  if (style === 1) return face === 'back' || (face === 'front' ? y <= 1 || ((x === 0 || x === 7) && y <= 6) : y <= 1 || x >= 3);
  if (style === 4) return face === 'front' ? y <= 1 || (y === 2 && x <= 4) || (y === 3 && x <= 1) : face === 'side' ? y <= 3 : y <= 4;
  return face === 'front' ? y <= 1 : face === 'side' ? y <= 2 || (y === 3 && x >= 6) : y <= 3;
}
/** 8×8 的头部像素（十六进制颜色，行优先，第 0 行在上）。 */
export function headPixels(a: Avatar, face: HeadFace): string[][] {
  const skin = AVATAR_OPTIONS.skin[a.skin], hair = AVATAR_OPTIONS.hairColor[a.hairColor], eye = AVATAR_OPTIONS.eyes[a.eyes];
  const g: string[][] = [];
  for (let y = 0; y < 8; y++) {
    g.push([]);
    for (let x = 0; x < 8; x++) {
      const h = hairAt(a.hair, face, x, y);
      // 轻微的棋盘明暗，让纯色块有手绘像素的质感
      const f = ((x * 7 + y * 13 + (face === 'side' ? 3 : 0)) % 5 === 0) ? .93 : ((x + y * 3) % 7 === 0 ? 1.06 : 1);
      g[y].push(shade(h ? hair : skin, face === 'bottom' ? .8 : f));
    }
  }
  if (face === 'front') {
    g[4][1] = '#ffffff'; g[4][6] = '#ffffff'; g[4][2] = eye; g[4][5] = eye;
    g[6][3] = shade(skin, .62); g[6][4] = shade(skin, .62);
    if (!hairAt(a.hair, 'front', 2, 3)) { g[3][1] = shade(hair, .9); g[3][2] = shade(hair, .9); }
    g[3][5] = shade(hair, .9); g[3][6] = shade(hair, .9);
    if (a.extra === 1) for (const [x, y] of [[0, 4], [3, 4], [4, 4], [7, 4], [1, 3], [2, 3], [5, 3], [6, 3], [1, 5], [2, 5], [5, 5], [6, 5]]) g[y][x] = '#22262b';
    if (a.extra === 2) { for (let x = 1; x <= 6; x++) g[7][x] = shade(hair, .85); for (const x of [1, 2, 5, 6]) g[6][x] = shade(hair, .85); g[5][3] = shade(hair, .85); g[5][4] = shade(hair, .85); }
    if (a.extra === 3) { g[5][1] = '#f08a8a'; g[5][6] = '#f08a8a'; }
  }
  if (face === 'side' && a.extra === 1) for (let x = 0; x <= 4; x++) g[4][x] = '#22262b';
  return g;
}
/** 8×12 的躯干正面：斜襟、腰带（壮族上衣的简化像素版）。 */
export function torsoPixels(a: Avatar, front: boolean): string[][] {
  const top = AVATAR_OPTIONS.top[a.top], trim = shade(top, a.top === 5 ? .7 : 1.45), skin = AVATAR_OPTIONS.skin[a.skin];
  const g: string[][] = [];
  for (let y = 0; y < 12; y++) { g.push([]); for (let x = 0; x < 8; x++) g[y].push(shade(top, (x * 5 + y * 3) % 6 === 0 ? .92 : 1)); }
  for (let x = 0; x < 8; x++) g[8][x] = trim;
  if (front) { g[0][3] = skin; g[0][4] = skin; g[1][3] = trim; g[1][4] = trim; for (let y = 2; y < 8; y++) g[y][Math.min(6, 4 + Math.floor((y - 2) / 2))] = trim; g[8][3] = '#f0d59a'; g[8][4] = '#f0d59a'; }
  return g;
}
