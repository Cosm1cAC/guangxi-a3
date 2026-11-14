import * as THREE from 'three';
import { blockTextures, rand, type BlockTextures } from './pixels';

// 方块漓江：体素喀斯特峰林、木平台茶亭、方块灯笼与牌桌。1 个方块 = 1 个世界单位。
const SKY_TOP = new THREE.Color(0x4a8fe8), SKY_HORIZON = new THREE.Color(0xbfe0ff);
export const FLOOR_Y = -1.5, WATER_Y = -2.6;
const BOX = new THREE.BoxGeometry(1, 1, 1);

/** 收集同材质方块，一次性生成 InstancedMesh。 */
class Batch {
  private list: number[] = [];
  add(x: number, y: number, z: number, sx = 1, sy = sx, sz = sx) { this.list.push(x, y, z, sx, sy, sz); return this; }
  get count() { return this.list.length / 6; }
  build(parent: THREE.Object3D, material: THREE.Material | THREE.Material[], cast = false, receive = false) {
    const mesh = new THREE.InstancedMesh(BOX, material, this.count), m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) { const o = i * 6; m.compose(p.set(this.list[o], this.list[o + 1], this.list[o + 2]), q, s.set(this.list[o + 3], this.list[o + 4], this.list[o + 5])); mesh.setMatrixAt(i, m); }
    mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = cast; mesh.receiveShadow = receive; mesh.frustumCulled = false;
    parent.add(mesh); return mesh;
  }
}
const lambert = (map: THREE.Texture, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ map, ...extra });
/** BoxGeometry 的材质顺序：+x, -x, +y, -y, +z, -z。 */
const cube = (side: THREE.Material, top: THREE.Material, bottom = top) => [side, side, top, bottom, side, side];

function materials(t: BlockTextures) {
  const m = {
    grassTop: lambert(t.grassTop), grassSide: lambert(t.grassSide), dirt: lambert(t.dirt), stone: lambert(t.stone), moss: lambert(t.moss),
    planks: lambert(t.planks), dark: lambert(t.darkPlanks), logSide: lambert(t.logSide), logTop: lambert(t.logTop), leaves: lambert(t.leaves),
    felt: lambert(t.felt), emblem: lambert(t.emblem), roof: lambert(t.roof), sand: lambert(t.sand),
  };
  return { ...m, grass: cube(m.grassSide, m.grassTop, m.dirt), log: cube(m.logSide, m.logTop) };
}
type Mats = ReturnType<typeof materials>;

// ---------- 天空、方形太阳、方块云 ----------
function sky(scene: THREE.Scene) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 top; uniform vec3 horizon;
      void main(){ float h = floor(clamp(vDir.y,0.,1.)*14.)/14.; gl_FragColor = vec4(mix(horizon, top, pow(h,.7)),1.);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 12), mat); dome.renderOrder = -10; scene.add(dome);
  const sunDir = new THREE.Vector3(-.5, .62, -.6).normalize();
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(38, 38), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }));
  sun.position.copy(sunDir).multiplyScalar(380); sun.lookAt(0, 0, 0); scene.add(sun);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(52, 52), new THREE.MeshBasicMaterial({ color: 0xffe9a0, fog: false, transparent: true, opacity: .35, depthWrite: false }));
  halo.position.copy(sunDir).multiplyScalar(382); halo.lookAt(0, 0, 0); scene.add(halo);
  return sunDir;
}
function clouds(scene: THREE.Scene) {
  const r = rand(5), b = new Batch(), SPAN = 640;
  for (let i = 0; i < 26; i++) {
    const cx = (r() - .5) * SPAN, cz = -40 - r() * 260 + (r() < .25 ? 240 : 0), y = 58 + r() * 26;
    for (let k = 0, n = 2 + Math.floor(r() * 4); k < n; k++) b.add(cx + (r() - .5) * 30, y, cz + (r() - .5) * 18, 12 + Math.floor(r() * 3) * 6, 3, 10 + Math.floor(r() * 2) * 6);
  }
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: .9 });
  const groups = [new THREE.Group(), new THREE.Group()];
  groups.forEach(g => { b.build(g, mat); scene.add(g); });
  return (t: number) => { const x = (t * 1.6) % SPAN; groups[0].position.x = x; groups[1].position.x = x - SPAN; };
}

