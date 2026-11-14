import * as THREE from 'three';
import { AVATAR_OPTIONS, avatarKey, headPixels, torsoPixels, shade, type Avatar } from '../../core/avatar';
import { gridTexture, type BlockTextures } from './pixels';

// 方块人：头 8×8×8、躯干 8×12×4、四肢 4×12×4（单位：像素 U）。原创造型，按账号形象拼装。
export const U = .08;
const SEAT_Y = -.55;                    // 坐面高度；站立时脚底正好落在地板 (-1.5)
const TORSO_TOP = SEAT_Y + 12 * U;
const BOX = new THREE.BoxGeometry(1, 1, 1);
type Model = { group: THREE.Group; body: THREE.Group; head: THREE.Group; arms: THREE.Group[]; legs: THREE.Group[]; dispose: () => void };
export type Figure = THREE.Group & { userData: { hold: THREE.Group; stool: THREE.Mesh; model: Model | null; key: string; mood: number; standing: boolean; pose: number } };

function buildModel(a: Avatar, tex: BlockTextures): Model {
  const owned: (THREE.Material | THREE.Texture)[] = [];
  const flat = (color: string) => { const m = new THREE.MeshLambertMaterial({ color }); owned.push(m); return m; };
  const mapped = (grid: string[][], flip = false) => { const t = gridTexture(grid, flip), m = new THREE.MeshLambertMaterial({ map: t }); owned.push(t, m); return m; };
  const box = (parent: THREE.Object3D, mat: THREE.Material | THREE.Material[], w: number, h: number, d: number, x = 0, y = 0, z = 0) => {
    const b = new THREE.Mesh(BOX, mat); b.scale.set(w * U, h * U, d * U); b.position.set(x * U, y * U, z * U); b.castShadow = true; parent.add(b); return b;
  };
  const O = AVATAR_OPTIONS, skin = flat(O.skin[a.skin]), top = flat(O.top[a.top]), pants = flat(O.pants[a.pants]), hair = flat(O.hairColor[a.hairColor]), shoe = flat('#2a2622');
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);

  // 躯干（人物面朝本地 -z，即牌桌中心）
  const torso = box(body, [top, top, top, top, mapped(torsoPixels(a, false)), mapped(torsoPixels(a, true))], 8, 12, 4); torso.position.y = SEAT_Y + 6 * U;
  // 头
  const head = new THREE.Group(); head.position.y = TORSO_TOP + 4 * U; body.add(head);
  box(head, [mapped(headPixels(a, 'side'), true), mapped(headPixels(a, 'side')), mapped(headPixels(a, 'top')), mapped(headPixels(a, 'bottom')), mapped(headPixels(a, 'back')), mapped(headPixels(a, 'front'))], 8, 8, 8);
  if (a.hair === 2) box(head, hair, 4, 3, 4, 0, 5.2, 1.5);
  if (a.hair === 5) for (const s of [-1, 1]) { box(head, hair, 2, 7, 2, s * 5, -1.5, 1.5); box(head, flat('#d9483a'), 2.3, 1, 2.3, s * 5, 1.2, 1.5); }
  // 帽子
  const straw = new THREE.MeshLambertMaterial({ map: tex.straw }), gold = flat('#f0c84a'); owned.push(straw);
  if (a.hat === 1) { box(head, straw, 15, 1, 15, 0, 4.4); box(head, straw, 10.5, 1.4, 10.5, 0, 5.6); box(head, straw, 5.5, 1.4, 5.5, 0, 7); box(head, flat('#8a6a2c'), 2, 1, 2, 0, 8.2); }
  if (a.hat === 2) { const m = new THREE.MeshLambertMaterial({ map: tex.brocade }); owned.push(m); box(head, [m, m, flat('#7e1d17'), flat('#7e1d17'), m, m], 8.8, 2.6, 8.8, 0, 3); box(head, flat('#b8322a'), 3, 4, 2, 3, 2.4, 4.6); }
  if (a.hat === 3) { box(head, straw, 14, .9, 14, 0, 4.2); box(head, straw, 8.6, 3, 8.6, 0, 5.6); box(head, flat('#b8322a'), 8.9, 1, 8.9, 0, 5); }
  if (a.hat === 4) { const cap = flat(shade(O.top[a.top], .75)); box(head, cap, 8.8, 2.6, 8.8, 0, 3.4); box(head, cap, 8, .8, 4, 0, 2.4, -6); box(head, flat('#f3ead3'), 2, 1.4, .4, 0, 3.6, -4.5); }
  if (a.hat === 5) { box(head, gold, 8.8, 1.6, 8.8, 0, 4.4); for (const [x, z] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6], [0, -3.6], [0, 3.6]]) box(head, gold, 1.6, 1.8, 1.6, x, 6, z); box(head, flat('#d9483a'), 1.6, 1.4, .5, 0, 4.4, -4.5); }
  // 手臂：肩轴在上端，向前抬起握牌
  const arms = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(s * 6 * U, TORSO_TOP - 2 * U, 0); body.add(pivot);
    box(pivot, top, 4, 8, 4, 0, -2); box(pivot, skin, 4, 4, 4, 0, -8);
    return pivot;
  });
  // 腿：髋轴在上端，坐姿时向前平伸
  const legs = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(s * 2 * U, SEAT_Y, 0); body.add(pivot);
    box(pivot, pants, 4, 9, 4, 0, -4.5); box(pivot, shoe, 4, 3, 4, 0, -10.5);
    return pivot;
  });
  return { group, body, head, arms, legs, dispose() { group.removeFromParent(); owned.forEach(o => o.dispose()); } };
}

