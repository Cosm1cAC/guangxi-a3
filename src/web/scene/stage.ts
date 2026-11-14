import * as THREE from 'three';
import { id, power, type Card } from '../../core/game';
import { makeCard, revealCard, disposeCard, setAnisotropy, CARD_W, CARD_H, type CardObj } from './cards';
import { buildWorld, createFireworks } from './world';
import { makeFigure, setFigureAvatar, animateFigure, FIGURE_TOP, type Figure } from './figures';
import type { Avatar } from '../../core/avatar';
import { tween, updateTweens, ease } from './tween';

const SEAT_R = 4.45;
// 手牌挂在镜头上，不随太阳角度变化：以自发光为主，任何视角下亮度一致
const HAND_GLOW = .7, HAND_TINT = .4;
const DRESS_Z = 6.6;   // 换装时人物站立的位置（平台近侧）
const seatAngle = (rel: number) => rel * Math.PI / 2;
const seatDir = (rel: number) => new THREE.Vector3(Math.sin(seatAngle(rel)), 0, Math.cos(seatAngle(rel)));
const FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const yawFlat = (yaw: number, faceDown = false) => new THREE.Quaternion().setFromEuler(new THREE.Euler(faceDown ? Math.PI / 2 : -Math.PI / 2, 0, yaw, 'YXZ'));
type Target = { p: THREE.Vector3; q: THREE.Quaternion; s: number };
type Managed = CardObj & { userData: CardObj['userData'] & { target?: Target; flying?: number; lift?: number; gilded?: boolean } };

export type Mode = 'lobby' | 'table' | 'wardrobe';
export type StageEvents = { toggle: (cardId: string) => void; hover: () => void };

