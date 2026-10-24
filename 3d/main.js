// 3D版のメイン：レンダラー・カメラ・操作・HUD・ループをつなぐ
(() => {
'use strict';
const $ = id => document.getElementById(id);
const root = document.documentElement;
const CS3 = window.CS3 || {};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* ---------- エラー表示（WebGLなし・読み込み失敗・コンテキスト喪失） ---------- */
function showMsg(title, text, opt) {
  $('msgT').textContent = title;
  $('msgP').textContent = text;
  $('msgA').hidden = !!(opt && opt.noLink);
  $('msg').hidden = false;
}

if (!(window.THREE && THREE.OrbitControls && CS3.geom && CS3.Sim && CS3.World && CS3.Actors)) {
  showMsg('読み込めませんでした', '3D版に必要なファイルの読み込みに失敗しました。ページを開き直すか、2D版をお使いください。');
  return;
}
const G = CS3.geom, HALF = G.HALF;

/* ---------- レンダラー ---------- */
const cv = $('cv'), app = $('app');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
} catch (e) { renderer = null; }
if (!renderer) {
  showMsg('3D表示を始められません', 'このブラウザでは WebGL が使えないようです。ブラウザを更新するか、2D版をお使いください。');
  return;
}
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputEncoding = THREE.LinearEncoding;   // world.js・actors.js の色はこの前提で合わせてある（sRGB にすると白っぽく飛ぶ）
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

cv.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  lost = true;
  showMsg('描画が中断されました', '画面の描画が一時的に止まりました。しばらく待つと戻ることがあります。戻らないときはページを開き直してください。', { noLink: false });
});
cv.addEventListener('webglcontextrestored', () => { lost = false; $('msg').hidden = true; });
let lost = false;

/* ---------- シーン・カメラ・操作 ---------- */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, .1, 700);
const controls = new THREE.OrbitControls(camera, cv);
controls.enableDamping = true;
controls.dampingFactor = .08;
controls.screenSpacePanning = false;       // 移動は地面に沿って
controls.maxPolarAngle = THREE.MathUtils.degToRad(88);  // 地面の下にもぐらない
controls.minDistance = 6;
controls.maxDistance = 180;
controls.rotateSpeed = .7;

const sim = CS3.Sim.create({ rate: 120, green: 20, bike: 8, carRate: 1 });
const world = CS3.World.create(scene);
const actors = CS3.Actors.create(scene, { maxPeds: 800, maxCars: 80 });

/* ---------- 選択マーカー（actors.highlight がなくても分かるように） ---------- */
const ring = new THREE.Mesh(
  new THREE.RingGeometry(.5, .72, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xFFC23D, transparent: true, opacity: .95, depthTest: false })
);
ring.renderOrder = 999;
ring.visible = false;
scene.add(ring);

/* ---------- 状態 ---------- */
const VIEWS = ['oblique', 'top', 'eye'];
const VIEW_NAME = { oblique: '斜め上', top: '真上', eye: '人の目線' };
let view = 'oblique';
let speedI = 0;
const SPEEDS = [1, 2, 4];
let paused = false, night = false, shadows = innerWidth > 600;
let sel = null, selId = -1, selT0 = 0;   // 選択中の人
let tween = null;                        // {t, dur, p0, p1, g0, g1}
const eh = { x: 1, y: 0 };               // 追跡カメラ用になめした向き
const tmpV = new THREE.Vector3();
const lookV = new THREE.Vector3();

// 画面の縦長さに応じて引きの距離を変える
function fit() {
  const a = innerWidth / Math.max(1, innerHeight);
  return a < 1 ? Math.min(1.8, Math.pow(1 / a, .8)) : 1;
}
function followPoint(p) {
  return new THREE.Vector3(clamp(p.x, -HALF, HALF), .6, clamp(p.y, -HALF, HALF));
}

// 視点プリセットの行き先 {p: カメラ位置, g: 注視点}
function presetPose(v) {
  const k = fit();
  const g = sel ? followPoint(sel) : new THREE.Vector3(0, 0, 0);
  if (v === 'top') return { p: g.clone().add(new THREE.Vector3(.01, 100 * k, .5 * k)), g };
  // 斜め上：北東から見下ろす（南東の駅は30mで視界をふさぐので、低い北東側）
  // 縦長の画面では手前の建物の屋根が下半分をふさぐので、見下ろす角度を約45°から約60°に上げる
  if (v === 'oblique') { const d = 75 * k, hz = camera.aspect < 1 ? .35 : .5, vt = camera.aspect < 1 ? .87 : .71; return { p: g.clone().add(new THREE.Vector3(d * hz, d * vt, -d * hz)), g }; }
  // 人の目線（選択なし）：横断歩道そばの角の地面から交差点を見る
  return { p: new THREE.Vector3(9.5, 1.8, 9.5), g: new THREE.Vector3(-1, 1.2, -1) };
}
function startTween(pose, dur) {
  tween = { t: 0, dur: dur || .6, p0: camera.position.clone(), g0: controls.target.clone(), p1: pose.p, g1: pose.g };
}
function applyView(instant) {
  const chase = view === 'eye' && sel;
  controls.enabled = !chase;
  if (chase) { tween = null; const p = sel; eh.x = p.hx; eh.y = p.hy; return; }
  const pose = presetPose(view);
  if (instant) { camera.position.copy(pose.p); controls.target.copy(pose.g); tween = null; controls.update(); }
  else startTween(pose);
}