/** 一个座位：固定的握牌锚点 + 可随形象更换的模型。 */
export function makeFigure(tex: BlockTextures): Figure {
  const root = new THREE.Group() as Figure;
  const side = new THREE.MeshLambertMaterial({ map: tex.logSide }), top = new THREE.MeshLambertMaterial({ map: tex.logTop });
  const stool = new THREE.Mesh(BOX, [side, side, top, top, side, side]); stool.scale.set(.8, .95, .8); stool.position.y = SEAT_Y - .475; stool.castShadow = stool.receiveShadow = true; root.add(stool);
  const hold = new THREE.Group(); hold.position.set(0, .34, -.86); hold.rotation.x = -.3; root.add(hold);
  root.userData = { hold, stool, model: null, key: '', mood: 0, standing: false, pose: 0 };
  return root;
}
export function setFigureAvatar(f: Figure, a: Avatar | null, tex: BlockTextures) {
  const key = a ? avatarKey(a) : '';
  if (key === f.userData.key) return;
  f.userData.model?.dispose(); f.userData.model = null; f.userData.key = key;
  if (a) { const m = buildModel(a, tex); f.add(m.group); f.userData.model = m; }
}
export function animateFigure(f: Figure, t: number, dt: number, active: boolean, phase: number) {
  const m = f.userData.model; if (!m) return;
  // pose：0 = 入座握牌，1 = 站立展示
  f.userData.pose += ((f.userData.standing ? 1 : 0) - f.userData.pose) * (1 - Math.exp(-dt * 8));
  const p = f.userData.pose, sit = 1 - p;
  f.userData.stool.visible = p < .5;
  m.body.position.y = Math.sin(t * 1.4 + phase) * .012;
  m.body.rotation.x = sit * (active ? -.07 + Math.sin(t * 2) * .02 : Math.sin(t * .6 + phase) * .015);
  m.head.rotation.y = Math.sin(t * .4 + phase) * (active ? .3 : .14);
  m.head.rotation.x = sit * (active ? .14 : .04);
  m.arms.forEach((a, i) => {
    const s = i ? 1 : -1;
    a.rotation.x = sit * (1.32 + Math.sin(t * 1.1 + phase + i) * .04) + p * (i ? Math.sin(t * 5) * .12 : Math.sin(t * 1.3) * .08);
    a.rotation.z = sit * s * -.16 + p * (i ? 2.5 + Math.sin(t * 5) * .28 : -.06);   // 站立时右手挥手
  });
  m.legs.forEach((l, i) => { l.rotation.x = sit * 1.5; l.rotation.y = sit * (i ? -.14 : .14); l.position.y = SEAT_Y + sit * 2 * U; });
  if (f.userData.mood > 0) { f.userData.mood -= dt; m.body.position.y += Math.abs(Math.sin(f.userData.mood * 12)) * .1 * Math.min(1, f.userData.mood * 2); }
}
/** 名牌锚点高度（含帽子）。 */
export const FIGURE_TOP = TORSO_TOP + 8 * U + .42;