export function createStage(canvas: HTMLCanvasElement, events: StageEvents) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const lowEnd = Math.min(innerWidth, innerHeight) < 600 || (navigator.hardwareConcurrency ?? 8) <= 4;
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowEnd ? 1.5 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, .3, 900); scene.add(camera);
  const world = buildWorld(scene);
  const fireworks = createFireworks(scene, .55, 5);
  const sparks = createFireworks(scene, .09, 9);

  // ---- seats & figures（0 号位是自己：大厅与换装时显示，入局后隐藏以免挡住视线）----
  const figures: Figure[] = [];
  for (let rel = 0; rel < 4; rel++) {
    const f = makeFigure(world.textures); const d = seatDir(rel).multiplyScalar(SEAT_R);
    f.position.set(d.x, 0, d.z); f.rotation.y = seatAngle(rel); f.visible = false; scene.add(f); figures[rel] = f;
  }
  let wardrobeYaw = 0;

  // ---- hand (camera space) ----
  const hand = new THREE.Group(); camera.add(hand);
  const handLight = new THREE.DirectionalLight(0xfff1dc, .35); handLight.position.set(.4, 1, 1); camera.add(handLight); handLight.target.position.set(0, 0, -3); camera.add(handLight.target);
  let handCards: Managed[] = [];
  const fans: Managed[][] = [[], [], [], []];
  let trick: Managed[][] = [];
  let discard: Managed[] = [];
  let selectedIds = new Set<string>();
  let hoverId: string | null = null;
  let handScale = 1, handLayout = { halfW: 1, halfH: 1, D: 2.2, overlap: .55 };
  let handVisible = false;

  // ---- hero cards for the lobby ----
  const heroes = [makeCard({ rank: 14, suit: 3 }), makeCard({ rank: 3, suit: 3 })];
  heroes.forEach(h => { h.scale.setScalar(1.7); h.userData.faceMat.emissive = new THREE.Color(0xffffff); h.userData.faceMat.emissiveMap = h.userData.faceMat.map; h.userData.faceMat.emissiveIntensity = .25; scene.add(h); });

  // ---- turn ring & shockwave ----
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0, depthWrite: false });
  // 方形光圈：四段的环就是一个描边方块
  const turnRing = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 4, 1, Math.PI / 4), ringMat); turnRing.rotation.x = -Math.PI / 2; scene.add(turnRing);
  let turnRel = -1;
  const waves: { m: THREE.Mesh; t: number }[] = [];
  function shockwave(at: THREE.Vector3, color: THREE.Color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(at).setY(.03); scene.add(m); waves.push({ m, t: 0 });
  }

  // ---- camera rig ----
  let mode: Mode = 'lobby';
  const camPos = new THREE.Vector3(0, 6, 14), camLook = new THREE.Vector3(0, .5, 0);
  const goalPos = new THREE.Vector3(), goalLook = new THREE.Vector3();
  const pointer = new THREE.Vector2(), pointerSmooth = new THREE.Vector2();
  let shake = 0, width = 1, height = 1;

  function tablePose() {
    const aspect = width / height, portrait = aspect < .9;
    camera.fov = portrait ? 56 : 42;
    const elev = portrait ? .98 : .8; // radians above horizon
    const need = portrait ? 3.3 : 5.3;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect;
    const dist = Math.max(portrait ? 9 : 7.6, need / tanH);
    goalLook.set(0, -.15, portrait ? .55 : .35);
    goalPos.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist).add(goalLook);
    return portrait;
  }

  function layoutHand() {
    const aspect = width / height, portrait = aspect < .9;
    const D = 2.2, halfH = D * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), halfW = halfH * aspect;
    const n = Math.max(handCards.length, 1), columns = portrait ? Math.min(n, 7) : n, rows = Math.ceil(n / columns), overlap = 1.06;
    const byWidth = (halfW * 2 * .94) / (CARD_W * (1 + overlap * (Math.max(columns, portrait ? 7 : 13) - 1)));
    handScale = Math.min(byWidth, (halfH * 2 * (portrait ? .24 : .23)) / (CARD_H * (rows * 1.12 + .2)));
    handLayout = { halfW, halfH, D, overlap };
    hand.position.set(0, -halfH + CARD_H * handScale * .58 + halfH * .03, -D);
    hand.rotation.set(0, 0, 0);
    const step = CARD_W * handScale * overlap;
    handCards.forEach((c, i) => {
      const row = Math.floor(i / columns), count = Math.min(columns, n - row * columns), k = i % columns - (count - 1) / 2;
      const sel = selectedIds.has(c.userData.id!), hov = hoverId === c.userData.id;
      const lift = (sel ? .12 : 0) + (hov ? .04 : 0);
      const p = new THREE.Vector3(k * step, ((rows - 1 - row) * 1.18 + lift) * CARD_H * handScale, 0);
      const q = new THREE.Quaternion();
      c.userData.target = { p, q, s: handScale };
      c.userData.faceMat.emissiveIntensity = sel ? HAND_GLOW + .12 : HAND_GLOW;
      if (!c.userData.gilded) c.userData.faceMat.color.setRGB(HAND_TINT, HAND_TINT * (sel ? .97 : 1), HAND_TINT * (sel ? .8 : 1));
    });
    const top = hand.position.y + CARD_H * handScale * (.7 + (rows - 1) * 1.18);
    // convert hand top (camera space) to screen px for the DOM action bar
    const yPx = (1 - (top / halfH + 1) / 2) * height;
    document.documentElement.style.setProperty('--hand-top', `${Math.round(height - yPx)}px`);
  }

  function snapHand() {
    for(const c of handCards){const t=c.userData.target;if(!t||c.userData.flying)continue;c.position.copy(t.p);c.quaternion.copy(t.q);c.scale.setScalar(t.s);}
  }

  function layoutFan(rel: number) {
    const f = fans[rel], n = f.length, mid = (n - 1) / 2;
    f.forEach((c, i) => {
      const k = i - mid;
      c.userData.target = { p: new THREE.Vector3(k * .075, -Math.abs(k) * .006, i * .008), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -k * .075)), s: .55 };
    });
  }

  function fly(obj: Managed, parent: THREE.Object3D, p: THREE.Vector3, q: THREE.Quaternion, s: number, o: { duration?: number; delay?: number; arc?: number; spin?: number } = {}) {
    const token = (obj.userData.flying ?? 0) + 1; obj.userData.flying = token;
    let p0: THREE.Vector3, q0: THREE.Quaternion, s0: number, started = false;
    return tween(o.duration ?? 520, t => {
      if (obj.userData.flying !== token) return;
      if (!started) { parent.attach(obj); p0 = obj.position.clone(); q0 = obj.quaternion.clone(); s0 = obj.scale.x; started = true; }
      obj.position.lerpVectors(p0, p, t); obj.position.y += Math.sin(Math.PI * t) * (o.arc ?? 0);
      obj.quaternion.slerpQuaternions(q0, q, t);
      if (o.spin) obj.rotateZ(Math.sin(Math.PI * t) * o.spin);
      obj.scale.setScalar(s0 + (s - s0) * t);
    }, { delay: o.delay, ease: ease.inOutCubic }).then(() => { if (obj.userData.flying === token) obj.userData.flying = 0; });
  }

  /** Tribute: move one card between seats (face-down unless it lands in my hand). */
  function transfer(fromRel: number, toRel: number, card: Card | null) {
    let src: Managed | undefined;
    if (fromRel === 0) { const i = card ? handCards.findIndex(h => h.userData.id === id(card)) : -1; if (i >= 0) src = handCards.splice(i, 1)[0]; }
    else src = fans[fromRel].pop();
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3(1, 1, 1);
    if (src) { src.getWorldPosition(wp); src.getWorldQuaternion(wq); src.getWorldScale(ws); disposeCard(src); }
    else { const d = seatDir(fromRel).multiplyScalar(SEAT_R - .6); wp.set(d.x, 1, d.z); wq.copy(FLAT); ws.setScalar(.6); }
    const o = toRel === 0 && card ? handObj(card) : makeCard(null) as Managed;
    scene.add(o); o.position.copy(wp); o.quaternion.copy(wq); o.scale.setScalar(ws.x);
    if (toRel === 0) {
      handCards.push(o); handCards.sort((a, b) => power(a.userData.card!) - power(b.userData.card!)); layoutHand();
      o.userData.gilded = true; o.userData.faceMat.color.setRGB(HAND_TINT * 1.5, HAND_TINT * 1.2, HAND_TINT * .5); setTimeout(() => { o.userData.gilded = false; o.userData.faceMat.color.setScalar(HAND_TINT); }, 2400); // briefly gilded
    } else { fans[toRel].push(o); layoutFan(toRel); }
    if (fromRel === 0) layoutHand(); else layoutFan(fromRel);
    const t = o.userData.target!;
    fly(o, toRel === 0 ? hand : figures[toRel].userData.hold, t.p, t.q, t.s, { duration: 850, arc: 1.4, spin: .6 });
    const mid = seatDir(fromRel).add(seatDir(toRel)).multiplyScalar(1.4).setY(.6);
    return mid;
  }

  function clearAll() {
    for (const c of [...handCards, ...fans.flat(), ...trick.flat(), ...discard]) disposeCard(c);
    handCards = []; fans.forEach(f => f.length = 0); trick = []; discard = [];
  }

  function handObj(c: Card) {
    const o = makeCard(c) as Managed; o.userData.faceMat.emissive = new THREE.Color(0xffffff); o.userData.faceMat.emissiveMap = o.userData.faceMat.map; o.userData.faceMat.emissiveIntensity = HAND_GLOW; o.userData.faceMat.color.setScalar(HAND_TINT);
    o.userData.face.castShadow = false; o.userData.back.castShadow = false;
    return o;
  }
  function toTableLook(o: Managed) { o.userData.faceMat.emissiveIntensity = 0; o.userData.faceMat.color.setScalar(1); o.userData.face.castShadow = true; o.userData.back.castShadow = true; }

  /** Fresh deal animation: cards spray out from a deck at the centre. Returns ms duration. */
  function deal(myHand: Card[], counts: number[]) {
    clearAll(); selectedIds.clear();
    handCards = myHand.map(handObj);
    for (let rel = 1; rel <= 3; rel++) for (let i = 0; i < counts[rel]; i++) fans[rel].push(makeCard(null) as Managed);
    layoutHand(); for (let rel = 1; rel <= 3; rel++) layoutFan(rel);
    const order: [Managed, number][] = [];
    const max = Math.max(...counts);
    for (let i = 0; i < max; i++) for (let rel = 0; rel < 4; rel++) { const c = rel === 0 ? handCards[i] : fans[rel][i]; if (c) order.push([c, rel]); }
    order.forEach(([c, rel], k) => {
      c.position.set(0, .05 + (order.length - k) * .004, 0); c.quaternion.copy(yawFlat(0, true)); c.scale.setScalar(1); scene.add(c);
      const t = c.userData.target!;
      fly(c, rel === 0 ? hand : figures[rel].userData.hold, t.p, t.q, t.s, { delay: 200 + k * 34, duration: 460, arc: rel === 0 ? 0 : .6 });
    });
    return 200 + order.length * 34 + 460;
  }

  // Every card on the table gets its own height: layer = which play in the trick, i = index within the play.
  // Cards that overlap must never share a plane, or MSAA samples split between them and the lower card ghosts through.
  const layerY = (layer: number, i: number) => .02 + layer * .045 + i * .003;
  function playPosition(rel: number, i: number, n: number) {
    const portrait = width / height < .9, sc = portrait ? 1.15 : 1;
    const base = seatDir(rel).multiplyScalar(rel === 0 ? .55 : .85);
    return new THREE.Vector3(base.x + (i - (n - 1) / 2) * .42 * sc, layerY(trick.length, i), base.z + (rel === 0 ? .1 : 0));
  }

  /** A seat plays cards: the cards fly to the centre, revealing faces. */
  function play(rel: number, cards: Card[], big: boolean) {
    // previous plays sink and dim
    while (trick.length >= 3) toDiscard(trick.shift()!);
    trick.forEach((set, k) => set.forEach((c, i) => { c.userData.faceMat.color.setScalar(.55 + .1 * k / Math.max(trick.length, 1)); fly(c, scene, c.position.clone().multiplyScalar(.82).setY(layerY(k, i)), c.quaternion.clone(), c.scale.x * .9, { duration: 380 }); }));
    const portrait = width / height < .9, sc = portrait ? 1.15 : 1;
    const objs: Managed[] = [];
    cards.forEach((card, i) => {
      let o: Managed | undefined;
      if (rel === 0) { const idx = handCards.findIndex(h => h.userData.id === id(card)); if (idx >= 0) o = handCards.splice(idx, 1)[0]; }
      else { o = fans[rel].pop(); if (o) revealCard(o, card); }
      if (!o) { o = makeCard(card) as Managed; const from = seatDir(rel).multiplyScalar(SEAT_R - .6); o.position.set(from.x, 1, from.z); scene.add(o); }
      o.userData.target = undefined; toTableLook(o);
      o.userData.faceMat.color.setScalar(1);
      objs.push(o);
      const yaw = (Math.random() - .5) * .14;
      fly(o, scene, playPosition(rel, i, cards.length), yawFlat(yaw), sc, { duration: big ? 640 : 520, delay: i * 45, arc: big ? 1.2 : .55, spin: rel === 0 ? 0 : .4 });
    });
    trick.push(objs);
    if (rel === 0) { selectedIds.clear(); layoutHand(); } else layoutFan(rel);
    const center = playPosition(rel, 0, 1);
    if (big) setTimeout(() => { shockwave(center, new THREE.Color(0xffe27a)); sparks.burst(center.clone().setY(.3), 160, 4.5, [1, .85, .3], .8); shake = .14; }, (big ? 640 : 520));
    return center;
  }

  function toDiscard(set: Managed[]) {
    set.forEach(c => {
      discard.push(c); const n = discard.length;
      c.userData.faceMat.color.setScalar(1);
      const a = n * 2.39996; const p = new THREE.Vector3(-2.15 + Math.cos(a) * .08, .01 + n * .006, -1.55 + Math.sin(a) * .08);
      fly(c, scene, p, yawFlat(.6 + Math.sin(a) * .25, true), .8, { duration: 600, arc: .3, delay: Math.random() * 120 });
    });
  }
  function clearTrick() { trick.forEach(toDiscard); trick = []; }

  /** Ensure counts & hand match the authoritative view without animation fuss. */
  function reconcile(myHand: Card[], counts: number[]) {
    const want = new Map(myHand.map(c => [id(c), c] as const));
    handCards = handCards.filter(c => { if (want.has(c.userData.id!)) return true; disposeCard(c); return false; });
    for (const c of myHand) if (!handCards.some(h => h.userData.id === id(c))) { const o = handObj(c); hand.add(o); o.position.set(0, -1, 0); handCards.push(o); }
    handCards.sort((a, b) => myHand.findIndex(c => id(c) === a.userData.id) - myHand.findIndex(c => id(c) === b.userData.id));
    for (let rel = 1; rel <= 3; rel++) {
      const f = fans[rel];
      while (f.length > counts[rel]) disposeCard(f.pop()!);
      while (f.length < counts[rel]) { const o = makeCard(null) as Managed; figures[rel].userData.hold.add(o); f.push(o); }
      layoutFan(rel);
    }
    layoutHand();
    snapHand();
  }

  function showTrick(last: { rel: number; cards: Card[] } | null) {
    // used on restore: place the current trick instantly
    clearTrickInstant();
    if (!last) return;
    const objs = last.cards.map((c, i) => { const o = makeCard(c) as Managed; toTableLook(o); o.position.copy(playPosition(last.rel, i, last.cards.length)); o.quaternion.copy(FLAT); scene.add(o); return o; });
    trick.push(objs);
  }
  function clearTrickInstant() { trick.flat().forEach(disposeCard); trick = []; }

  // ---- interaction ----
  const ray = new THREE.Raycaster(); let downAt: { x: number; y: number } | null = null;
  function pick(ev: PointerEvent) {
    if (!handVisible || !handCards.length) return null;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1), camera);
    const hits = ray.intersectObjects(handCards.map(c => c.userData.face), false);
    if (!hits.length) return null;
    // the top-most card (highest index) under the pointer wins
    const ids = hits.map(h => handCards.findIndex(c => c.userData.face === h.object)).filter(i => i >= 0);
    return handCards[Math.max(...ids)]?.userData.id ?? null;
  }
  canvas.addEventListener('pointermove', ev => {
    pointer.set(ev.clientX / innerWidth * 2 - 1, ev.clientY / innerHeight * 2 - 1);
    if (mode === 'wardrobe' && ev.buttons) { wardrobeYaw += ev.movementX * .012; return; }
    if (ev.pointerType !== 'mouse') return;
    const h = pick(ev); if (h !== hoverId) { hoverId = h; if (h) events.hover(); layoutHand(); }
    canvas.style.cursor = h ? 'pointer' : '';
  });
  canvas.addEventListener('pointerdown', ev => { downAt = { x: ev.clientX, y: ev.clientY }; });
  canvas.addEventListener('pointerup', ev => {
    if (!downAt || Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 10) return; downAt = null;
    const h = pick(ev); if (h) events.toggle(h);
  });
  canvas.addEventListener('pointerleave', () => { if (hoverId) { hoverId = null; layoutHand(); } });

  // ---- resize & loop ----
  function resize(w: number, h: number) {
    width = w; height = h; camera.aspect = w / h;
    if (mode === 'table') tablePose(); else camera.fov = w / h < .9 ? 60 : 45;
    camera.updateProjectionMatrix(); renderer.setSize(w, h, false);
    layoutHand();
    snapHand();
  }
  let last = performance.now(), frameCb: (() => void) | null = null;
  function frame(now: number) {
    const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000;
    updateTweens(now);
    world.update(t, dt); fireworks.update(dt); sparks.update(dt);
    // camera
    if (mode === 'lobby') {
      const a = t * .045 + .3, portrait = width / height < .9;
      goalPos.set(Math.sin(a) * (portrait ? 16 : 12.5), portrait ? 6.5 : 4.6, Math.cos(a) * (portrait ? 16 : 12.5)); goalLook.set(0, portrait ? 1.6 : 1.1, 0);
    } else if (mode === 'wardrobe') {
      // 人物走到平台近侧、面向江面站定，镜头从平台外回望：背景是牌桌与峰林。横屏把人物让到左侧，竖屏让到上半屏，给换装面板留位置
      if (width / height < .9) { goalPos.set(0, .7, DRESS_Z + 6.8); goalLook.set(0, -1.9, DRESS_Z); } else { goalPos.set(.45, .25, DRESS_Z + 4.9); goalLook.set(.95, -.25, DRESS_Z); }
    }
    pointerSmooth.lerp(pointer, .05);
    const k = 1 - Math.exp(-dt * (mode === 'lobby' ? 1.4 : 2.6));
    camPos.lerp(goalPos, k); camLook.lerp(goalLook, k);
    camera.position.copy(camPos);
    if (mode === 'table') camera.position.add(new THREE.Vector3(pointerSmooth.x * .25, -pointerSmooth.y * .12, 0));
    if (shake > 0) { camera.position.add(new THREE.Vector3((Math.random() - .5) * shake, (Math.random() - .5) * shake, 0)); shake *= .88; if (shake < .002) shake = 0; }
    camera.lookAt(camLook);
    // heroes
    heroes.forEach((h, i) => {
      const vis = mode === 'lobby'; h.visible = vis || h.scale.x > .02;
      const s = THREE.MathUtils.lerp(h.scale.x, vis ? 1.7 : 0, 1 - Math.exp(-dt * 4)); h.scale.setScalar(s);
      h.position.set((i ? .75 : -.75), 1.55 + Math.sin(t * 1.2 + i * 2) * .12, Math.sin(t * .8 + i) * .1);
      h.rotation.set(-.08, Math.sin(t * .5 + i * 1.3) * .5 + (i ? -.18 : .18), (i ? -.08 : .08));
    });
    // managed cards follow targets
    const follow = (c: Managed) => {
      const tg = c.userData.target; if (!tg || c.userData.flying) return;
      const kk = 1 - Math.exp(-dt * 14); c.position.lerp(tg.p, kk); c.quaternion.slerp(tg.q, kk); c.scale.setScalar(THREE.MathUtils.lerp(c.scale.x, tg.s, kk));
    };
    handCards.forEach(follow); fans.forEach(f => f.forEach(follow));
    hand.visible = handVisible;
    // figures
    figures[0].visible = mode !== 'table' && !!figures[0].userData.model;
    figures[0].userData.standing = mode === 'wardrobe';
    const dress = mode === 'wardrobe', kf = 1 - Math.exp(-dt * 6);
    figures[0].position.z = THREE.MathUtils.lerp(figures[0].position.z, dress ? DRESS_Z : SEAT_R, kf);
    figures[0].rotation.y = THREE.MathUtils.lerp(figures[0].rotation.y, dress ? Math.PI + wardrobeYaw + Math.sin(t * .6) * .35 : 0, kf);
    for (let rel = 0; rel < 4; rel++) animateFigure(figures[rel], t, dt, rel === turnRel && mode === 'table', rel * 1.9);
    // turn ring sits on the table edge in front of the active seat
    const ringOn = turnRel >= 0 && mode === 'table';
    ringMat.opacity += ((ringOn ? .45 + .25 * Math.sin(t * 4) : 0) - ringMat.opacity) * .1;
    if (turnRel >= 0) { const d = seatDir(turnRel).multiplyScalar(turnRel === 0 ? 2.25 : 2.35); turnRing.position.lerp(new THREE.Vector3(d.x, .015, d.z), .12); turnRing.scale.setScalar(.6 + Math.sin(t * 4) * .03); }
    world.glow.intensity = THREE.MathUtils.lerp(world.glow.intensity, ringOn && turnRel === 0 ? .8 : 0, .05);
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i]; w.t += dt; w.m.scale.setScalar(.3 + w.t * 5.5); (w.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - w.t * 1.4);
      if (w.t > .75) { scene.remove(w.m); w.m.geometry.dispose(); (w.m.material as THREE.Material).dispose(); waves.splice(i, 1); }
    }
    renderer.render(scene, camera);
    frameCb?.();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const proj = new THREE.Vector3();
  return {
    resize,
    setMode(m: Mode) { mode = m; handVisible = m === 'table'; world.setRoof(m === 'lobby'); if (m === 'wardrobe') wardrobeYaw = 0; if (m === 'table') { tablePose(); camera.updateProjectionMatrix(); layoutHand(); } else { camera.fov = width / height < .9 ? 60 : 45; camera.updateProjectionMatrix(); } },
    get mode() { return mode; },
    /** 按相对座位设置人物形象；null 表示空座。 */
    setAvatars(list: (Avatar | null)[]) { list.forEach((a, rel) => { if (figures[rel]) { setFigureAvatar(figures[rel], a, world.textures); if (rel) figures[rel].visible = !!a; } }); },
    deal, play, clearTrick, reconcile, showTrick, transfer,
    setSelected(ids: Set<string>) { selectedIds = new Set(ids); layoutHand(); },
    setTurn(rel: number) { turnRel = rel; },
    react(rel: number) { if (figures[rel]) figures[rel].userData.mood = .9; },
    fireworks(n = 6) { for (let i = 0; i < n; i++) setTimeout(() => fireworks.burst(new THREE.Vector3((Math.random() - .5) * 50, 14 + Math.random() * 10, -30 - Math.random() * 25), 280), i * 420); },
    /** Screen-space anchor (px) for seat nameplates. */
    anchor(rel: number) {
      if (rel === 0) return { x: width / 2, y: height, on: true };
      const f = figures[rel]; proj.set(0, FIGURE_TOP, 0); f.localToWorld(proj); proj.project(camera);
      return { x: (proj.x + 1) / 2 * width, y: (1 - proj.y) / 2 * height, on: proj.z < 1 };
    },
    project(v: THREE.Vector3) { proj.copy(v).project(camera); return { x: (proj.x + 1) / 2 * width, y: (1 - proj.y) / 2 * height }; },
    onFrame(cb: () => void) { frameCb = cb; },
  };
}
export type Stage = ReturnType<typeof createStage>;