/* ---------- 選択 ---------- */
function select(p) {
  sel = p || null;
  selId = p ? p.id : -1;
  selT0 = sim.t;
  if (typeof actors.highlight === 'function') actors.highlight(sel);
  ring.visible = !!sel && typeof actors.highlight !== 'function';   // actors 側に目印があればそちらを使う
  $('info').hidden = !sel;
  if (view === 'eye') applyView();   // 追跡⇄地上定点を切り替える
  updateHud(true);
}
function findSel() {
  if (!sel) return;
  if (sim.peds.indexOf(sel) >= 0 && sel.id === selId) return;
  for (const p of sim.peds) if (p.id === selId) { sel = p; return; }
  select(null);   // 目的地に着いて消えた
}

/* ---------- タップ（ドラッグでないとき）で選ぶ ---------- */
const ray = new THREE.Raycaster();
const ptrs = new Map();
let tap = null;
cv.addEventListener('pointerdown', e => {
  ptrs.set(e.pointerId, 1);
  tap = ptrs.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null;
});
cv.addEventListener('pointermove', e => {
  if (tap && e.pointerId === tap.id && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) >= 8) tap = null;
});
cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); tap = null; });
cv.addEventListener('pointerup', e => {
  ptrs.delete(e.pointerId);
  const t = tap; tap = null;
  if (!t || e.pointerId !== t.id) return;
  if (Math.hypot(e.clientX - t.x, e.clientY - t.y) >= 8 || performance.now() - t.t >= 500) return;
  const r = cv.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1)), camera);
  const hit = actors.pick(ray);
  select(hit || null);
});

/* ---------- ボタン・設定 ---------- */
function setView(v) {
  view = v;
  $('btnView').textContent = '視点 ' + VIEW_NAME[v];
  applyView();
}
$('btnView').onclick = () => setView(VIEWS[(VIEWS.indexOf(view) + 1) % 3]);
$('btnPause').onclick = () => { paused = !paused; $('btnPause').setAttribute('aria-pressed', paused); $('btnPause').textContent = paused ? '再開' : '一時停止'; };
$('btnSpeed').onclick = () => { speedI = (speedI + 1) % 3; $('btnSpeed').textContent = '速さ ×' + SPEEDS[speedI]; };
function setNight(n) {
  night = n;
  root.setAttribute('data-theme', n ? 'dark' : 'light');
  $('btnNight').textContent = n ? '夜' : '昼';
  $('btnNight').setAttribute('aria-pressed', n);
  world.setNight(n); actors.setNight(n);
}
$('btnNight').onclick = () => setNight(!night);
$('btnSheet').onclick = () => {
  const open = $('sheet').hidden;
  $('sheet').hidden = !open;
  $('btnSheet').setAttribute('aria-pressed', open);
};
$('infoClose').onclick = () => select(null);
const statsEl = $('stats');
function toggleStats() {
  const o = statsEl.classList.toggle('open');
  statsEl.setAttribute('aria-expanded', o);
  $('stMore').textContent = o ? 'たたむ ▴' : 'ほか1件 ▾';
}
statsEl.addEventListener('click', toggleStats);
statsEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleStats(); } });

function bindRange(id, out, key, fmt) {
  const el = $(id), o = $(out);
  const f = () => { o.textContent = fmt(+el.value); sim.set(key, +el.value); };
  el.addEventListener('input', f); f();
}
bindRange('inRate', 'oRate', 'rate', v => v + '人/分');
bindRange('inGreen', 'oGreen', 'green', v => v + '秒');
bindRange('inBike', 'oBike', 'bike', v => v + '%');
bindRange('inCar', 'oCar', 'carRate', v => '×' + v.toFixed(1));

function setShadows(on) {
  shadows = on;
  if (typeof world.setShadows === 'function') world.setShadows(on);
  else scene.traverse(o => { if (o.isLight && o.shadow) { if (o.userData.cs0 === undefined) o.userData.cs0 = o.castShadow; o.castShadow = on && o.userData.cs0; } });
  if (typeof actors.setShadows === 'function') actors.setShadows(on);
  for (const b of $('segShadow').children) b.setAttribute('aria-pressed', (b.dataset.v === '1') === on);
}
for (const b of $('segShadow').children) b.onclick = () => setShadows(b.dataset.v === '1');