// ---------- 水面 ----------
function water(scene: THREE.Scene, t: BlockTextures) {
  t.water.repeat.set(450, 450);
  const w = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ map: t.water, transparent: true, opacity: .86 }));
  w.rotation.x = -Math.PI / 2; w.position.y = WATER_Y; w.receiveShadow = true; scene.add(w);
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ color: 0x1f5f9a }));
  bed.rotation.x = -Math.PI / 2; bed.position.y = WATER_Y - 1.6; scene.add(bed);
  // 像方块游戏里的水一样逐格流动，而不是平滑滚动
  return (time: number) => { const step = Math.floor(time * 2.5); t.water.offset.set((step % 16) / 32, (Math.floor(step / 3) % 16) / 32); };
}

// ---------- 体素喀斯特峰林 ----------
function peaks(scene: THREE.Scene, m: Mats) {
  const r = rand(42), grass = new Batch(), stone = new Batch(), moss = new Batch();
  const layers = [
    { count: 9, dist: [44, 66], h: [9, 14], S: 2 },
    { count: 13, dist: [76, 124], h: [12, 20], S: 2 },
    { count: 14, dist: [136, 210], h: [10, 17], S: 4 },
  ];
  for (const L of layers) for (let n = 0; n < L.count; n++) {
    const a = Math.PI + (r() - .5) * Math.PI * 1.75, d = L.dist[0] + r() * (L.dist[1] - L.dist[0]);
    const H = Math.round(L.h[0] + r() * (L.h[1] - L.h[0])), R = Math.max(2, Math.round(H * (.2 + r() * .12))), seed = r() * 100, lean = (r() - .5) * .25;
    const S = L.S, cx = Math.round(Math.sin(a) * d / S) * S, cz = Math.round(Math.cos(a) * d / S) * S;
    const height = (i: number, j: number) => {
      const dd = Math.hypot(i, j) / (R + .5 + .6 * Math.sin(Math.atan2(j, i) * 3 + seed)); if (dd >= 1) return 0;
      return Math.max(1, Math.round(H * Math.sqrt(1 - dd ** 3) * (1 + .12 * Math.sin(i * 1.9 + seed) * Math.cos(j * 1.6 + seed))));
    };
    for (let i = -R - 1; i <= R + 1; i++) for (let j = -R - 1; j <= R + 1; j++) {
      const h = height(i, j); if (!h) continue;
      const low = Math.min(h - 1, height(i + 1, j), height(i - 1, j), height(i, j + 1), height(i, j - 1));
      for (let y = low; y < h; y++) {
        const top = y === h - 1, shift = Math.round(lean * y);
        (top ? grass : r() < (y > h * .6 ? .3 : .1) ? moss : stone).add(cx + (i + shift) * S, WATER_Y - 1 + (y + .5) * S, cz + j * S, S);
      }
    }
  }
  grass.build(scene, m.grass); stone.build(scene, m.stone); moss.build(scene, m.moss);
}

