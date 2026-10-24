// 3D版の動きの計算（人・自転車・車・信号）。描画とは無関係で、THREE も DOM も使わない。
// 形は geom.js（CS3.geom）だけを見て決める。2D版（../index.html）の social force・信号・車の走路を一つの交差点に合わせて移植した。
(() => {
'use strict';
const CS3 = window.CS3 = window.CS3 || {};
const G = CS3.geom;
const { HALF, RW, SW, STOP, HEAD, left, CORNERS, CROSSWALKS, GATES, DOORS, ENTRIES } = G;

const STEP = 1 / 30;       // 内部の最大刻み
const MAXP = 800;          // 人の上限
const CORNER_CAP = 230;    // 1つの角にいられる人数（これ以上は新しく出さない）
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pick = a => a[Math.floor(Math.random() * a.length)];

/* ---------- 見た目の色（2D版と同じ） ---------- */
const CLOTHES_BASE = [
  '#2F3A4C','#3B3F46','#5B6B7F','#24324A','#1E2430','#454B55','#6B7280','#9AA7B4','#C9CED6','#E3E0D8','#F2F0EA',
  '#8C7A64','#C6B49A','#6E4F3A','#A68A64','#D8C3A0','#7B5E45','#B9A58A',
  '#2E5E58','#4A5D3A','#6B7F4E','#3E6B5A','#8FA77F',
  '#7A3E48','#B5654A','#9C3D3D','#C9875E','#5C4A6E','#7D6B91',
  '#3D5A80','#5B7DB1','#8EAFD4','#2B4C6F'
];
const CLOTHES_POP = ['#E8B04B','#D9573F','#3FA7A0','#E07A9A','#6C8EE0','#F0D35E','#8BC36A','#C24D7C','#4FB3D9','#F2A65A'];
const PANTS = ['#1E2430','#2A2F38','#343A45','#24324A','#3B4252','#4A505C','#5C5F66','#6E5C49','#8C7A64','#B9A58A','#2F4B6E','#4C6A92','#E3E0D8'];
const SKIN = ['#EBC7A4','#D9AA84','#C08A60','#F2D5B8','#A97452'];
const HAIR = ['#1E1B1A','#2B2420','#3A2E26','#5A4636','#1B1E24','#7B6A5A'];
const BIKE_COLS = ['#C62F2F', '#1F2329', '#2F5FA8', '#E8E3D6', '#2E8B6A', '#E9C23A'];
const hex2 = v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
function shadeHex(hex, f) { const n = parseInt(hex.slice(1), 16); return '#' + hex2((n >> 16) * f) + hex2((n >> 8 & 255) * f) + hex2((n & 255) * f); }
const jit = hex => shadeHex(hex, .86 + Math.random() * .26);   // 同じ色でも少しずつ明るさをばらつかせる
function pickOutfit() {
  const top = jit(Math.random() < .14 ? pick(CLOTHES_POP) : pick(CLOTHES_BASE));
  return { cl: top, pt: Math.random() < .18 ? shadeHex(top, .88) : jit(pick(PANTS)) };   // 上下おそろいもいる
}

/* ---------- 車の種類（2D版と同じ割合） ---------- */
const CAR_COLS = ['#F4F5F7', '#F4F5F7', '#1F2329', '#AEB4BC', '#7D8692', '#33507A', '#8E2F35', '#E9E3D3'];
const VEH = [
  { kind: 'car', p: .36, len: [4.2, 4.8], w: 1.75, cols: CAR_COLS },
  { kind: 'kei', p: .14, len: [3.3, 3.4], w: 1.48, cols: ['#F2EFE8', '#E8C9A0', '#9CC3D5', '#F0A8B8', '#B7D3A8', '#3F4A5A'] },
  { kind: 'van', p: .1, len: [4.7, 4.9], w: 1.8, cols: ['#F4F5F7', '#1F2329', '#AEB4BC', '#5A6672'] },
  { kind: 'taxi', p: .1, len: [4.5, 4.5], w: 1.7, cols: ['#E9C23A', '#E9C23A', '#3D6E5A', '#2E3A55'] },
  { kind: 'truck', p: .07, len: [6.5, 7.5], w: 2.1, cols: ['#F4F5F7', '#3F6FB0', '#2E8B6A', '#C9553F'] },
  { kind: 'police', p: .02, len: [4.8, 4.8], w: 1.78, cols: ['#F4F5F7'] },
  { kind: 'bus', p: .05, len: [10.5, 10.5], w: 2.4, cols: ['#3C8D6E', '#2F6FB0', '#C9553F'] },
  { kind: 'bike', p: .16, len: [2.1, 2.2], w: .8, cols: BIKE_COLS }
];

/* ---------- 車の走路（入口×車線×曲がり方ごとに1本ずつ作って使い回す） ---------- */
const DS = .25;
function makePath(segs) {
  const raw = [];
  for (const sg of segs) {
    if (sg.length === 2) {
      const [a, b] = sg, n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .1));
      for (let i = 0; i <= n; i++) raw.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
    } else {   // 2次ベジェ（曲がる弧）
      const [a, c, b] = sg;
      for (let i = 0; i <= 200; i++) { const t = i / 200, u = 1 - t; raw.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); }
    }
  }
  const X = [raw[0][0]], Y = [raw[0][1]];   // 弧長 DS ごとに取り直す
  let acc = 0, next = DS;
  for (let i = 1; i < raw.length; i++) {
    const ax = raw[i - 1][0], ay = raw[i - 1][1], d = Math.hypot(raw[i][0] - ax, raw[i][1] - ay);
    if (d <= 0) continue;
    while (acc + d >= next) { const t = (next - acc) / d; X.push(ax + (raw[i][0] - ax) * t); Y.push(ay + (raw[i][1] - ay) * t); next += DS; }
    acc += d;
  }
  return { X, Y };
}
// turn: 0 直進 / -1 左折（外側車線） / 1 右折（内側車線）
function buildTemplate(k, lane, turn) {
  const h = HEAD[k], L = left(h), o = lane;
  const at = (a, b) => [h[0] * a + L[0] * b, h[1] * a + L[1] * b];   // 進む向きに a、左に b
  const start = at(-HALF, o), segs = [];
  if (turn === 0) segs.push([start, at(HALF + 12, o)]);
  else if (turn < 0) { const P0 = at(-7.4, 4.4), Pc = at(-4.4, 4.4), P1 = at(-4.4, 7.4); segs.push([start, P0], [P0, Pc, P1], [P1, at(-4.4, HALF + 12)]); }
  else { const P0 = at(-6, 1.6), Pc = at(1.6, 1.6), P1 = at(1.6, -6); segs.push([start, P0], [P0, Pc, P1], [P1, at(1.6, -HALF - 12)]); }
  const { X, Y } = makePath(segs), n = X.length;
  const hd = (i, j) => { const dx = X[j] - X[i], dy = Y[j] - Y[i], d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; };
  const h0 = hd(0, 3), h1 = hd(n - 4, n - 1);
  let exitS = (n - 1) * DS;
  for (let i = Math.round((HALF - STOP) / DS) + 8; i < n; i++) if (Math.abs(X[i]) > STOP || Math.abs(Y[i]) > STOP) { exitS = i * DS; break; }
  return { k, lane, turn, g: k % 2 === 0 ? 'ew' : 'ns', X, Y, len: (n - 1) * DS, hx0: h0[0], hy0: h0[1], hx1: h1[0], hy1: h1[1], stopS: HALF - STOP, exitS };
}
const TPL = {};   // `${k}_${lane}_${turn}`
for (let k = 0; k < 4; k++) for (const [lane, turns] of [[1.6, [0, 1]], [4.4, [0, -1]]]) for (const t of turns) TPL[k + '_' + lane + '_' + t] = buildTemplate(k, lane, t);
// 走路上の位置（範囲の外は端の向きに延長する）
function pathAt(t, s, out) {
  if (s <= 0) { out.x = t.X[0] + t.hx0 * s; out.y = t.Y[0] + t.hy0 * s; return out; }
  if (s >= t.len) { const e = s - t.len, n = t.X.length - 1; out.x = t.X[n] + t.hx1 * e; out.y = t.Y[n] + t.hy1 * e; return out; }
  const f = s / DS, i = f | 0, u = f - i;
  out.x = t.X[i] + (t.X[i + 1] - t.X[i]) * u; out.y = t.Y[i] + (t.Y[i + 1] - t.Y[i]) * u;
  return out;
}

