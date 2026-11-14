import * as THREE from 'three';
import { type Card } from '../../core/game';

// 像素扑克：在 40×56 的格子上逐格绘制，再整数倍放大成纹理，近看是清晰的方格。
export const CARD_W = .62, CARD_H = .868;
const GW = 40, GH = 56, PX = 8;
const INK = '#1f2428', RED = '#c23a30', PAPER = '#f6f0dc', PAPER_2 = '#e9dfc2', GOLD = '#d6a03a';
const isRed = (c: Card) => c.suit === 0 || c.suit === 2;

const GLYPH: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '..#..', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  10: ['#.###', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.###'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
};
const SUIT = [
  ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],  // ♦
  ['..###..', '..###..', '#######', '#######', '##.#.##', '...#...', '..###..'],  // ♣
  ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],  // ♥
  ['...#...', '..###..', '.#####.', '#######', '##.#.##', '...#...', '..###..'],  // ♠
];
const rankKey = (rank: number) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[rank] ?? String(rank));

type Grid = (string | null)[][];
const grid = (): Grid => Array.from({ length: GH }, () => Array<string | null>(GW).fill(null));
function stamp(g: Grid, rows: string[], x0: number, y0: number, color: string, scale = 1, flip = false) {
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '#') return;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const px = x0 + x * scale + dx, py = y0 + y * scale + dy, X = flip ? GW - 1 - px : px, Y = flip ? GH - 1 - py : py;
      if (X >= 0 && X < GW && Y >= 0 && Y < GH) g[Y][X] = color;
    }
  }));
}
function frame(g: Grid, inset: number, color: string) { for (let x = inset; x < GW - inset; x++) { g[inset][x] = color; g[GH - 1 - inset][x] = color; } for (let y = inset; y < GH - inset; y++) { g[y][inset] = color; g[y][GW - 1 - inset] = color; } }
function toCanvas(g: Grid) {
  const c = document.createElement('canvas'); c.width = GW * PX; c.height = GH * PX;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (g[y][x]) { ctx.fillStyle = g[y][x]!; ctx.fillRect(x * PX, y * PX, PX, PX); }
  return c;
}

function drawFace(c: Card) {
  const g = grid(), col = isRed(c) ? RED : INK, key = rankKey(c.rank);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) g[y][x] = (x * 3 + y * 7) % 11 === 0 ? PAPER_2 : PAPER;
  const identity = c.suit === 3 && (c.rank === 14 || c.rank === 3), first = c.suit === 0 && c.rank === 4;
  frame(g, 0, INK); frame(g, 1, identity ? GOLD : first ? '#3f9a62' : PAPER_2);
  if (identity || first) frame(g, 2, identity ? GOLD : '#3f9a62');
  stamp(g, GLYPH[key], 3, 3, col, 2); stamp(g, SUIT[c.suit], 4, 19, col);
  if (c.rank >= 11 && c.rank <= 13) {
    // 花牌：像素窗格里的大字
    for (let y = 23; y < 52; y++) for (let x = 15; x < 37; x++) g[y][x] = (x === 15 || x === 36 || y === 23 || y === 51) ? col : (x + y) % 2 ? PAPER : PAPER_2;
    stamp(g, GLYPH[key], 18, 27, col, 3);
  } else stamp(g, SUIT[c.suit], 15, 27, col, 3);
  if (identity) for (const [x, y] of [[32, 4], [31, 5], [32, 5], [33, 5], [32, 6], [30, 5], [34, 5], [32, 3], [32, 7]]) g[y][x] = RED;
  return toCanvas(g);
}

function drawBack() {
  const g = grid();
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const dx = Math.abs(x - 19.5), dy = Math.abs(y - 27.5), lattice = (x + y) % 6 === 0 || (x - y + 60) % 6 === 0, d = dx + dy * .72;
    g[y][x] = d < 5 ? '#f0d59a' : Math.abs(d - 9) < 1 ? '#d6a03a' : lattice ? '#2f8f86' : (x + y) % 2 ? '#1c5f66' : '#18555c';
  }
  frame(g, 0, '#0d2c33'); frame(g, 1, '#d6a03a'); frame(g, 2, '#0d2c33');
  return toCanvas(g);
}

let backTex: THREE.Texture | null = null;
const faceTex = new Map<string, THREE.Texture>();
let aniso = 4;
export function setAnisotropy(n: number) { aniso = n; }
function tex(cv: HTMLCanvasElement) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.magFilter = THREE.NearestFilter; return t; }
export function faceTexture(c: Card) { const k = `${c.rank}-${c.suit}`; let t = faceTex.get(k); if (!t) { t = tex(drawFace(c)); faceTex.set(k, t); } return t; }
export function backTexture() { return backTex ??= tex(drawBack()); }

const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
export type CardObj = THREE.Group & { userData: { id?: string; card?: Card; face: THREE.Mesh; back: THREE.Mesh; faceMat: THREE.MeshLambertMaterial } };

export function makeCard(card: Card | null): CardObj {
  const g = new THREE.Group() as CardObj;
  const faceMat = new THREE.MeshLambertMaterial({ map: card ? faceTexture(card) : backTexture() });
  // polygonOffset pushes the back face slightly away so stacked cards never z-fight
  const backMat = new THREE.MeshLambertMaterial({ map: backTexture(), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  const face = new THREE.Mesh(geo, faceMat), back = new THREE.Mesh(geo, backMat);
  back.rotation.y = Math.PI; back.position.z = -.0012;
  face.castShadow = back.castShadow = true; face.receiveShadow = true;
  g.add(face, back);
  g.userData = { face, back, faceMat, card: card ?? undefined, id: card ? `${card.rank}-${card.suit}` : undefined };
  return g;
}
export function revealCard(obj: CardObj, card: Card) {
  obj.userData.card = card; obj.userData.id = `${card.rank}-${card.suit}`; obj.userData.faceMat.map = faceTexture(card); obj.userData.faceMat.needsUpdate = true;
}
export function disposeCard(obj: CardObj) {
  obj.removeFromParent(); obj.userData.faceMat.dispose(); (obj.userData.back.material as THREE.Material).dispose();
}