// ---------- 小岛与方块树 ----------
function islands(scene: THREE.Scene, m: Mats) {
  const r = rand(19), grass = new Batch(), dirt = new Batch(), sand = new Batch(), log = new Batch(), leaves = new Batch();
  const tree = (x: number, y: number, z: number) => {
    const h = 3 + Math.floor(r() * 3);
    for (let k = 0; k < h; k++) log.add(x, y + k, z);
    for (let dy = 0; dy < 4; dy++) { const w = dy < 2 ? 2 : 1; for (let i = -w; i <= w; i++) for (let j = -w; j <= w; j++) { if ((dy < 2 && Math.abs(i) === 2 && Math.abs(j) === 2 && r() < .7) || (dy === 3 && i && j) || (!i && !j && dy < 1)) continue; leaves.add(x + i, y + h - 1 + dy, z + j); } }
  };
  for (const [cx, cz, R, H, trees] of [[-21, -17, 7, 3, 3], [23, -21, 8, 4, 3], [-27, 7, 6, 3, 2], [27, 9, 6, 2, 2], [2, -33, 10, 5, 4], [-44, -30, 9, 4, 3], [46, -34, 9, 4, 3]]) {
    const height = (i: number, j: number) => { const d = Math.hypot(i, j) / (R + Math.sin(i * 1.3 + cx) * .8); return d >= 1 ? 0 : 1 + Math.round(H * (1 - d * d)); };
    const tops: [number, number, number][] = [];
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const h = height(i, j); if (!h) continue;
      const y = Math.floor(WATER_Y) + h - .5 + .1;
      if (h === 1) sand.add(cx + i, y, cz + j); else { grass.add(cx + i, y, cz + j); dirt.add(cx + i, y - 1, cz + j); if (h > 2) tops.push([cx + i, y + 1, cz + j]); }
    }
    for (let k = 0; k < trees && tops.length; k++) tree(...tops.splice(Math.floor(r() * tops.length), 1)[0]);
  }
  grass.build(scene, m.grass, false, true); dirt.build(scene, m.dirt); sand.build(scene, m.sand); log.build(scene, m.log, true); leaves.build(scene, m.leaves, true);
}

// ---------- 茶亭：木平台、栏杆、原木柱、阶梯屋顶、方块灯笼 ----------
export type Lantern = { group: THREE.Group; light: THREE.PointLight; phase: number };
function pavilion(scene: THREE.Scene, m: Mats, t: BlockTextures) {
  const N = 8, deck = new Batch(), logs = new Batch(), beams = new Batch(), fence = new Batch();
  for (let x = -N; x <= N; x++) for (let z = -N; z <= N; z++) deck.add(x, FLOOR_Y - .5, z);
  for (const x of [-N, 0, N]) for (const z of [-N, 0, N]) if (x || z) for (let y = FLOOR_Y - 1.5; y > WATER_Y - 2; y--) logs.add(x, y, z);
  for (const x of [-N, N]) for (const z of [-N, N]) for (let y = FLOOR_Y + .5; y < 6.5; y++) logs.add(x, y, z);
  // 远侧与两翼的栏杆；靠近镜头的一侧留空
  for (let i = -N + 1; i < N; i++) for (const [x, z, along] of [[i, -N, 0], [-N, i, 1], [N, i, 1]] as const) {
    fence.add(x, FLOOR_Y + .5, z, .25, 1, .25);
    fence.add(x, FLOOR_Y + .85, z, along ? .14 : 1, .14, along ? 1 : .14); fence.add(x, FLOOR_Y + .4, z, along ? .14 : 1, .14, along ? 1 : .14);
  }
  const lobbyOnly = new THREE.Group(); scene.add(lobbyOnly);
  const nearBeam = new Batch(), roof = new Batch();
  for (let i = -N; i <= N; i++) { beams.add(i, 7, -N); nearBeam.add(i, 7, N); if (Math.abs(i) < N) { beams.add(-N, 7, i); beams.add(N, 7, i); } }
  for (let k = 0; k < 5; k++) { const n = 10 - k * 2; for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) if (k === 4 || Math.max(Math.abs(x), Math.abs(z)) >= n - 1) roof.add(x, 8 + k, z); }
  deck.build(scene, m.planks, false, true); logs.build(scene, m.log, true, true); fence.build(scene, m.dark, true); beams.build(scene, m.dark, true);
  nearBeam.build(lobbyOnly, m.dark); roof.build(lobbyOnly, m.roof);

  const glowMat = new THREE.MeshBasicMaterial({ map: t.lantern }), chain = new THREE.MeshLambertMaterial({ color: 0x2a1a10 });
  const lanterns: Lantern[] = [];
  ([[-4, -N], [4, -N], [-N, -3], [N, -3], [-N, 4], [N, 4]] as const).forEach(([x, z], i) => {
    const group = new THREE.Group(); group.position.set(x * .94, 6.5, z * .94);
    const c = new THREE.Mesh(BOX, chain); c.scale.set(.1, 1.1, .1); c.position.y = -.55; group.add(c);
    const body = new THREE.Mesh(BOX, glowMat); body.scale.setScalar(.7); body.position.y = -1.45; group.add(body);
    for (const y of [-1.05, -1.85]) { const cap = new THREE.Mesh(BOX, chain); cap.scale.set(.5, .12, .5); cap.position.y = y; group.add(cap); }
    const light = new THREE.PointLight(0xffa860, 5, 12, 1.8); light.position.y = -1.45; group.add(light);
    scene.add(group); lanterns.push({ group, light, phase: i * 1.7 });
  });
  return { lanterns, lobbyOnly };
}