// 点が車体（向き付き長方形）に入っているか
function hitsCar(x, y, o, mLat, mLong) {
  const dx = x - o.x, dy = y - o.y;
  const a = dx * o.hx + dy * o.hy, b = -dx * o.hy + dy * o.hx;
  return Math.abs(a) < o.len / 2 + mLong && Math.abs(b) < o.w / 2 + mLat;
}
// 2台の車体が重なるか（分離軸定理）
const AX = [0, 0, 0, 0, 0, 0, 0, 0];
function carsOverlap(A, B) {
  AX[0] = A.hx; AX[1] = A.hy; AX[2] = -A.hy; AX[3] = A.hx; AX[4] = B.hx; AX[5] = B.hy; AX[6] = -B.hy; AX[7] = B.hx;
  for (let q = 0; q < 8; q += 2) {
    const ux = AX[q], uy = AX[q + 1];
    const ra = Math.abs(A.hx * ux + A.hy * uy) * A.len / 2 + Math.abs(-A.hy * ux + A.hx * uy) * A.w / 2;
    const rb = Math.abs(B.hx * ux + B.hy * uy) * B.len / 2 + Math.abs(-B.hy * ux + B.hx * uy) * B.w / 2;
    if (Math.abs((A.x - B.x) * ux + (A.y - B.y) * uy) > ra + rb + .1) return false;
  }
  return true;
}