/* ---------- 画面サイズ ---------- */
function resize() {
  const w = Math.max(1, app.clientWidth), h = Math.max(1, app.clientHeight);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(app);

/* ---------- HUD（1秒に4回ほど） ---------- */
const SIG = { go: ['青', 'go'], flash: ['青の点滅', 'flash'], stop: ['赤', 'stop'] };
const ST = { walk: '歩いている', wait: '信号待ち', cross: '横断中' };
function updateHud(force) {
  const s = sim.signal, k = SIG[s.ped] || ['―', ''];
  $('sigDot').className = 'dot ' + k[1];
  $('sigText').textContent = k[0] + ' ' + Math.ceil(s.rem) + '秒';
  const st = sim.stats;
  $('stN').textContent = st.people + '人';
  $('stX').textContent = st.crossing + '人';
  $('stW').textContent = Math.round(st.avgWait) + '秒';
  if (sel) {
    $('infoTitle').textContent = sel.bike ? '自転車の人' : 'この人';
    $('infoRoute').textContent = (sel.from || '?') + ' → ' + (sel.to || '?');
    $('infoState').textContent = ST[sel.st] || sel.st;
    $('infoSpeed').textContent = sel.speed.toFixed(1) + ' m/s';
    $('infoTime').textContent = Math.max(0, Math.round(sim.t - selT0)) + '秒';
  }
}

/* ---------- 毎フレームのカメラ ---------- */
function updateCamera(dt) {
  if (tween) {
    tween.t += dt;
    const k = ease(Math.min(1, tween.t / tween.dur));
    camera.position.lerpVectors(tween.p0, tween.p1, k);
    controls.target.lerpVectors(tween.g0, tween.g1, k);
    if (tween.t >= tween.dur) tween = null;
  } else if (sel && view !== 'eye') {
    // 斜め上・真上：注視点を選んだ人へそっと寄せる
    const d = followPoint(sel).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 3));
    controls.target.add(d); camera.position.add(d);
  }
  if (view === 'eye' && sel) {
    // 肩ごしの追跡カメラ：向きをなめらかに追う
    const a = 1 - Math.exp(-dt * 3);
    eh.x += (sel.hx - eh.x) * a; eh.y += (sel.hy - eh.y) * a;
    const l = Math.hypot(eh.x, eh.y) || 1, hx = eh.x / l, hy = eh.y / l;
    const back = sel.bike ? 3.4 : 2.6, side = .35;
    tmpV.set(sel.x - hx * back - hy * side, 1.6, sel.y - hy * back + hx * side);
    lookV.set(sel.x + hx * 6, 1.2, sel.y + hy * 6);
    const b = 1 - Math.exp(-dt * 5);
    camera.position.lerp(tmpV, b);
    controls.target.lerp(lookV, b);
    camera.lookAt(controls.target);
  } else {
    controls.update();
    // 街の外へ出ない／注視点が地面の下に行かない
    const t = controls.target, cx = clamp(t.x, -HALF, HALF), cz = clamp(t.z, -HALF, HALF), cy = clamp(t.y, 0, 3);
    if (cx !== t.x || cz !== t.z || cy !== t.y) { camera.position.add(tmpV.set(cx - t.x, cy - t.y, cz - t.z)); t.set(cx, cy, cz); }
  }
}

/* ---------- ループ ---------- */
const STEP = 1 / 30;
let acc = 0, last = performance.now(), hudT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (lost) return;
  const dt = Math.min(.1, (now - last) / 1000);
  last = now;
  let simDt = 0;
  if (!paused) {
    acc += dt * SPEEDS[speedI];
    let n = 0;
    while (acc >= STEP && n < 8) { sim.step(STEP); acc -= STEP; simDt += STEP; n++; }
    if (n === 8) acc = 0;
  }
  findSel();
  actors.update(sim, simDt);
  world.setSignals(sim.signal);
  world.update(sim.t);
  if (sel && ring.visible) {
    ring.position.set(sel.x, .25, sel.y);
    ring.scale.setScalar(clamp(camera.position.distanceTo(ring.position) / 22, 1, 4));
  }
  updateCamera(dt);
  hudT += dt;
  if (hudT > .25) { hudT = 0; updateHud(); }
  renderer.render(scene, camera);
}

/* ---------- 起動 ---------- */
resize();
setShadows(shadows);
world.setNight(false); actors.setNight(false);
applyView(true);
updateHud(true);
requestAnimationFrame(frame);

// 動作確認用（コンソールやテストから触れる）
window.CS3.app = { sim, world, actors, camera, controls, scene, renderer, select, setView, setNight, get view() { return view; }, get sel() { return sel; } };
})();
