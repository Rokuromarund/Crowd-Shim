// 3D版の街のかたち（交差点1つ）。sim.js と world.js はここだけを見て形を決める。
// 座標はメートル。原点は交差点の中心、x は東、y は南、z は上（Three.js では (x, z, y) に置く）。
(() => {
'use strict';
const CS3 = window.CS3 = window.CS3 || {};

const HALF = 45;          // 街の半分の広さ（-45〜45）
const RW = 6;             // 道路の半分の幅（片側2車線）
const SW = 14;            // 歩道の外側（建物の壁）までの距離。歩道は |6|〜|14| の幅8m
const CURB_H = .15;       // 歩道の高さ
const LANES = [1.6, 4.4]; // 車線の中心：進む向きの左側へ、中央線からの距離（左側通行。1.6 は内側＝右折、4.4 は外側＝左折）
const STOP = 12.5;        // 停止線：中心からの距離
const CW0 = 7, CW1 = 11;  // 横断歩道：中心からの距離の範囲（幅4m）

// 進む向き：0 東へ、1 南へ、2 西へ、3 北へ
const HEAD = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const left = h => [h[1], -h[0]];  // 進む向きの左（左側通行で車がいる側）

// 4つの角の街区：sx, sy は角の向き（北西 -1,-1 / 北東 1,-1 / 南西 -1,1 / 南東 1,1）
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => ({
  i, sx, sy, name: ['北西', '北東', '南西', '南東'][i],
  // 建物：壁は |x|=14, |y|=14、街の端までのびる
  bld: { x0: sx < 0 ? -HALF : SW, x1: sx < 0 ? -SW : HALF, y0: sy < 0 ? -HALF : SW, y1: sy < 0 ? -SW : HALF },
  h: [22, 14, 10, 30][i],
  name2: ['オフィスビル', 'ホテル', 'カフェ', '駅'][i]
}));
// 人が歩けるところ（角ごとのL字の歩道）：|x|>=6 かつ |y|>=6、かつ建物の外
const onSidewalk = (x, y) => Math.abs(x) >= RW && Math.abs(y) >= RW && Math.abs(x) <= HALF && Math.abs(y) <= HALF && !(Math.abs(x) > SW && Math.abs(y) > SW);
const cornerOf = (x, y) => (y < 0 ? 0 : 2) + (x < 0 ? 0 : 1);

// 横断歩道：4本。arm は交差点のどの腕にあるか（0 東 1 南 2 西 3 北）。結ぶ2つの角と、範囲の長方形
const CROSSWALKS = [
  { arm: 0, a: 1, b: 3, rect: { x0: CW0, x1: CW1, y0: -RW, y1: RW } },
  { arm: 1, a: 2, b: 3, rect: { x0: -RW, x1: RW, y0: CW0, y1: CW1 } },
  { arm: 2, a: 0, b: 2, rect: { x0: -CW1, x1: -CW0, y0: -RW, y1: RW } },
  { arm: 3, a: 0, b: 1, rect: { x0: -RW, x1: RW, y0: -CW1, y1: -CW0 } }
];

// 街の外への出入口：歩道が街の端に出ているところ（8か所）。pt は端の中央、ax は端に沿う軸
const GATES = [];
for (const c of CORNERS) {
  GATES.push({ corner: c.i, x: c.sx * HALF, y: c.sy * (RW + SW) / 2, ax: 'y', lo: RW, hi: SW });   // 東西の道ぞいの歩道の端
  GATES.push({ corner: c.i, x: c.sx * (RW + SW) / 2, y: c.sy * HALF, ax: 'x', lo: RW, hi: SW });   // 南北の道ぞいの歩道の端
}
// 建物の入口：壁ごとに1つ（8か所）。壁から .6m 歩道がわに立つ点。nx, ny は壁から道へ向かう向き
const DOORS = [];
for (const c of CORNERS) {
  const m = (SW + HALF) / 2;
  DOORS.push({ corner: c.i, x: c.sx * m, y: c.sy * (SW - .6), nx: 0, ny: -c.sy });  // 東西の道に面した壁
  DOORS.push({ corner: c.i, x: c.sx * (SW - .6), y: c.sy * m, nx: -c.sx, ny: 0 });  // 南北の道に面した壁
}

// 車の入口：4方向×2車線。heading で進み、中心を通って向こう側へ
const ENTRIES = [];
for (let k = 0; k < 4; k++) for (const o of LANES) {
  const h = HEAD[k], L = left(h);
  ENTRIES.push({ k, lane: o, x: -h[0] * HALF + L[0] * o, y: -h[1] * HALF + L[1] * o });
}

// 信号柱：4つの角の歩道のふち。車の信号は向かい側（交差点の奥）から来る車に向け、歩行者信号は隣の2本の横断歩道の向こう岸に向ける
const POLES = CORNERS.map(c => ({ corner: c.i, x: c.sx * (RW + .6), y: c.sy * (RW + .6) }));

CS3.geom = { HALF, RW, SW, CURB_H, LANES, STOP, CW0, CW1, HEAD, left, CORNERS, CROSSWALKS, GATES, DOORS, ENTRIES, POLES, onSidewalk, cornerOf };
})();