// ---------- 牌桌：绿绒方块桌面、木边、原木桌腿、方块茶具 ----------
export const TABLE_HALF = 3.5;
function table(scene: THREE.Scene, m: Mats) {
  const felt = new Batch(), rim = new Batch(), logs = new Batch();
  const inside = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) <= 3 && Math.abs(x) + Math.abs(z) <= 5;
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    if (!inside(x, z) || (!x && !z)) continue;
    const edge = !inside(x + 1, z) || !inside(x - 1, z) || !inside(x, z + 1) || !inside(x, z - 1);
    (edge ? rim : felt).add(x, -.125, z, 1, .25, 1);
  }
  felt.build(scene, m.felt, true, true); rim.build(scene, m.planks, true, true);
  const centre = new THREE.Mesh(BOX, cube(m.felt, m.emblem)); centre.scale.set(1, .25, 1); centre.position.y = -.125; centre.receiveShadow = true; scene.add(centre);
  for (const [x, z] of [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]]) logs.add(x, -.75, z).add(x, FLOOR_Y + .25, z, 1, .5, 1);
  for (const [x, z] of [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]]) logs.add(x, FLOOR_Y + .25, z, 1, .5, 1);
  logs.build(scene, m.log, true, true);
  // 茶具
  const celadon = new THREE.MeshLambertMaterial({ color: 0x9fd4b8 }), wood = new THREE.MeshLambertMaterial({ color: 0x5a3320 }), tea = new THREE.MeshLambertMaterial({ color: 0x8a5a22 });
  const part = (mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => { const b = new THREE.Mesh(BOX, mat); b.position.set(x, y, z); b.scale.set(sx, sy, sz); b.castShadow = true; scene.add(b); };
  part(wood, 2.4, .03, 1.4, .9, .06, .7);
  part(celadon, 2.25, .2, 1.35, .3, .28, .3); part(celadon, 2.25, .37, 1.35, .14, .06, .14); part(celadon, 2.46, .22, 1.35, .14, .08, .08); part(celadon, 2.06, .2, 1.35, .06, .16, .08);
  for (const [x, z] of [[2.62, 1.55], [2.2, 1.62]]) { part(celadon, x, .12, z, .16, .12, .16); part(tea, x, .185, z, .1, .01, .1); }
}

// ---------- 江上竹筏 ----------
function rafts(scene: THREE.Scene, m: Mats, t: BlockTextures) {
  const r = rand(77), n = 7;
  const hull = new THREE.InstancedMesh(BOX, m.planks, n), lamp = new THREE.InstancedMesh(BOX, new THREE.MeshBasicMaterial({ map: t.lantern }), n);
  const data = Array.from({ length: n }, () => ({ x: -90 + r() * 180, z: -13 - r() * 46, s: .5 + r() * .7 }));
  scene.add(hull, lamp);
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  return (time: number, dt: number) => {
    data.forEach((d, i) => {
      d.x += d.s * dt; if (d.x > 90) d.x = -90;
      const y = WATER_Y + .08 + (Math.floor(time * 2 + i) % 2) * .04;
      hull.setMatrixAt(i, mat.compose(p.set(d.x, y, d.z), q, s.set(3.2, .22, 1.3)));
      lamp.setMatrixAt(i, mat.compose(p.set(d.x - 1, y + .4, d.z), q, s.set(.45, .45, .45)));
    });
    hull.instanceMatrix.needsUpdate = true; lamp.instanceMatrix.needsUpdate = true;
  };
}

