// 3D版の動かないもの：地面・道路の白線・横断歩道・歩道・建物・信号機・光と空。形は CS3.geom だけから作る。
// 座標：シミュレーション (x,y,z) → Three.js (x, z, y)。静的な形は素材ごとに1つの Mesh へ結合して描画コールを抑える。
(() => {
'use strict';
const CS3 = window.CS3 = window.CS3 || {};
const G = CS3.geom;
const { HALF, RW, SW, CURB_H, STOP, HEAD, left } = G;
const EXT = 50;                    // 街の外へ道・建物をのばす距離（霧でかくす）
const FAR = HALF + EXT;
const PI = Math.PI;

// 2D版 index.html のパレットに合わせる
const PAL = {
  asphalt: '#5A6270', sidewalk: '#C3C9D1', curb: '#A9B3BF', ground: '#98A3AF',
  paint: '#F3F5F7', yellow: '#E8B92C', tactile: '#E6B530', tdot: '#F4CF55',
  pole: '#8E98A5', housing: '#2A3038', roof: '#8C939C'
};
// 角ごとの建物の色（2D版 BLD_STYLE から）：壁・日よけ・入口の庇
const STYLE = [
  { col: '#9CB0C9', awn: '#4C6A8C' }, { col: '#C9B6A2', awn: '#8C4A3A' },
  { col: '#B4A9C6', awn: '#C9874A' }, { col: '#A6BAA3', awn: '#2E8B6A' }
];
const SIGN_TEXT = ['オフィスビル', 'ホテル', 'カフェ', '駅'];

const hash = (a, b, c) => { const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return s - Math.floor(s); };
const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, z, y);              // sim → three
const V = (x, y, z) => new THREE.Vector3(x, z, y);

// 向き n=(nx,ny)（sim のxy）に正面(+Z)を向けるローカル座標系。+X は正面から見た人の右、+Y は上
function frame(px, py, pz, nx, ny) {
  const m = new THREE.Matrix4();
  m.makeBasis(new THREE.Vector3(ny, 0, -nx), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, ny));
  m.setPosition(px, pz, py);
  return m;
}

// 人マーク（歩行者信号）：黒地に白抜き
function figureTex(walking) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.arc(32, 11, 6.5, 0, PI * 2); g.fill();
  g.lineWidth = 9; g.beginPath(); g.moveTo(32, 21); g.lineTo(32, 38); g.stroke();
  g.lineWidth = 5;
  g.beginPath();
  if (walking) {
    g.moveTo(32, 38); g.lineTo(43, 49); g.lineTo(44, 59);
    g.moveTo(32, 38); g.lineTo(22, 50); g.lineTo(18, 58);
    g.moveTo(32, 25); g.lineTo(42, 34); g.moveTo(32, 25); g.lineTo(22, 33);
  } else {
    g.moveTo(29, 38); g.lineTo(29, 58); g.moveTo(35, 38); g.lineTo(35, 58);
    g.moveTo(26, 24); g.lineTo(21, 40); g.moveTo(38, 24); g.lineTo(43, 40);
  }
  g.stroke();
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}