/* ---------- 人の出入口と道すじ ---------- */
const DIR_NAME = (x, y, ax) => ax === 'y' ? (x > 0 ? '東' : '西') : (y > 0 ? '南' : '北');
const PLACES = [];
for (const g of GATES) PLACES.push({ kind: 'gate', c: g.corner, ax: g.ax, g, name: '街の外（' + DIR_NAME(g.x, g.y, g.ax) + '側）' });
for (const d of DOORS) PLACES.push({ kind: 'door', c: d.corner, d, name: CORNERS[d.corner].name2 });
const GATE_PLACES = PLACES.filter(p => p.kind === 'gate');
// 出入口の具体的な点（毎回少しずらす）
function placePoint(pl, enter) {
  if (pl.kind === 'gate') {
    const C = CORNERS[pl.c], g = pl.g, off = rand(RW + 1.2, SW - 1.2), edge = HALF - (enter ? .3 : .5);
    return pl.ax === 'y' ? { x: C.sx * edge, y: C.sy * off } : { x: C.sx * off, y: C.sy * edge };
  }
  const d = pl.d, j = rand(-2, 2);
  return d.ny !== 0 ? { x: d.x + j, y: d.y } : { x: d.x, y: d.y + j };
}
// 横断1本ぶんの区間：角 c から角 d へ。ay は渡る向きが y 軸方向（東西の腕の横断歩道）
function makeLeg(c, d) {
  const cw = CROSSWALKS.find(w => (w.a === c && w.b === d) || (w.a === d && w.b === c));
  const C = CORNERS[c], D = CORNERS[d], lat = rand(7.9, 10.1), ay = cw.arm % 2 === 0, e = 6.8;
  const leg = { cw, c, d, ay, lat, ns: ay ? C.sy : C.sx };
  if (ay) { leg.nx = C.sx * lat; leg.ny = C.sy * e; leg.fx = leg.nx; leg.fy = D.sy * e; leg.lo = Math.min(cw.rect.x0, cw.rect.x1) + .2; leg.hi = Math.max(cw.rect.x0, cw.rect.x1) - .2; }
  else { leg.nx = C.sx * e; leg.ny = C.sy * lat; leg.fx = D.sx * e; leg.fy = leg.ny; leg.lo = Math.min(cw.rect.y0, cw.rect.y1) + .2; leg.hi = Math.max(cw.rect.y0, cw.rect.y1) - .2; }
  return leg;
}
// 角 c0 から c1 へ。斜めは2本、渡る順はどちらか
function planLegs(c0, c1) {
  if (c0 === c1) return [];
  const dx = (c0 & 1) !== (c1 & 1), dy = (c0 >> 1) !== (c1 >> 1);
  if (dx && dy) { const mid = Math.random() < .5 ? c0 ^ 1 : c0 ^ 2; return [makeLeg(c0, mid), makeLeg(mid, c1)]; }
  return [makeLeg(c0, c1)];
}

/* ---------- 人どうしの力（2D版と同じ。1組ずつ1回だけ計算して両方に配る） ---------- */
const CELL = 2, GO = HALF + 1, GN = Math.ceil((HALF * 2 + 2) / CELL);
const CUT2 = 4;
const XF = .55;   // 渡る・出ていく人どうしの力の倍率
const NB = [[1, 0], [-1, 1], [0, 1], [1, 1]];
function sideForce(p, q, nx, ny, base, body, LAM) {
  const cos = -(nx * p.ex + ny * p.ey);
  const w = LAM + (1 - LAM) * (1 + cos) / 2;
  let f = base * w;
  // 信号待ち・歩道を歩く人は道をゆずり、渡ってきた人・出ていく人はその間を通り抜ける
  if (p.yl && !q.yl) f *= 1.8; else if (!p.yl && q.yl) f *= .35;
  f *= p.gf;   // 動けなくなった人は周りの力を弱めて押し通る
  f += body;
  p.ax += f * nx; p.ay += f * ny;
  // 正面から来る人とは左側通行ぎみにすれ違う（待っている人にはかけない）
  if (!p.wt && p.sp > .5 * p.v0 && cos > .5 && q.vx * p.ex + q.vy * p.ey < -.2) { p.ax += p.ey * .6 * w; p.ay -= p.ex * .6 * w; }
}

