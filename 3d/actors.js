// 3D版の動くもの（人・自転車・車・バイク）を InstancedMesh で描く。
// シミュレーション座標 (x,y,z) → THREE (x, z, y)。向き (hx,hy) → yaw = atan2(-hy, hx)。モデルは +x が正面。
// 車体まわりの局所座標は a = 進行方向（前が+）、b = 車の左がわが+（左 = シミュレーション座標で (hy,-hx)）、z = 高さ。
(() => {
'use strict';
const CS3 = window.CS3 = window.CS3 || {};
const T = window.THREE;

// ---- 色（'#RRGGBB' → [r,g,b] 0..1、キャッシュ。r128 は色管理なしなのでそのまま）----
const hcache = new Map();
function hex(s) {
  let v = hcache.get(s);
  if (v) return v;
  let t = typeof s === 'string' ? s.replace('#', '') : '888888';
  if (t.length === 3) t = t[0] + t[0] + t[1] + t[1] + t[2] + t[2];
  const n = parseInt(t, 16) || 0;
  v = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  hcache.set(s, v);
  return v;
}
const C = k => hex(k);
const GLASS = C('#27333F'), TIRE = C('#1B1E24'), HUB = C('#B9C0C8'), DARK = C('#2B3039'), ROOFGREY = C('#C9CFD6'),
  WHITE = C('#EEF1F4'), POLDARK = C('#1F2329');

// ---- ジオメトリ（単位サイズ。インスタンスの scale で寸法を決める）----
function limbGeo() { const g = new T.CylinderGeometry(.5, .5, 1, 6, 1); g.translate(0, -.5, 0); return g; }       // 上端が原点、下へ伸びる
function boxGeo() { const g = new T.BoxGeometry(1, 1, 1); g.translate(0, .5, 0); return g; }                    // 底面中心が原点
function torsoGeo() { const g = new T.CylinderGeometry(.5, .44, 1, 8, 1); g.translate(0, .5, 0); return g; }  // 肩が広い八角柱
function capGeo() { const g = new T.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, 1.75); g.rotateZ(.45); return g; } // 後ろにずらした髪のキャップ
function cabinGeo() {   // 窓ガラスの車室（上すぼまり、フロントが寝ている）
  const g = new T.BoxGeometry(1, 1, 1); g.translate(0, .5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > .9) { p.setX(i, p.getX(i) < 0 ? -.38 : .22); p.setZ(i, p.getZ(i) * .86); }
  g.computeVertexNormals();
  return g;
}
function wheelGeo() { const g = new T.CylinderGeometry(.5, .5, 1, 12, 1); g.rotateX(Math.PI / 2); return g; }     // 軸が局所 z
function glowTex() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const x = cv.getContext('2d'), g = x.createRadialGradient(0, 32, 0, 0, 32, 32);   // 縦に32、横に4倍へ引きのばした楕円（端で必ず透明）
  g.addColorStop(0, 'rgba(255,240,190,.5)'); g.addColorStop(.5, 'rgba(255,235,170,.16)'); g.addColorStop(1, 'rgba(255,230,160,0)');
  x.scale(4, 1); x.fillStyle = g; x.fillRect(0, 0, 32, 64);
  const t = new T.CanvasTexture(cv); return t;
}