function create(scene) {
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);

  // ---------- 結合用バケツ ----------
  const SPEC = {};            // 名前 → { c: 頂点色あり, uv: UVあり }
  const BK = {};
  const spec = (name, o) => { SPEC[name] = o || {}; BK[name] = []; };
  spec('ground', { c: 1 }); spec('solid', { c: 1 }); spec('paint', { c: 1 });
  spec('winOn'); spec('winOff'); spec('door'); spec('lamp'); spec('sign', { uv: 1 });
  spec('pedR', { uv: 1 }); spec('pedG', { uv: 1 });
  for (const ax of ['ew', 'ns']) for (const k of ['g', 'y', 'r', 'a']) spec('car_' + ax + '_' + k);

  const _c = new THREE.Color();
  function push(name, g, m, cTop, cSide) {
    const sp = SPEC[name];
    if (m) g.applyMatrix4(m);
    if (g.index) g = g.toNonIndexed();
    if (!sp.uv) g.deleteAttribute('uv');
    if (sp.c) {
      const n = g.attributes.position.count, nor = g.attributes.normal.array, col = new Float32Array(n * 3);
      const top = _c.set(cTop).clone(), side = _c.set(cSide || cTop).clone();
      for (let i = 0; i < n; i++) { const k = nor[i * 3 + 1] > .5 ? top : side; col[i * 3] = k.r; col[i * 3 + 1] = k.g; col[i * 3 + 2] = k.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    BK[name].push(g);
  }
  function merge(list, name) {
    const sp = SPEC[name]; let n = 0;
    for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    const col = sp.c ? new Float32Array(n * 3) : null, uv = sp.uv ? new Float32Array(n * 2) : null;
    let o = 0;
    for (const g of list) {
      const k = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      if (col) col.set(g.attributes.color.array, o * 3);
      if (uv) uv.set(g.attributes.uv.array, o * 2);
      o += k; g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return out;
  }

  // ---------- 形のヘルパー（sim座標） ----------
  function sbox(name, x0, y0, z0, x1, y1, z1, cTop, cSide) {
    const g = new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0);
    push(name, g, T((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), cTop, cSide);
  }
  function flat(name, x0, y0, x1, y1, z, col) {
    const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0); g.rotateX(-PI / 2);
    push(name, g, T((x0 + x1) / 2, (y0 + y1) / 2, z), col);
  }
  // ローカル座標系 F での箱・板
  function lbox(name, F, cx, cy, cz, w, h, d, cTop, cSide, rotX) {
    const g = new THREE.BoxGeometry(w, h, d); if (rotX) g.rotateX(rotX);
    g.translate(cx, cy, cz); push(name, g, F, cTop, cSide);
  }
  function lplane(name, F, cx, cy, cz, w, h, uvr) {
    const g = new THREE.PlaneGeometry(w, h);
    if (uvr) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uvr[0] + uv.getY(i) * (uvr[1] - uvr[0])); }
    g.translate(cx, cy, cz); push(name, g, F);
  }
  function lcircle(name, F, cx, cy, cz, r) {
    const g = new THREE.CircleGeometry(r, 14); g.translate(cx, cy, cz); push(name, g, F);
  }
  const _up = new THREE.Vector3(0, 1, 0);
  function cyl(name, a, b, r, col, seg) {   // 3D点a→bの円柱
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg || 8);
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(_up, d.normalize()), new THREE.Vector3(1, 1, 1));
    push(name, g, m, col, col);
  }

  // ================= 地面・道路 =================
  // 遠景の地面（霧に溶ける）
  flat('ground', -700, -700, 700, 700, -.06, PAL.ground);
  // 道路（交差点＋4本の腕）。アスファルトは面だけ
  flat('ground', -RW, -RW, RW, RW, 0, PAL.asphalt);
  flat('ground', RW, -RW, FAR, RW, 0, PAL.asphalt);
  flat('ground', -FAR, -RW, -RW, RW, 0, PAL.asphalt);
  flat('ground', -RW, RW, RW, FAR, 0, PAL.asphalt);
  flat('ground', -RW, -FAR, RW, -RW, 0, PAL.asphalt);
  // 歩道（角ごと）：CURB_H の高さ。側面が縁石
  for (const c of G.CORNERS) {
    const xa = c.sx * RW, xb = c.sx * FAR, ya = c.sy * RW, yb = c.sy * FAR;
    sbox('ground', Math.min(xa, xb), Math.min(ya, yb), 0, Math.max(xa, xb), Math.max(ya, yb), CURB_H, PAL.sidewalk, PAL.curb);
  }

  // ================= 路面標示 =================
  const PZ = .012, PW = PAL.paint, PY = PAL.yellow;
  const strip = (x0, y0, x1, y1, col) => flat('paint', x0, y0, x1, y1, PZ, col || PW);
  // 横断歩道：縞は車の進む向きに平行、幅45cm・間隔45cm
  for (const cw of G.CROSSWALKS) {
    const r = cw.rect, dx = r.x1 - r.x0, dy = r.y1 - r.y0, alongY = dy > dx;   // 縞が並ぶ方向
    const L = alongY ? dy : dx, n = Math.floor((L - .45) / .9) + 1, s0 = (L - (n * .45 + (n - 1) * .45)) / 2;
    for (let i = 0; i < n; i++) {
      const a = s0 + i * .9;
      if (alongY) strip(r.x0, r.y0 + a, r.x1, r.y0 + a + .45); else strip(r.x0 + a, r.y0, r.x0 + a + .45, r.y1);
    }
    // 点字ブロック：歩道がわの縁に沿って幅60cm（黄色の板＋点）
    for (const sgn of [-1, 1]) {
      const e = sgn < 0 ? (alongY ? r.y0 : r.x0) : (alongY ? r.y1 : r.x1);
      const a0 = sgn < 0 ? e - .6 : e, a1 = a0 + .6, tz = CURB_H + .012;
      if (alongY) flat('paint', r.x0, a0, r.x1, a1, tz, PAL.tactile); else flat('paint', a0, r.y0, a1, r.y1, tz, PAL.tactile);
      const m = Math.round(L === dy ? dx / .3 : dy / .3);
      for (let i = 0; i < m; i++) for (let j = 0; j < 2; j++) {
        const u = (i + .5) * .3, v = a0 + .15 + j * .3;
        if (alongY) sbox('paint', r.x0 + u - .09, v - .09, tz, r.x0 + u + .09, v + .09, tz + .02, PAL.tdot);
        else sbox('paint', v - .09, r.y0 + u - .09, tz, v + .09, r.y0 + u + .09, tz + .02, PAL.tdot);
      }
    }
  }
  // 停止線・車線（白破線）・中央線（黄色の二重線）・外側線
  for (let k = 0; k < 4; k++) {
    const h = HEAD[k], Lf = left(h);
    // 進行方向 d（手前向きが負）、左への距離 o の長方形を描く
    const seg = (d0, d1, o0, o1, col) => {
      const xs = [h[0] * d0 + Lf[0] * o0, h[0] * d1 + Lf[0] * o1], ys = [h[1] * d0 + Lf[1] * o0, h[1] * d1 + Lf[1] * o1];
      strip(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), col);
    };
    seg(-STOP - .22, -STOP + .22, .15, RW - .15);                   // 停止線（進入側の車線だけ）
    for (const sgn of [-1, 1]) {                                     // 進入側・退出側
      const d0 = sgn < 0 ? -FAR : STOP + 1, d1 = sgn < 0 ? -STOP - 1.2 : FAR;
      for (let d = d0; d < d1; d += 6) seg(d, Math.min(d + 3, d1), 3 - .075, 3 + .075);          // 同方向2車線のあいだ
      seg(d0, d1, RW - .3 - .06, RW - .3 + .06);                                                 // 外側線
    }
  }
  for (let k = 0; k < 2; k++) {                                      // 中央線（東西・南北）
    const h = HEAD[k], Lf = left(h);
    for (const sgn of [-1, 1]) for (const o of [-.1, .1]) {
      const d0 = sgn < 0 ? -FAR : STOP + .8, d1 = sgn < 0 ? -STOP - .8 : FAR;
      const xs = [h[0] * d0 + Lf[0] * (o - .04), h[0] * d1 + Lf[0] * (o + .04)], ys = [h[1] * d0 + Lf[1] * (o - .04), h[1] * d1 + Lf[1] * (o + .04)];
      strip(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), PY);
    }
  }

  // ================= 建物 =================
  // 看板用アトラス（4行）
  const sc = document.createElement('canvas'); sc.width = 512; sc.height = 4 * 64;
  { const g = sc.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
    SIGN_TEXT.forEach((t, i) => {
      g.fillStyle = i === 3 ? '#1E5F4A' : '#262E3A'; g.fillRect(0, i * 64, 512, 64);
      g.strokeStyle = '#E8B92C'; g.lineWidth = 4; g.strokeRect(4, i * 64 + 4, 504, 56);
      g.fillStyle = '#F3F5F7'; g.font = '700 40px "Zen Kaku Gothic New","Noto Sans JP","Noto Sans CJK JP",sans-serif'; g.fillText(t, 256, i * 64 + 34);
    }); }
  const signTex = new THREE.CanvasTexture(sc); signTex.anisotropy = 4;

  for (const c of G.CORNERS) {
    const st = STYLE[c.i], h = c.h, sx = c.sx, sy = c.sy;
    const b = c.bld, x0 = b.x0, x1 = b.x1, y0 = b.y0, y1 = b.y1;
    sbox('solid', x0, y0, 0, x1, y1, h, PAL.roof, st.col);
    // 屋上：パラペット・室外機・タンク
    const pc = '#7D858F';
    sbox('solid', x0, y0, h, x1, y0 + .35, h + .6, pc); sbox('solid', x0, y1 - .35, h, x1, y1, h + .6, pc);
    sbox('solid', x0, y0, h, x0 + .35, y1, h + .6, pc); sbox('solid', x1 - .35, y0, h, x1, y1, h + .6, pc);
    for (let i = 0; i < 7; i++) {
      const w = 2 + hash(i, c.i, 1) * 3, d = 2 + hash(i, c.i, 2) * 3, hh = .8 + hash(i, c.i, 3) * 1.6;
      const ux = Math.min(x0, x1) + 3 + hash(i, c.i, 4) * (Math.abs(x1 - x0) - 6 - w), uy = Math.min(y0, y1) + 3 + hash(i, c.i, 5) * (Math.abs(y1 - y0) - 6 - d);
      if (hash(i, c.i, 6) > .7) { cyl('solid', V(ux + 1, uy + 1, h + .6), V(ux + 1, uy + 1, h + 2.6), 1.1, '#9AA3AD', 10); }
      else sbox('solid', ux, uy, h + .6, ux + w, uy + d, h + .6 + hh, '#B7BFC8', '#A1A9B3');
    }
    // 街路に面した2面（壁は |x|=SW, |y|=SW）。facade ごとに 窓・店先・看板
    const faces = [
      { n: [0, -sy], wall: u => [sx * (SW + u), sy * SW], along: [sx, 0] },
      { n: [-sx, 0], wall: u => [sx * SW, sy * (SW + u)], along: [0, sy] }
    ];
    faces.forEach((f, fi) => {
      const len = HALF - SW, X = [f.n[1], -f.n[0]], ax = X[0] * f.along[0] + X[1] * f.along[1];   // 壁の沿い方向 → ローカルx
      const F0 = (u) => { const w = f.wall(u); return frame(w[0], w[1], CURB_H, f.n[0], f.n[1]); };
      const Fz = F0(0), hh = h - CURB_H;
      // 店先の暗いガラス
      lplane('winOff', Fz, ax * len / 2, 1.4, .02, len, 2.2);
      // 窓の格子
      for (let u = 1.6; u + 1.4 < len - .5; u += 2.4) for (let z = 3.4; z + 1.7 <= hh - 1.9; z += 3) {
        lplane(hash(u, z, c.i * 3 + fi) > .5 ? 'winOn' : 'winOff', Fz, ax * (u + .7), z + .85, .03, 1.4, 1.7);
      }
      // 看板（交差点に近いところ）
      lplane('sign', Fz, ax * 8, hh - 1.0, .06, 7, 1.25, [1 - (c.i + 1) / 4 + .004, 1 - c.i / 4 - .004]);
    });
    // 入口：戸・枠・庇
    for (const d of G.DOORS) {
      if (d.corner !== c.i) continue;
      const wx = d.x - d.nx * .6, wy = d.y - d.ny * .6, F = frame(wx, wy, CURB_H, d.nx, d.ny);
      lplane('door', F, 0, 1.15, .045, 1.9, 2.3);
      const fc = '#4A5360';
      lbox('solid', F, -1.0, 1.2, .07, .14, 2.4, .14, fc); lbox('solid', F, 1.0, 1.2, .07, .14, 2.4, .14, fc);
      lbox('solid', F, 0, 2.45, .07, 2.14, .14, .14, fc);
      lbox('solid', F, 0, 2.95, .75, 3.4, .1, 1.6, st.awn, st.awn, .22);       // 庇（手前が下がる）
      lbox('solid', F, -1.65, 2.8, .75, .06, .45, 1.5, st.awn, st.awn);
      lbox('solid', F, 1.65, 2.8, .75, .06, .45, 1.5, st.awn, st.awn);
    }
  }

  // ================= 街灯 =================
  const LAMPS = [[-6.6, -17, 1], [6.6, -17, 0], [17, -6.6, 1], [17, 6.6, 0], [6.6, 17, 1], [-6.6, 17, 0], [-17, 6.6, 1], [-17, -6.6, 0]];
  const lampLights = [];
  for (const [px, py, lit] of LAMPS) {
    const ax = Math.abs(px) < Math.abs(py) ? [-Math.sign(px), 0] : [0, -Math.sign(py)];     // 道へのびる向き
    cyl('solid', V(px, py, CURB_H), V(px, py, 7), .07, '#6C7580', 8);
    sbox('solid', px - .18, py - .18, CURB_H, px + .18, py + .18, CURB_H + .5, '#6C7580');
    const ex = px + ax[0] * 1.9, ey = py + ax[1] * 1.9;
    cyl('solid', V(px, py, 7), V(ex, ey, 7.05), .05, '#6C7580', 6);
    const g = new THREE.BoxGeometry(ax[0] ? .8 : .35, .14, ax[0] ? .35 : .8); g.translate(ex, 6.95, ey); push('lamp', g);
    if (lit) lampLights.push(V(ex, ey, 6.6));
  }

  // ================= 信号機 =================
  // 信号柱 c は、交差点の向こう側（柱が進行方向の先にある）に立つ。柱の角 s に対し、h·s>0 かつ left(h)·s>0 となる向き h の車を担当する
  G.POLES.forEach(p => {
    const c = G.CORNERS[p.corner], s = [c.sx, c.sy];
    let k = 0;
    for (let i = 0; i < 4; i++) { const h = HEAD[i], L = left(h); if (h[0] * s[0] + h[1] * s[1] > 0 && L[0] * s[0] + L[1] * s[1] > 0) k = i; }
    const h = HEAD[k], L = left(h), axis = k % 2 === 0 ? 'ew' : 'ns', px = p.x, py = p.y;
    // 柱とアーム
    cyl('solid', V(px, py, CURB_H), V(px, py, 6), .1, PAL.pole, 10);
    cyl('solid', V(px, py, CURB_H), V(px, py, CURB_H + .6), .16, PAL.pole, 10);
    const a1 = V(px - L[0] * 4.3, py - L[1] * 4.3, 5.75);
    cyl('solid', V(px, py, 5.75), a1, .065, PAL.pole, 8);
    // 横型3灯：アームの先（車線の中ほど）、進んでくる車へ向ける（法線 = -h）
    const hx = px - L[0] * 3.6, hy = py - L[1] * 3.6, n = [-h[0], -h[1]];
    const F = frame(hx, hy, 5.3, n[0], n[1]);
    cyl('solid', V(hx, hy, 5.75), V(hx, hy, 5.5), .04, PAL.housing, 6);
    lbox('solid', F, 0, 0, 0, 1.3, .44, .3, PAL.housing);
    [['g', -.4], ['y', 0], ['r', .4]].forEach(([key, x]) => {                       // 正面から見て左から 青・黄・赤
      lcircle('car_' + axis + '_' + key, F, x, 0, .158, .15);
      lbox('solid', F, x, .2, .22, .34, .03, .2, PAL.housing);                       // ひさし
    });
    lbox('solid', F, .4, -.42, 0, .5, .4, .3, PAL.housing);                           // 右折矢印の箱
    { const sh = new THREE.Shape(); [[-.12, -.035], [.02, -.035], [.02, -.1], [.14, 0], [.02, .1], [.02, .035], [-.12, .035]].forEach((q, i) => i ? sh.lineTo(q[0], q[1]) : sh.moveTo(q[0], q[1]));
      const g = new THREE.ShapeGeometry(sh); g.translate(.4, -.42, .158); push('car_' + axis + '_a', g, F); }
    lbox('solid', F, .4, -.2, .22, .5, .03, .2, PAL.housing);

    // 歩行者信号：隣の2本の横断歩道の向こう岸へ向ける
    [[[0, -s[1]], [s[0] * .38, 0]], [[-s[0], 0], [0, s[1] * .38]]].forEach(([nn, off]) => {
      const PF = frame(px + off[0], py + off[1], 2.7, nn[0], nn[1]);
      lbox('solid', PF, 0, 0, 0, .52, 1.05, .22, PAL.housing);
      lbox('solid', PF, 0, .3, .12, .46, .03, .14, PAL.housing);
      lbox('solid', PF, 0, -.2, .12, .46, .03, .14, PAL.housing);
      lplane('pedR', PF, 0, .26, .115, .38, .38); lplane('pedG', PF, 0, -.24, .115, .38, .38);
    });
  });

  // ================= Mesh 化 =================
  const mats = {};
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  const po = (f) => ({ polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f });
  mats.ground = lam({ vertexColors: true });
  mats.solid = lam({ vertexColors: true });
  mats.paint = lam(Object.assign({ vertexColors: true }, po(-2)));
  mats.winOn = lam(Object.assign({ color: '#90AACA' }, po(-1)));
  mats.winOff = lam(Object.assign({ color: '#7F98B4' }, po(-1)));
  mats.door = lam(Object.assign({ color: '#3C4A5C' }, po(-3)));
  mats.sign = lam(Object.assign({ map: signTex, emissiveMap: signTex, emissive: '#000' }, po(-2)));
  mats.lamp = new THREE.MeshBasicMaterial({ color: '#D8DCE0' });
  const figR = figureTex(false), figG = figureTex(true);
  const basic = (o) => new THREE.MeshBasicMaterial(Object.assign({}, po(-3), o));
  mats.pedR = basic({ map: figR, color: '#331212' });
  mats.pedG = basic({ map: figG, color: '#0f2a22' });
  const carMat = {};
  for (const ax of ['ew', 'ns']) for (const k of ['g', 'y', 'r', 'a']) mats['car_' + ax + '_' + k] = carMat[ax + k] = basic({ color: '#222' });

  const meshes = [];
  const flags = { ground: [0, 1], solid: [1, 1] };      // [castShadow, receiveShadow]
  flags.paint = [0, 1];
  for (const name of Object.keys(BK)) {
    const m = new THREE.Mesh(merge(BK[name], name), mats[name]);
    m.name = 'world_' + name;
    const f = flags[name] || [0, 0];
    m.userData.cast = !!f[0]; m.userData.recv = !!f[1];
    m.castShadow = !!f[0]; m.receiveShadow = !!f[1];
    root.add(m); meshes.push(m);
  }

  // ================= 光 =================
  const hemi = new THREE.HemisphereLight('#CFE3F7', '#8F8A80', .55); root.add(hemi);
  const sun = new THREE.DirectionalLight('#FFF3DC', .8);
  sun.position.set(38, 62, 26); sun.target.position.set(0, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  { const s = sun.shadow.camera, e = HALF * 1.2; s.left = -e; s.right = e; s.top = e; s.bottom = -e; s.near = 10; s.far = 180; }
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .06;
  root.add(sun); root.add(sun.target);
  const plights = lampLights.map(p => { const l = new THREE.PointLight('#FFCF8A', 0, 34, 1.4); l.position.copy(p); root.add(l); return l; });

  scene.background = new THREE.Color('#BCD0E4');
  scene.fog = new THREE.Fog('#BCD0E4', 130, 360);

  // ================= 状態 =================
  const CAR_ON = { g: '#12E8AE', y: '#FFC21A', r: '#FF2D2D', a: '#12E8AE' };
  const CAR_OFF = { g: '#0B2420', y: '#2A2208', r: '#2A1010', a: '#0B2420' };
  let last = null, night = false, shadows = true;

  function apply() {
    if (!last) return;
    for (const ax of ['ew', 'ns']) {
      const s = last.car && last.car[ax];
      const on = { g: s === 'g', y: s === 'y', r: s === 'r' || s === 'a', a: s === 'a' };
      for (const k of ['g', 'y', 'r', 'a']) carMat[ax + k].color.set(on[k] ? CAR_ON[k] : CAR_OFF[k]);
    }
    const p = last.ped, blink = (performance.now() / 1000 * 2.5) % 1 < .5;
    mats.pedR.color.set(p === 'stop' ? '#FF3B30' : '#331212');
    mats.pedG.color.set(p === 'go' || (p === 'flash' && blink) ? '#18F0A0' : '#0f2a22');
  }
  function setNightMats() {
    const n = night;
    mats.winOn.color.set(n ? '#3A3322' : '#90AACA'); mats.winOn.emissive.set(n ? '#E8BC62' : '#000000');
    mats.winOff.color.set(n ? '#1B222D' : '#7F98B4');
    mats.door.emissive.set(n ? '#B89448' : '#000000');
    mats.sign.emissive.set(n ? '#B0B0B0' : '#000000');
    mats.lamp.color.set(n ? '#FFEBB0' : '#D8DCE0');
  }

  const world = {
    group: root, sun, hemi,
    setSignals(sig) { last = sig; apply(); },
    update(t) { apply(); },
    setNight(b) {
      night = !!b;
      const bg = night ? '#0E1522' : '#BCD0E4';
      scene.background.set(bg); scene.fog.color.set(bg); scene.fog.near = night ? 80 : 130; scene.fog.far = night ? 280 : 360;
      hemi.color.set(night ? '#3A4C7A' : '#CFE3F7'); hemi.groundColor.set(night ? '#1B1D26' : '#8F8A80'); hemi.intensity = night ? .6 : .55;
      sun.color.set(night ? '#8FA8E0' : '#FFF3DC'); sun.intensity = night ? .4 : .8;
      if (night) sun.position.set(-30, 55, -26); else sun.position.set(38, 62, 26);
      plights.forEach(l => { l.intensity = night ? 1.5 : 0; });
      setNightMats();
    },
    setShadows(b) {
      shadows = !!b; sun.castShadow = shadows;
      for (const m of meshes) { m.castShadow = shadows && m.userData.cast; m.receiveShadow = shadows && m.userData.recv; m.material.needsUpdate = true; }
    }
  };
  setNightMats();
  return world;
}

CS3.World = { create };
})();