function create(opts) {
  const P = Object.assign({ rate: 120, green: 20, bike: 8, carRate: 1 }, opts || {});
  const sim = {
    t: 0, peds: [], cars: [],
    signal: { car: { ew: 'r', ns: 'r' }, ped: 'stop', rem: 0 },
    stats: { people: 0, crossing: 0, avgWait: 0 },
    dbg: { spawned: 0, arrived: 0, timeouts: 0, removedCars: 0, crossStarts: 0, crossStartsNotGo: 0, carsSpawned: 0 }
  };
  const peds = sim.peds, cars = sim.cars, sig = sim.signal;

  /* 信号：順番は2D版と同じ */
  let ph = [], sigIdx = 0, sigT = 0;
  function makePhases() {
    return [
      { id: 'ew', dur: 15 }, { id: 'ewy', dur: 3 }, { id: 'ewa', dur: 5 }, { id: 'ar', dur: 2 },
      { id: 'ns', dur: 15 }, { id: 'nsy', dur: 3 }, { id: 'nsa', dur: 5 }, { id: 'ar', dur: 2 },
      { id: 'ped', dur: P.green }, { id: 'flash', dur: 5 }, { id: 'ar', dur: 3 }
    ];
  }
  const pedOf = id => id === 'ped' ? 'go' : id === 'flash' ? 'flash' : 'stop';
  function updateSignal() {
    const id = ph[sigIdx].id, n = ph.length;
    sig.car.ew = id === 'ew' ? 'g' : id === 'ewy' ? 'y' : id === 'ewa' ? 'a' : 'r';
    sig.car.ns = id === 'ns' ? 'g' : id === 'nsy' ? 'y' : id === 'nsa' ? 'a' : 'r';
    sig.ped = pedOf(id);
    let rem = ph[sigIdx].dur - sigT, i = (sigIdx + 1) % n;   // 歩行者信号が同じ状態でいる残り秒
    while (i !== sigIdx && pedOf(ph[i].id) === sig.ped) { rem += ph[i].dur; i = (i + 1) % n; }
    sig.rem = rem;
  }
  function sigStep(dt) {
    sigT += dt;
    while (sigT >= ph[sigIdx].dur) { sigT -= ph[sigIdx].dur; sigIdx = (sigIdx + 1) % ph.length; }
    updateSignal();
  }

  /* 人の近傍格子（人がいるマスだけ覚える） */
  const grid = Array.from({ length: GN * GN }, () => []);
  const usedCells = [];
  const cell = v => clamp(Math.floor((v + GO) / CELL), 0, GN - 1);
  function buildGrid() {
    for (const k of usedCells) grid[k].length = 0;
    usedCells.length = 0;
    for (const p of peds) {
      p.gx = cell(p.x); p.gy = cell(p.y);
      const k = p.gy * GN + p.gx;
      if (grid[k].length === 0) usedCells.push(k);
      grid[k].push(p);
    }
  }
  function pairOne(p, q, A, B, LAM, ps) {
    const rx = p.x - q.x, ry = p.y - q.y, d2 = rx * rx + ry * ry;
    if (d2 > CUT2 || d2 < 1e-8) return;
    const d = Math.sqrt(d2), nx = rx / d, ny = ry / d, rij = p.r + q.r;
    const base = (p.yl || q.yl ? A : A * XF) * Math.exp((rij + ps - d) / B);   // 渡っている人どうしは力を弱め、流れが止まらないようにする
    const body = d < rij ? 40 * (rij - d) : 0;
    sideForce(p, q, nx, ny, base, body, LAM);
    sideForce(q, p, -nx, -ny, base, body, LAM);
  }
  function pairForces(A, B, LAM, ps) {
    for (const k of usedCells) {
      const gx = k % GN, gy = (k - gx) / GN, c = grid[k];
      for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) pairOne(c[i], c[j], A, B, LAM, ps);
      for (const [ox, oy] of NB) {
        const hx = gx + ox, hy = gy + oy;
        if (hx < 0 || hx >= GN || hy >= GN) continue;
        const other = grid[hy * GN + hx];
        for (let i = 0; i < c.length; i++) for (let j = 0; j < other.length; j++) pairOne(c[i], other[j], A, B, LAM, ps);
      }
    }
  }
  // 自転車の徐行：進行方向約4m先の円すい内でいちばん近い人との距離に応じて速さを落とす
  function bikeSlow(p, ex, ey, sp) {
    let nd = 9;
    for (let j = Math.max(0, p.gy - 2); j <= Math.min(GN - 1, p.gy + 2); j++) for (let i = Math.max(0, p.gx - 2); i <= Math.min(GN - 1, p.gx + 2); i++) {
      const c = grid[j * GN + i];
      for (let k = 0; k < c.length; k++) {
        const q = c[k]; if (q === p) continue;
        const rx = q.x - p.x, ry = q.y - p.y, d = Math.hypot(rx, ry);
        if (d < nd && d < 4 && rx * ex + ry * ey > .75 * d) nd = d;
      }
    }
    if (nd >= 4) return sp;
    const f = clamp((nd - 1) / 3, .3, 1);
    return nd > 1.2 ? Math.max(sp * f, Math.min(sp, 1)) : sp * f;
  }
  // 車道に人がいるか（横断中・避難中・道路上の人だけ）
  function roadPed(x, y, rad) {
    const gx = cell(x), gy = cell(y), r2 = rad * rad;
    for (let j = Math.max(0, gy - 1); j <= Math.min(GN - 1, gy + 1); j++) for (let i = Math.max(0, gx - 1); i <= Math.min(GN - 1, gx + 1); i++) {
      const c = grid[j * GN + i];
      for (let k = 0; k < c.length; k++) {
        const q = c[k]; if (!q.road) continue;
        const dx = q.x - x, dy = q.y - y;
        if (dx * dx + dy * dy < r2) return true;
      }
    }
    return false;
  }

  /* 歩ける範囲への押し戻し：角ごとのL字（壁の内側の角は中継点で回る） */
  const WALL = .25;   // 壁からの余白
  function clampCorner(p, c, free) {   // free: 1 なら x 方向、2 なら y 方向の車道がわの下限をかけない（横断の出入り用）
    const C = CORNERS[c];
    let u = p.x * C.sx, v = p.y * C.sy;
    if (free !== 1 && u < RW + .05) u = RW + .05;
    if (free !== 2 && v < RW + .05) v = RW + .05;
    if (u > HALF - .05) u = HALF - .05;
    if (v > HALF - .05) v = HALF - .05;
    const du = u - SW, dv = v - SW;
    if (du > -WALL && dv > -WALL) { if (du > dv) v = SW - WALL; else u = SW - WALL; }   // 建物の中に入りかけたら、近いほうの縁へ
    p.x = u * C.sx; p.y = v * C.sy;
  }
  const W_IN = SW - 1.0;   // 内側の角の中継点
  // 目標が別の腕にあるとき、壁の角を回る中継点に置き換える
  function aim(p, tx, ty) {
    const C = CORNERS[p.c], pu = p.x * C.sx, pv = p.y * C.sy, tu = tx * C.sx, tv = ty * C.sy;
    if ((pu > SW - .3 && tv > SW - .3 && tu < SW + .5) || (pv > SW - .3 && tu > SW - .3 && tv < SW + .5)) { AIM.x = W_IN * C.sx; AIM.y = W_IN * C.sy; return AIM; }
    AIM.x = tx; AIM.y = ty; return AIM;
  }
  const AIM = { x: 0, y: 0 };

  /* 人の発生 */
  let pedId = 0, spawnAcc = 0;
  const cornerLoad = [0, 0, 0, 0];
  const waits = [];
  function spawnPed() {
    if (peds.length >= MAXP) return;
    const wantBike = Math.random() * 100 < P.bike;
    const o = wantBike ? pick(GATE_PLACES) : pick(PLACES);
    if (cornerLoad[o.c] >= CORNER_CAP) return;
    let to;
    do { to = wantBike ? pick(GATE_PLACES) : pick(PLACES); } while (to === o || (wantBike && to.c === o.c));
    const st = placePoint(o, true), dest = placePoint(to, false);
    const bike = wantBike;
    const vf = 1 + (Math.random() * 2 - 1) * .4 * .45;
    const v0 = bike ? clamp(rand(3, 4) * vf, 2.2, 4.5) : clamp(1.3 * vf, .55, 2.2);
    const of = pickOutfit();
    const tx = dest.x - st.x, ty = dest.y - st.y, td = Math.hypot(tx, ty) || 1;
    const p = {
      id: pedId++, x: st.x, y: st.y, hx: tx / td, hy: ty / td, speed: 0, phase: Math.random() * 6.28,
      bike, cl: of.cl, pt: of.pt, sk: pick(SKIN), hr: pick(HAIR),
      bc: bike ? pick(BIKE_COLS) : null, hm: bike && Math.random() < .6 ? pick(BIKE_COLS) : null,
      st: 'walk', from: o.name, to: to.name,
      // ここから内部用
      vx: 0, vy: 0, ax: 0, ay: 0, ex: 0, ey: 0, sp: 0, v0, r: bike ? .3 : rand(.22, .28),
      c: o.c, dc: to.c, dx: dest.x, dy: dest.y, leaveR: to.kind === 'gate' ? 1.2 : .8,
      gf: 1, jam: 0, legs: planLegs(o.c, to.c), li: 0, mode: 'walk', waitT0: -1, wt: false, yl: false, road: false, born: sim.t, gx: 0, gy: 0
    };
    peds.push(p); cornerLoad[o.c]++; sim.dbg.spawned++;
  }

  /* 人の1ステップ */
  const A_F = 2.1, B_F = .32, TAU = .5, LAM = .35, PS = .25;
  function pedsStep(dt) {
    const S = sig.ped, t = sim.t;
    buildGrid();
    cornerLoad[0] = cornerLoad[1] = cornerLoad[2] = cornerLoad[3] = 0;
    for (const p of peds) {
      cornerLoad[p.c]++;
      let tx, ty, sp = p.v0, wt = false;
      const lg = p.li < p.legs.length ? p.legs[p.li] : null;
      p.yl = false;
      if (p.mode === 'walk') {
        if (lg) {
          p.yl = true;
          const dd = Math.hypot(lg.nx - p.x, lg.ny - p.y);
          tx = lg.nx; ty = lg.ny;
          if (S === 'go' && (dd < 3.5 || (dd < 9 && sig.rem > 9))) {   // 青のときだけ渡り始める（人ごみの後ろの人も、青が十分残っていれば歩道を進みながら渡り始める）
            p.mode = 'cross'; sim.dbg.crossStarts++;
            if (S !== 'go') sim.dbg.crossStartsNotGo++;
            waits.push(p.waitT0 >= 0 ? t - p.waitT0 : 0); if (waits.length > 150) waits.shift();
            p.waitT0 = -1;
          } else if (S !== 'go' && dd < 8) {   // 点滅・赤は歩道のふちで待つ
            if (p.waitT0 < 0) p.waitT0 = t;
            sp = p.v0 * clamp((dd - .3) / (p.bike ? 1.6 * p.v0 / 1.3 : 1.6), 0, 1);
            wt = dd < 2.5;
          }
        } else { tx = p.dx; ty = p.dy; }
      }
      if (p.mode === 'cross' || p.mode === 'refuge') {
        const a = lg.ay ? p.y : p.x, l = lg.ay ? p.x : p.y;
        if (p.mode === 'cross') {
          const prog = (-lg.ns * a + 6.8) / 13.6;
          if (S === 'stop' && prog < .45 && lg.ns * a > -2) p.mode = 'refuge';   // 渡り始めたばかりで赤になったら、渡ってきた側へ戻る
          else {
            if (S !== 'go') sp = p.v0 * 1.35;   // 青が変わったら急いで渡りきる
            if (p.bike) sp = Math.min(sp, 2.5);
            if (-lg.ns * a >= 6.3) { p.c = lg.d; p.li++; p.mode = 'walk'; p.waitT0 = -1; }   // 渡りきった
          }
        }
        if (p.mode === 'refuge') {
          sp = p.v0 * 1.4; if (p.bike) sp = Math.min(sp, 2.5);
          if (lg.ns * a >= 6.3) { p.mode = 'walk'; p.waitT0 = -1; }
        }
        if (p.mode === 'cross') {
          // 歩道側にいるうちは横断歩道の列に合わせ、車道に入ったら向こう岸へ
          const lc = lg.ay ? lg.nx : lg.ny;
          if (lg.ns * a > 6.2 && Math.abs(l - lc) > 1.2) { if (lg.ay) { tx = lc; ty = lg.ns * 5.3; } else { tx = lg.ns * 5.3; ty = lc; } }
          else if (lg.ay) { tx = lg.nx; ty = -lg.ns * 7.6; } else { tx = -lg.ns * 7.6; ty = lg.ny; }
        } else if (p.mode === 'refuge') { tx = lg.nx; ty = lg.ny; }
        else { const l2 = p.li < p.legs.length ? p.legs[p.li] : null; if (l2) { tx = l2.nx; ty = l2.ny; } else { tx = p.dx; ty = p.dy; } }   // 渡りきった直後
      }
      if (p.mode === 'walk') { const q = aim(p, tx, ty); tx = q.x; ty = q.y; }
      const dx = tx - p.x, dy = ty - p.y, dd = Math.hypot(dx, dy) || 1;
      const ex = dx / dd, ey = dy / dd;
      if (p.bike) { sp = bikeSlow(p, ex, ey, sp); if (p.mode !== 'walk') sp = Math.min(sp, 2.5); sp = Math.min(sp, 4.5); }
      let fx = (ex * sp - p.vx) / TAU, fy = (ey * sp - p.vy) / TAU;
      p.ex = ex; p.ey = ey; p.sp = sp; p.wt = wt;
      p.st = p.mode === 'walk' ? (lg && S !== 'go' && p.waitT0 >= 0 && wt ? 'wait' : 'walk') : 'cross';
      // 車をよける
      if (p.road || p.mode !== 'walk') {
        for (let ci = 0; ci < cars.length; ci++) {
          const o = cars[ci];
          const ddx = p.x - o.x, ddy = p.y - o.y;
          if (Math.abs(ddx) > 7 || Math.abs(ddy) > 7) continue;
          const a = ddx * o.hx + ddy * o.hy, b = -ddx * o.hy + ddy * o.hx;
          const ra = a - clamp(a, -o.len / 2, o.len / 2), rb = b - clamp(b, -o.w / 2, o.w / 2), d = Math.hypot(ra, rb);
          if (d > 1.6 || d < 1e-4) continue;
          const f = 6 * Math.exp((p.r + .15 - d) / .25);
          const nx = (ra * o.hx - rb * o.hy) / d, ny = (ra * o.hy + rb * o.hx) / d;
          fx += f * nx; fy += f * ny;
          const en = ex * nx + ey * ny;   // 車に向かって進むときは車体に沿って回りこむ
          if (en < 0 && d < 1.2) {
            let tx2 = ex - en * nx, ty2 = ey - en * ny, tl = Math.hypot(tx2, ty2);
            if (tl < .2) { tx2 = -ny; ty2 = nx; tl = 1; }
            fx += 2.5 * tx2 / tl; fy += 2.5 * ty2 / tl;
          }
        }
      }
      p.ax = fx; p.ay = fy;
    }
    pairForces(A_F, B_F, LAM, PS);

    for (let i = peds.length - 1; i >= 0; i--) {
      const p = peds[i];
      p.vx += p.ax * dt; p.vy += p.ay * dt;
      const s = Math.hypot(p.vx, p.vy), m = p.bike ? Math.min(p.v0 * 1.2, 4.8) : p.v0 * 1.45;
      if (s > m) { p.vx *= m / s; p.vy *= m / s; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const sv = Math.min(s, m);
      // 車の中に入りこまないよう押し出す
      if (p.mode !== 'walk' || p.road) {
        for (let ci = 0; ci < cars.length; ci++) {
          const o = cars[ci];
          const ddx = p.x - o.x, ddy = p.y - o.y;
          if (Math.abs(ddx) > 7 || Math.abs(ddy) > 7) continue;
          const a = ddx * o.hx + ddy * o.hy, b = -ddx * o.hy + ddy * o.hx, ea = o.len / 2 + p.r, eb = o.w / 2 + p.r;
          if (Math.abs(a) >= ea || Math.abs(b) >= eb) continue;
          let na = a, nb = b;
          if (ea - Math.abs(a) < eb - Math.abs(b)) na = (a < 0 ? -1 : 1) * ea; else nb = (b < 0 ? -1 : 1) * eb;
          p.x = o.x + na * o.hx - nb * o.hy; p.y = o.y + na * o.hy + nb * o.hx;
          p.vx *= .3; p.vy *= .3;
        }
      }
      // 歩ける範囲に収める
      if (p.mode === 'walk') clampCorner(p, p.c, 0);
      else {
        const lg = p.legs[p.li], a = lg.ay ? p.y : p.x;
        if (Math.abs(a) < RW + .05) {   // 車道の上は横断歩道の幅の中だけ
          if (lg.ay) p.x = clamp(p.x, lg.lo, lg.hi); else p.y = clamp(p.y, lg.lo, lg.hi);
        } else clampCorner(p, G.cornerOf(p.x, p.y), lg.ay ? 2 : 1);
      }
      p.road = Math.abs(p.x) < RW - .05 || Math.abs(p.y) < RW - .05;   // 縁にいるだけの人は車道の人として数えない
      p.phase += sv * dt * (p.bike ? 2.6 : 7.5);
      p.speed = sv;
      // 動けないまま4秒たったら、周りの力を弱めて押し通る（人ごみで固まらないように）
      if (sv < .2 && p.sp > .4) p.jam += dt; else p.jam = 0;
      p.gf = p.jam > 4 ? .3 : 1;
      if (s > .12) {   // 向きは進む向きへなめらかに回す
        const f = 1 - Math.exp(-dt * (p.bike ? 6 : 12)), nx = p.hx + (p.vx / s - p.hx) * f, ny = p.hy + (p.vy / s - p.hy) * f, nl = Math.hypot(nx, ny) || 1;
        p.hx = nx / nl; p.hy = ny / nl;
      }
      // 目的地に着いたら消える
      if (p.mode === 'walk' && p.li >= p.legs.length && Math.hypot(p.dx - p.x, p.dy - p.y) < p.leaveR) { peds.splice(i, 1); sim.dbg.arrived++; continue; }
      if (t - p.born > 280) { peds.splice(i, 1); sim.dbg.timeouts++; continue; }   // 念のための安全弁
    }
  }

  /* 車の発生 */
  let carId = 0;
  const entries = ENTRIES.map(e => ({ k: e.k, lane: e.lane, next: rand(0, 5), last: null }));
  function newCar(e) {
    let r = Math.random(), v = VEH[0];
    for (const t of VEH) { if (r < t.p) { v = t; break; } r -= t.p; }
    const inner = e.lane < 3;
    let turn = 0;
    if (v.kind !== 'bus' && Math.random() < .35) turn = inner ? 1 : -1;   // バスは直進だけ。内側は右折、外側は左折
    const len = rand(v.len[0], v.len[1]);
    const c = {
      id: carId++, kind: v.kind, x: 0, y: 0, hx: HEAD[e.k][0], hy: HEAD[e.k][1], len, w: v.w, col: pick(v.cols),
      speed: 0, turn, blink: 0, brake: false, rider: null,
      tpl: TPL[e.k + '_' + e.lane + '_' + turn], entry: e, s: len, v: 6, latch: 0, bt: 0, stuckT: 0, blk: null
    };
    if (v.kind === 'bike') { const of = pickOutfit(); c.rider = { cl: of.cl, pt: of.pt, sk: pick(SKIN), helm: pick(['#F4F5F7', '#1F2329', '#C62F2F', '#E9C23A']) }; }
    return c;
  }
  const F = { x: 0, y: 0 }, B = { x: 0, y: 0 }, M = { x: 0, y: 0 }, Q = { x: 0, y: 0 };
  function pose(c) {
    const t = c.tpl;
    pathAt(t, c.s, F); pathAt(t, c.s - c.len, B); pathAt(t, c.s - c.len / 2, M);
    c.x = M.x; c.y = M.y;
    const hx = F.x - B.x, hy = F.y - B.y, d = Math.hypot(hx, hy);
    if (d > .5) { c.hx = hx / d; c.hy = hy / d; }
  }
  // 右折車が、対向の車を待つべきか
  function oncomingThreat(c, raw) {
    const opp = (c.tpl.k + 2) % 4;
    for (const o of cars) {
      const ot = o.tpl;
      if (o === c || ot.k !== opp || o.s >= ot.exitS) continue;
      if (o.turn === 1) {   // 対向の右折車どうしは軌跡が交わるので、先に着いたほうが行く（同じなら番号の小さいほう）
        if (o.s > ot.stopS) return true;
        if (o.s > ot.stopS - 4 && o.id < c.id) return true;
        continue;
      }
      if (o.s > ot.stopS) return true;
      if (o.s > ot.stopS - 30 && o.v > 1) return true;   // 動いている対向車
      if (o.s > ot.stopS - 3 && raw === 'g') return true;     // 停止線で発進を待つ対向車（後ろに並んでいるだけの車は数えない）
    }
    return false;
  }
  const near = [];
  function carsStep(dt) {
    const t = sim.t;
    for (const e of entries) {   // 間隔をあけて出す
      if (t < e.next) continue;
      const c = newCar(e), last = e.last;
      if (!last || !cars.includes(last) || last.s - last.len > c.len + 4) {
        pose(c); cars.push(c); e.last = c; e.next = t + rand(10, 22) / Math.max(.05, P.carRate); sim.dbg.carsSpawned++;
      } else e.next = t + 1;
    }
    for (let ci = 0; ci < cars.length; ci++) {
      const c = cars[ci], tp = c.tpl, mg = c.w / 2 + .2;
      const d = tp.stopS - c.s;   // 停止線までの距離（前端から）
      const raw = sig.car[tp.g];
      let lim = Infinity, blk = null;
      // 近くの車を集める
      const look = Math.min(30, c.v * c.v / 10 + 6);
      near.length = 0;
      for (const o of cars) if (o !== c && Math.abs(o.x - c.x) < look + 16 && Math.abs(o.y - c.y) < look + 16) near.push(o);
      // 進路の先にいる車と人
      for (let dd = .5; dd <= look && lim === Infinity; dd += .75) {
        pathAt(tp, c.s + dd, Q);
        for (let k = 0; k < near.length; k++) {
          const o = near[k];
          if (!hitsCar(Q.x, Q.y, o, mg, mg)) continue;
          if (o.blk === c && o.v < .5 && c.id < o.id && c.v < .5) continue;   // お互いに待ち合っているときは番号の小さいほうが行く
          lim = dd - 1.6; blk = o; break;
        }
        if (lim === Infinity && dd <= 9 && roadPed(Q.x, Q.y, c.w / 2 + .55)) lim = dd - 1.2;
      }
      // 停止線の手前：信号、交差点の中の詰まり、対向車を確認してから入る
      if (d > -.01) {
        const goSig = raw === 'g' || (raw === 'a' && c.turn === 1);   // 'a' は右折の矢印：右折車だけ進める
        if (goSig) c.latch = 0;
        else if (c.latch === 0) {   // 青でなくなって最初に見たとき、止まれるなら止まる（黄で止まれないときは行く）
          c.latch = (d < c.v * c.v / (2 * (raw === 'y' ? 4 : 8))) ? 2 : 1;
        }
        let block = c.latch === 1;
        if (d < 18) {
          const eS = tp.exitS + c.len + 1;
          for (let s2 = tp.stopS; !block && s2 <= eS; s2 += .75) {
            pathAt(tp, s2, Q);
            for (let k = 0; k < near.length; k++) {
              const o = near[k];
              if (!hitsCar(Q.x, Q.y, o, mg, mg)) continue;
              // 交差点を抜けた先は動いている車も含めて空いていなければ入らない。同じ向きに流れる車は箱の中なら無視
              if (s2 <= tp.exitS && o.v > 1.5 && o.hx * tp.hx0 + o.hy * tp.hy0 > .7) continue;
              block = true; blk = o; break;
            }
            if (!block && s2 < tp.exitS && roadPed(Q.x, Q.y, c.w / 2 + .8)) block = true;
          }
          if (!block && c.turn === 1) block = oncomingThreat(c, raw);
          // 対向の右折車が曲がっている最中は入らない
          if (!block && c.turn !== 1) for (const o of cars) {
            const ot = o.tpl;
            if (o.turn === 1 && ot.k === (tp.k + 2) % 4 && o.s > ot.stopS && o.s < ot.exitS) { block = true; blk = o; break; }
          }
        }
        if (block && d < 60) lim = Math.min(lim, Math.max(0, d));
      }
      c.blk = lim < Infinity ? blk : null;
      const turning = c.turn !== 0 && c.s > tp.stopS - 15 && c.s < tp.exitS + 4;
      const vmax = c.kind === 'bus' ? 8 : c.kind === 'truck' ? 9 : turning ? (c.kind === 'bike' ? 6 : 5.5) : c.kind === 'bike' ? 11 : 10;
      const vt = Math.min(vmax, Math.sqrt(2 * 5 * Math.max(0, lim - .2)));
      const acc = c.kind === 'bike' ? 4.5 : c.kind === 'bus' || c.kind === 'truck' ? 2.2 : 3;
      const v0 = c.v;
      c.v = c.v < vt ? Math.min(vt, c.v + acc * dt) : Math.max(vt, c.v - 8 * dt);
      let mv = c.v * dt;
      if (lim < Infinity) mv = Math.min(mv, Math.max(0, lim));
      // 動いた結果ほかの車と重なるなら、この瞬間は動かない
      const before = [];
      for (const o of near) if (carsOverlap(c, o)) before.push(o);
      const s0 = c.s;
      c.s += mv; pose(c);
      if (c.s > c.len) for (const o of near) if (!before.includes(o) && carsOverlap(c, o)) { c.s = s0; c.v = 0; pose(c); break; }
      c.speed = c.v;
      // ブレーキランプ：はっきり減速したとき、止まっているとき
      if ((c.v - v0) / dt < -1.2) c.bt = .35; else c.bt -= dt;
      c.brake = c.bt > 0 || c.v < .3;
      // ウインカー：停止線30m手前から交差点を出るまで、約1.5Hz
      c.blink = (c.turn !== 0 && c.s > tp.stopS - 30 && c.s < tp.exitS && Math.floor(t * 3 + c.id * .37) % 2 === 0) ? c.turn : 0;
      // 安全弁：交差点の中で45秒以上止まったままの車は行き詰まりとみなして取り除く
      if (c.v < .05 && c.s > tp.stopS && c.s < tp.exitS) c.stuckT += dt; else c.stuckT = 0;
      if (c.stuckT > 45 && !roadPed(c.x + c.hx * (c.len / 2 + 2), c.y + c.hy * (c.len / 2 + 2), 2.5)) { c.gone = true; sim.dbg.removedCars++; }
    }
    // 街の端で消える
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      if (c.gone || Math.abs(c.x) > HALF + 5 || Math.abs(c.y) > HALF + 5) cars.splice(i, 1);
    }
  }

  /* 外から使う関数 */
  function substep(dt) {
    sim.t += dt;
    sigStep(dt);
    spawnAcc += P.rate / 60 * dt;
    while (spawnAcc >= 1) { spawnAcc -= 1; spawnPed(); }
    pedsStep(dt);
    carsStep(dt);
  }
  sim.step = function (dt) {
    if (!(dt > 0)) return;
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-9)), h = dt / n;
    for (let i = 0; i < n; i++) substep(h);
    let cr = 0;
    for (const p of peds) if (p.mode !== 'walk') cr++;
    let w = 0; for (const x of waits) w += x;
    sim.stats.people = peds.length; sim.stats.crossing = cr; sim.stats.avgWait = waits.length ? w / waits.length : 0;
  };
  sim.set = function (key, val) {
    if (!(key in P)) return;
    P[key] = +val;
    if (key === 'green') { ph = makePhases(); if (sigIdx === 8 && sigT > ph[8].dur) sigT = ph[8].dur - .01; }
  };
  sim.reset = function () {
    peds.length = 0; cars.length = 0; waits.length = 0;
    sim.t = 0; pedId = 0; carId = 0; spawnAcc = 0; sigIdx = 0; sigT = 0;
    for (const e of entries) { e.next = rand(0, 5); e.last = null; }
    for (const k in sim.dbg) sim.dbg[k] = 0;
    ph = makePhases(); updateSignal();
    sim.stats.people = sim.stats.crossing = sim.stats.avgWait = 0;
  };
  ph = makePhases(); updateSignal();
  return sim;
}

CS3.Sim = { create };
})();