function create(scene, opt) {
  opt = opt || {};
  const maxPeds = opt.maxPeds || 800, maxCars = opt.maxCars || 80;
  const maxPers = maxPeds + maxCars;                 // 人の部品の数（バイクの乗り手も含む）
  const geom = CS3.geom, CURB = geom ? geom.CURB_H : .15;
  const onSW = geom ? geom.onSidewalk : () => false;

  const phong = (extra) => new T.MeshPhongMaterial(Object.assign({ flatShading: true, shininess: 10, specular: 0x151515 }, extra));
  const matBody = phong({}), matCloth = phong({}), matGlass = phong({ shininess: 60, specular: 0x556677 }), matLamp = new T.MeshBasicMaterial({});
  const meshes = [];
  function mk(geo, mat, cap, colored, shadow) {
    const m = new T.InstancedMesh(geo, mat, cap);
    if (colored) m.setColorAt(0, new T.Color(1, 1, 1));
    m.count = 0; m.frustumCulled = false; m.castShadow = !!shadow; m.receiveShadow = false;
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    if (m.instanceColor) m.instanceColor.setUsage(T.DynamicDrawUsage);
    scene.add(m); meshes.push(m); return m;
  }
  // 人
  const torsoM = mk(torsoGeo(), matCloth, maxPers, true, true);
  const headM = mk(new T.SphereGeometry(1, 8, 6), matCloth, maxPers, true, true);
  const hairM = mk(capGeo(), matCloth, maxPers, true, true);
  const armM = mk(limbGeo(), matCloth, maxPers * 2, true, true);
  const legM = mk(limbGeo(), matCloth, maxPers * 4, true, true);          // 歩き:1本、こぎ:2本(もも+すね)
  // 自転車
  const tireM = mk(new T.TorusGeometry(.31, .028, 5, 18), matBody, maxPers * 2, true, true);
  const barM = mk(limbGeo(), matBody, maxPers * 14, true, true);          // フレーム・ハンドル・サドル・バイクのフォーク
  // 車
  const boxM = mk(boxGeo(), matBody, maxCars * 16, true, true);
  const glassM = mk(cabinGeo(), matGlass, maxCars, true, true);
  const wheelM = mk(wheelGeo(), matBody, maxCars * 6, true, true);
  const hubM = mk(wheelGeo(), matBody, maxCars * 6, true, false);
  const lampM = mk(new T.BoxGeometry(1, 1, 1), matLamp, maxCars * 8, true, false);
  // 夜のヘッドライトの路面の光だまり
  const poolG = new T.PlaneGeometry(1, 1); poolG.rotateX(-Math.PI / 2); poolG.translate(.5, 0, 0);
  const poolM = mk(poolG, new T.MeshBasicMaterial({ map: glowTex(), transparent: true, blending: T.AdditiveBlending, depthWrite: false }), maxCars, false, false);
  // 選択リング
  const ring = new T.Mesh((() => { const g = new T.TorusGeometry(.55, .04, 6, 28); g.rotateX(Math.PI / 2); return g; })(), new T.MeshBasicMaterial({ color: 0xFFB020 }));
  ring.visible = false; ring.frustumCulled = false; scene.add(ring);

  // ---- 一時オブジェクト（毎フレーム new しない）----
  const YA = new T.Vector3(0, 1, 0), ZA = new T.Vector3(0, 0, 1), DOWN = new T.Vector3(0, -1, 0);
  const mat4 = new T.Matrix4(), qYaw = new T.Quaternion(), qT = new T.Quaternion(), qL = new T.Quaternion();
  const vA = new T.Vector3(), vB = new T.Vector3(), vK = new T.Vector3(), vS = new T.Vector3(), vD = new T.Vector3();
  let ox = 0, oy = 0, fx = 1, fy = 0, gz = 0;
  const cnt = { torso: 0, arm: 0, leg: 0, tire: 0, bar: 0, box: 0, glass: 0, wheel: 0, hub: 0, lamp: 0, pool: 0 };
  let night = false, shadows = true, lastSim = null, selPed = null;

  function frame(x, y, hx, hy, z) { ox = x; oy = y; fx = hx; fy = hy; gz = z || 0; qYaw.setFromAxisAngle(YA, Math.atan2(-hy, hx)); }
  function loc(a, b, z, out) { return out.set(ox + fx * a + fy * b, gz + z, oy + fy * a - fx * b); }
  function put(m, i, pos, q, sc) { mat4.compose(pos, q, sc); mat4.toArray(m.instanceMatrix.array, i * 16); }
  function col(m, i, c, f) { const a = m.instanceColor.array, j = i * 3; f = f === undefined ? 1 : f; a[j] = c[0] * f; a[j + 1] = c[1] * f; a[j + 2] = c[2] * f; }
  // 点 A→B を結ぶ円柱（上端が A）
  function limb(m, i, A, B, th) {
    vD.subVectors(B, A); const len = vD.length() || 1e-4; vD.multiplyScalar(1 / len);
    qL.setFromUnitVectors(DOWN, vD); vS.set(th, len, th); put(m, i, A, qL, vS);
  }
  function limbL(m, a0, b0, z0, a1, b1, z1, th, c, f) {
    const i = m === legM ? cnt.leg++ : m === armM ? cnt.arm++ : cnt.bar++;
    limb(m, i, loc(a0, b0, z0, vA), loc(a1, b1, z1, vB), th); col(m, i, c, f);
  }
  function box(a, b, z0, z1, la, wb, c, f) {
    const i = cnt.box++; vS.set(la, z1 - z0, wb); put(boxM, i, loc(a, b, z0, vK), qYaw, vS); col(boxM, i, c, f);
  }
  function lamp(a, b, z, sa, sz, sb, c) {
    const i = cnt.lamp++; vS.set(sa, sz, sb); put(lampM, i, loc(a, b, z, vK), qYaw, vS); col(lampM, i, c);
  }
  function wheel(a, b, r, w) {
    let i = cnt.wheel++; vS.set(r * 2, r * 2, w); put(wheelM, i, loc(a, b, r, vK), qYaw, vS); col(wheelM, i, TIRE);
    i = cnt.hub++; vS.set(r * 1.05, r * 1.05, w + .02); put(hubM, i, loc(a, b, r, vK), qYaw, vS); col(hubM, i, HUB);
  }
  // 頭＋髪（ヘルメット）
  function head(i, a, z, hairC, helmet) {
    vS.set(.125, .125, .125); put(headM, i, loc(a, 0, z, vK), qYaw, vS);
    const r = helmet ? .15 : .134; vS.set(r, r, r); put(hairM, i, loc(a - .015, 0, z + .018, vK), qYaw, vS);
  }
  function torso(i, a, z, lean, h) {
    qT.setFromAxisAngle(ZA, -lean); qT.premultiply(qYaw);
    vS.set(.26, h, .4); put(torsoM, i, loc(a, 0, z, vK), qT, vS);
  }

  // ---- 歩く人 ----
  function walker(p, z) {
    const i = cnt.torso++, s = p.speed || 0, amp = Math.min(1, s / .6), sw = Math.sin(p.phase) * amp * .28;
    const bob = Math.abs(Math.cos(p.phase)) * .025 * amp;
    const cl = hex(p.cl), pt = hex(p.pt);
    torso(i, 0, .78 + bob, 0, .62); col(torsoM, i, cl);
    head(i, 0, 1.55 + bob, null, false); col(headM, i, hex(p.sk)); col(hairM, i, hex(p.hr));
    for (let k = -1; k <= 1; k += 2) {           // k=+1 左, -1 右。足と手は逆位相
      limbL(legM, 0, k * .09, .8 + bob * .5, k * sw, k * .09, .05, .125, pt);
      limbL(armM, 0, k * .24, 1.38 + bob, -k * sw * 1.1, k * .26, .9 + bob, .09, cl, .85);
    }
  }
  // ---- 自転車に乗る人 ----
  function cyclist(p, z) {
    const i = cnt.torso++, bc = p.bc ? hex(p.bc) : C('#C62F2F'), cl = hex(p.cl), pt = hex(p.pt);
    for (let k = -1; k <= 1; k += 2) {
      const j = cnt.tire++; vS.set(1, 1, 1); put(tireM, j, loc(k * .52, 0, .33, vK), qYaw, vS); col(tireM, j, TIRE);
    }
    const f = (a0, z0, a1, z1) => limbL(barM, a0, 0, z0, a1, 0, z1, .04, bc);
    f(-.52, .33, -.08, .3); f(-.08, .3, -.24, .88); f(-.52, .33, -.24, .88); f(-.24, .88, .38, .86); f(-.08, .3, .38, .86); f(.38, .86, .52, .33);
    limbL(barM, .38, 0, .86, .4, 0, 1.04, .04, DARK);
    limbL(barM, .4, .21, 1.04, .4, -.21, 1.04, .035, DARK);
    limbL(barM, -.32, 0, .93, -.14, 0, .93, .07, DARK);
    torso(i, -.26, .96, .41, .56);
    col(torsoM, i, hex(p.cl));
    head(i, .04, 1.58, null, !!p.hm); col(headM, i, hex(p.sk)); col(hairM, i, p.hm ? hex(p.hm) : hex(p.hr));
    for (let k = -1; k <= 1; k += 2) {
      const th = p.phase + (k > 0 ? 0 : Math.PI), pa = -.08 + Math.cos(th) * .17, pz = .3 + Math.sin(th) * .17;
      const ha = -.26, hz = .94, da = pa - ha, dz = pz - hz, L = Math.min(Math.hypot(da, dz), .83), h = Math.sqrt(Math.max(0, .42 * .42 - L * L / 4));
      const ka = ha + da / 2 - dz / L * h, kz = hz + dz / 2 + da / L * h;
      limbL(legM, ha, k * .1, hz, ka, k * .12, kz, .12, pt);
      limbL(legM, ka, k * .12, kz, pa, k * .13, pz, .105, pt);
      limbL(armM, -.04, k * .17, 1.4, .4, k * .2, 1.04, .085, cl, .85);
    }
  }
  // ---- バイクの乗り手 ----
  function rider(r) {
    const i = cnt.torso++, cl = hex(r.cl), pt = hex(r.pt);
    torso(i, -.2, .84, .3, .56); col(torsoM, i, cl);
    head(i, -.02, 1.57, null, true); col(headM, i, hex(r.sk)); col(hairM, i, hex(r.helm));
    for (let k = -1; k <= 1; k += 2) {
      limbL(legM, -.2, k * .13, .86, .18, k * .28, .7, .13, pt);
      limbL(legM, .18, k * .28, .7, .02, k * .28, .3, .11, pt);
      limbL(armM, -.06, k * .18, 1.36, .42, k * .3, 1.02, .085, cl, .85);
    }
  }

  // ---- 車 ----
  // 種類ごとの寸法 [車体下端, 車体上端, 車室上端, 車室の長さ/L, 車室の位置/L, ランプ高]
  const SP = {
    car: [.28, .85, 1.42, .58, -.054, .62], kei: [.28, .9, 1.65, .7, -.024, .66], van: [.3, .98, 1.85, .78, -.04, .7],
    taxi: [.28, .85, 1.42, .58, -.054, .62], police: [.28, .85, 1.45, .58, -.06, .62]
  };
  function vehicle(c) {
    const L = c.len, W = c.w, kind = c.kind, body = hex(c.col);
    frame(c.x, c.y, c.hx, c.hy, 0);
    let hz = .62, tz = .66, hb = W / 2 - .34, cb = W / 2 - .13, la = L / 2, lat = L / 2, lz = .13;
    if (kind === 'bike') {
      const rr = .3;
      wheel(L / 2 - .38, 0, rr, .13); wheel(-L / 2 + .38, 0, rr, .13);
      box(-.05, 0, .25, .6, .55, .3, DARK);                  // エンジン
      box(.18, 0, .6, .86, .6, .32, body);                   // タンク
      box(-.45, 0, .7, .8, .75, .3, DARK);                   // シート
      box(-.82, 0, .55, .78, .6, .2, body);                  // リアカウル
      limbL(barM, L / 2 - .38, 0, .3, L / 2 - .5, 0, 1.0, .06, DARK);   // フロントフォーク
      limbL(barM, L / 2 - .5, .3, 1.02, L / 2 - .5, -.3, 1.02, .035, DARK);  // ハンドル
      if (c.rider) rider(c.rider);
      hz = .96; tz = .68; hb = 0; cb = .24; la = L / 2 - .5; lat = L / 2 - .02; lz = .12;
      // ヘッドライト 1つ、テール 1つ
      lampsOf(c, la, lat, hz, tz, .0, cb, lz, true);
      return;
    }
    if (kind === 'bus') {
      for (const a of [L / 2 - 1.9, -L / 2 + 2.4]) { wheel(a, W / 2 - .12, .5, .3); wheel(a, -W / 2 + .12, .5, .3); }
      box(0, 0, .32, 2.9, L, W - .06, body); box(0, 0, 2.9, 2.93, L - .1, W - .3, WHITE);
      box(-.25, 0, 1.45, 2.45, L - 1.6, W + .02, GLASS);
      box(L / 2 - .02, 0, 1.2, 2.6, .06, W - .4, GLASS);
      box(-L / 2 + .02, 0, 1.4, 2.4, .06, W - .9, GLASS);
      box(-.6, 0, 2.93, 3.15, 2.4, 1.3, ROOFGREY);
      hz = .7; tz = .75; hb = W / 2 - .45; cb = W / 2 - .12; lz = .14;
    } else if (kind === 'truck') {
      for (const a of [L / 2 - 1, -L / 2 + 1.1, -L / 2 + 2.1]) { wheel(a, W / 2 - .12, .45, .3); wheel(a, -W / 2 + .12, .45, .3); }
      const ca = L / 2 - .95;
      box(ca, 0, .4, 1.25, 1.9, W - .1, body);
      const i = cnt.glass++; vS.set(1.7, .95, W - .3); put(glassM, i, loc(ca - .05, 0, 1.25, vK), qYaw, vS); col(glassM, i, GLASS);
      box(ca - .17, 0, 2.18, 2.22, 1.0, W - .55, body);
      box(-1.05, 0, .55, 2.95, L - 2.15, W, WHITE);
      box(-1.05, 0, 1.05, 1.35, L - 2.13, W + .02, body);
      box(-.8, 0, .3, .55, L - 2.2, W - .5, DARK);
      hz = .75; tz = 1.0; hb = W / 2 - .4; cb = W / 2 - .15; lz = .14;
    } else {
      const s = SP[kind] || SP.car;
      for (const a of [L / 2 - .85, -L / 2 + .85]) { wheel(a, W / 2 - .1, .32, .24); wheel(a, -W / 2 + .1, .32, .24); }
      if (kind === 'police') { box(0, 0, s[0], .62, L, W - .08, POLDARK); box(0, 0, .62, s[1], L - .02, W - .07, WHITE); }
      else box(0, 0, s[0], s[1], L, W - .08, body);
      box(0, 0, .22, .4, L - .3, W - .3, DARK);
      const i = cnt.glass++, cl = L * s[3], cw = W - .16;
      vS.set(cl, s[2] - s[1] - .04, cw); put(glassM, i, loc(L * s[4], 0, s[1], vK), qYaw, vS); col(glassM, i, GLASS);
      const roofC = kind === 'police' ? WHITE : body;
      box(L * s[4] - cl * .08, 0, s[2] - .04, s[2] + .02, cl * .6, cw * .86, roofC);
      if (kind === 'taxi') { box(-L * .06, 0, s[2] + .02, s[2] + .18, .38, .62, C('#F7F2E0')); }
      if (kind === 'police') { box(-L * .06, .2, s[2] + .02, s[2] + .17, .3, .32, C('#E5484D')); box(-L * .06, -.2, s[2] + .02, s[2] + .17, .3, .32, C('#3C6FE0')); }
      hz = s[5]; tz = s[5] + .04; hb = W / 2 - .34; cb = W / 2 - .13; lz = .13;
    }
    lampsOf(c, L / 2, L / 2, hz, tz, hb, cb, lz, false);
  }
  // ライト一式：ヘッド2/テール2/ウインカー4（バイクはヘッド1 + テール1 + ウインカー4）
  function lampsOf(c, lf, lr, hz, tz, hb, cb, lz, moto) {
    const L = c.len, bl = c.blink || 0, br = c.brake;
    const hC = night ? [1, .96, .78] : [.82, .85, .86];
    const tC = br ? (night ? [1, .3, .25] : [1, .12, .1]) : (night ? [.8, .08, .08] : [.5, .07, .07]);
    const rear = moto ? -L / 2 + .12 : -L / 2;
    const front = moto ? L / 2 - .46 : L / 2;
    if (moto) { lamp(front + .02, 0, hz, .1, .13, .2, hC); lamp(rear + .02, 0, tz, .08, .08, .2, tC); }
    else for (let k = -1; k <= 1; k += 2) {
      lamp(front - .03, k * hb, hz, .07, .13, .38, hC);
      lamp(rear + .03, k * hb, tz, .07, .13 + (br ? .03 : 0), .38, tC);
    }
    // ウインカー（局所 b>0 が車の左：blink -1 = 左）
    for (let k = -1; k <= 1; k += 2) {
      const on = (bl === -1 && k > 0) || (bl === 1 && k < 0);
      const wc = on ? [1, .66, .08] : (night ? [.2, .11, .02] : [.38, .22, .05]);
      const bb = moto ? k * .24 : k * cb;
      lamp(front - .01 - (moto ? .0 : .0), bb, hz - lz, .08, .09, .13, wc);
      lamp(rear + .01, bb, hz - lz + (moto ? -.18 : .0), .08, .09, .13, wc);
    }
    if (night) {
      const i = cnt.pool++; const s = moto ? 6 : 8; vS.set(s, 1, moto ? 2.5 : 5);
      put(poolM, i, loc(L / 2 - .1, 0, .05, vK), qYaw, vS);
    }
  }

  // ---- 毎フレーム ----
  function update(sim, dt) {
    lastSim = sim;
    for (const k in cnt) cnt[k] = 0;
    const peds = sim.peds, cars = sim.cars;
    const np = Math.min(peds.length, maxPeds);
    for (let n = 0; n < np; n++) {
      const p = peds[n], z = onSW(p.x, p.y) ? CURB : 0;
      frame(p.x, p.y, p.hx, p.hy, z);
      if (p.bike) cyclist(p, z); else walker(p, z);
    }
    const nc = Math.min(cars.length, maxCars);
    for (let n = 0; n < nc; n++) vehicle(cars[n]);
    // 確定
    fin(torsoM, cnt.torso, true); fin(headM, cnt.torso, true); fin(hairM, cnt.torso, true);
    fin(armM, cnt.arm, true); fin(legM, cnt.leg, true); fin(tireM, cnt.tire, true); fin(barM, cnt.bar, true);
    fin(boxM, cnt.box, true); fin(glassM, cnt.glass, true); fin(wheelM, cnt.wheel, true); fin(hubM, cnt.hub, true);
    fin(lampM, cnt.lamp, true); fin(poolM, cnt.pool, false);
    // 選択リング
    if (selPed) {
      ring.position.set(selPed.x, (onSW(selPed.x, selPed.y) ? CURB : 0) + .04, selPed.y);
      const s = selPed.bike ? 1.5 : 1; ring.scale.set(s, 1, s);
      ring.visible = true;
    }
  }
  function fin(m, n, colored) {
    m.count = n;
    const a = m.instanceMatrix; a.needsUpdate = true; a.updateRange.offset = 0; a.updateRange.count = n * 16;
    if (colored && m.instanceColor) { m.instanceColor.needsUpdate = true; m.instanceColor.updateRange.offset = 0; m.instanceColor.updateRange.count = n * 3; }
  }

  function setNight(b) { night = !!b; }
  function setShadows(b) { shadows = !!b; for (const m of meshes) if (m !== lampM && m !== poolM && m !== hubM) m.castShadow = shadows; }
  function highlight(p) { selPed = p || null; if (!selPed) ring.visible = false; }

  // ---- 選択：レイと「足もと〜頭の縦線」の最短距離が .5m 以内で最も近い人 ----
  function pick(rc) {
    if (!lastSim) return null;
    const o = rc.ray.origin, d = rc.ray.direction, peds = lastSim.peds;
    const n = Math.min(peds.length, maxPeds);
    let best = null, bs = Infinity;
    for (let i = 0; i < n; i++) {
      const p = peds[i], z0 = onSW(p.x, p.y) ? CURB : 0;
      // 線分 P=(x,z0+.05,y) から v=(0,1.6,0)
      const wx = o.x - p.x, wy = o.y - (z0 + .05), wz = o.z - p.y;
      const b = d.y * 1.6, c = 2.56, dd = d.x * wx + d.y * wy + d.z * wz, e = 1.6 * wy;
      const den = c - b * b;
      let t = den > 1e-9 ? (e - b * dd) / den : 0;   // a = 1
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      let s = b * t - dd; if (s < 0) s = 0;
      const dx = o.x + d.x * s - p.x, dy = o.y + d.y * s - (z0 + .05 + 1.6 * t), dz = o.z + d.z * s - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < .5) { const sc = dist + s * .004; if (sc < bs) { bs = sc; best = p; } }
    }
    return best;
  }

  return { update, setNight, pick, highlight, setShadows, meshes, ring };
}

CS3.Actors = { create };
})();