// ---------- 方块烟花 ----------
export function createFireworks(scene: THREE.Scene, size = .5, gravity = 5) {
  const max = 3000, pos = new Float32Array(max * 3), col = new Float32Array(max * 3), vel = new Float32Array(max * 3), life = new Float32Array(max);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false, fog: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  let cursor = 0;
  const palette = [[1, .75, .2], [1, .3, .25], [1, .95, .5], [.4, 1, .6], [.6, .55, 1], [1, 1, 1]];
  function burst(at: THREE.Vector3, count = 260, speed = 8, color?: number[], upward = 0) {
    const c = color ?? palette[Math.floor(Math.random() * palette.length)];
    for (let i = 0; i < count; i++) {
      const k = cursor++ % max; const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = speed * (.85 + Math.random() * .35);
      pos.set([at.x, at.y, at.z], k * 3); vel.set([Math.sin(ph) * Math.cos(th) * sp, Math.abs(Math.cos(ph)) * sp * upward + Math.cos(ph) * sp * (1 - upward), Math.sin(ph) * Math.sin(th) * sp], k * 3);
      col.set(c, k * 3); life[k] = 1.6 + Math.random() * .8;
    }
  }
  function update(dt: number) {
    for (let k = 0; k < max; k++) {
      if (life[k] <= 0) continue; life[k] -= dt;
      vel[k * 3 + 1] -= gravity * dt; for (let a = 0; a < 3; a++) { vel[k * 3 + a] *= 1 - 1.4 * dt; pos[k * 3 + a] += vel[k * 3 + a] * dt; }
      if (life[k] <= 0) pos.set([0, -999, 0], k * 3);
    }
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
  for (let k = 0; k < max; k++) pos[k * 3 + 1] = -999;
  return { burst, update };
}

export function buildWorld(scene: THREE.Scene) {
  scene.background = SKY_HORIZON.clone(); scene.fog = new THREE.Fog(SKY_HORIZON, 70, 300);
  const tex = blockTextures(), m = materials(tex);
  const sunDir = sky(scene);
  const drift = clouds(scene), flow = water(scene, tex);
  peaks(scene, m); islands(scene, m);
  const { lanterns, lobbyOnly } = pavilion(scene, m, tex);
  table(scene, m);
  const sail = rafts(scene, m, tex);

  scene.add(new THREE.HemisphereLight(0xdcecff, 0x8a7a5c, 1.9));
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.4); sun.position.copy(sunDir).multiplyScalar(40); sun.target.position.set(0, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0006; sun.shadow.normalBias = .03;
  const c = sun.shadow.camera; c.left = -13; c.right = 13; c.top = 13; c.bottom = -13; c.near = 5; c.far = 90;
  scene.add(sun, sun.target);
  const glow = new THREE.PointLight(0x7dffd0, 0, 6, 2); glow.position.set(0, 1.4, 0); scene.add(glow);
  return {
    glow, textures: tex,
    /** 屋顶与近侧横梁只在大厅镜头下显示，牌桌视角从上方俯看时不遮挡。 */
    setRoof(on: boolean) { lobbyOnly.visible = on; },
    update(t: number, dt: number) {
      drift(t); flow(t); sail(t, dt);
      for (const l of lanterns) { l.group.rotation.z = Math.sin(t * .9 + l.phase) * .04; l.light.intensity = 5 * (.9 + .1 * Math.sin(t * 9 + l.phase * 5) * Math.sin(t * 3.3 + l.phase)); }
    },
  };
}
