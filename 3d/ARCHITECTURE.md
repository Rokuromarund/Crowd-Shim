# 3D版 群衆シミュレーター（交差点1つ）構成

2D版（`../index.html`）とは別に、Three.js（r128、`lib/` に同梱）で作る本物の3D版。
まずは交差点1つで、街の動き（人・自転車・車・信号）を3Dで見られるようにする。

## ファイルと担当

すべて通常の `<script>`（ES モジュールではない）で、`window.CS3` に載せる。`file://` で開いても動くようにするため。

| ファイル | 中身 | THREE を使うか |
|---|---|---|
| `index.html` | ページ、HUD・ツールバーの HTML/CSS、スクリプトの読み込み順 | ― |
| `lib/three.min.js`, `lib/OrbitControls.js` | Three.js r128（同梱、MIT） | ― |
| `geom.js` | 街のかたち（道路・歩道・建物・横断歩道・停止線・入口・信号柱の位置）。**唯一の正本** | 使わない |
| `sim.js` | 動きの計算（人・自転車・車・信号）。描画とは無関係 | 使わない |
| `world.js` | 動かないもの（地面・道路・白線・横断歩道・歩道・建物・信号機）と光・空 | 使う |
| `actors.js` | 動くもの（人・自転車・車）を InstancedMesh で描く | 使う |
| `main.js` | レンダラー・カメラ・操作・HUD・ループ。全部をつなぐ | 使う |

読み込み順：`three.min.js` → `OrbitControls.js` → `geom.js` → `sim.js` → `world.js` → `actors.js` → `main.js`

スマホでダウンロードして開く用に、全部を1ファイルにまとめた `../3d.html` を置いている。
3d/ の中を直したら `node 3d/build.js` で作り直す（3d.html は手で直さない）。

## 座標

- シミュレーションは **メートル**。原点は交差点の中心、**x は東、y は南、z は上**（2D版と同じ）。
- Three.js では **`(x, z, y)`** に置く（Three の x = 東、Three の y = 上、Three の z = 南）。右手系のまま、鏡写しにならない。
- 向き `(hx, hy)`（単位ベクトル）を Three の Y 軸まわりの回転にするには **`yaw = Math.atan2(-hy, hx)`**。モデルは +x 向きを正面に作る。
- 左側通行。車線は進む向きの左側（`geom.left(h)`）、中央線から 1.6 m（内側・右折）と 4.4 m（外側・左折）。

## sim.js の約束（`CS3.Sim`）

```js
const sim = CS3.Sim.create({ rate: 120, green: 20, bike: 8, carRate: 1 }); // rate: 人/分、green: 歩行者の青（秒）、bike: 自転車の割合（%）、carRate: 車の量の倍率
sim.step(dt);          // dt 秒（1/30 前後）。中で必要なら細かく刻む
sim.set(key, value);   // rate / green / bike / carRate をあとから変える
sim.reset();
```

毎ステップ、次のオブジェクトを **同じ配列・同じオブジェクトを使い回して** 更新する（描画側が参照を持ってよい）。

```js
sim.t                       // 経過秒
sim.peds  : [{
  id, x, y,                 // 足もとの位置（m）
  hx, hy,                   // 体の向き（単位ベクトル。止まっていれば最後の向き）
  speed,                    // いまの速さ m/s
  phase,                    // 歩き・こぎの位相（ラジアン、進んだ距離に比例して増える）
  bike,                     // true なら自転車に乗っている
  cl, pt, sk, hr,           // 上着・ズボン・肌・髪の色（'#RRGGBB'）
  bc, hm,                   // 自転車のフレームの色、ヘルメットの色（なければ null）
  st,                       // 'walk' | 'wait' | 'cross'（表示用）
  from, to                  // 出発地・目的地の名前（表示用）
}]
sim.cars  : [{
  id, kind,                 // 'car' | 'kei' | 'van' | 'taxi' | 'truck' | 'police' | 'bus' | 'bike'（バイク）
  x, y, hx, hy,             // 車体の中心と向き
  len, w, col,              // 長さ・幅（m）・車体の色
  speed,
  turn,                     // -1 左折 / 0 直進 / 1 右折（この交差点で）
  blink,                    // ウインカーがいま点いている側：-1 左 / 1 右 / 0 消灯（点滅込み。停止線30m手前から曲がり終えるまで、約1.5Hz）
  brake,                    // ブレーキランプ
  rider                     // バイクのときだけ { cl, pt, sk, helm }
}]
sim.signal: {
  car: { ew, ns },          // 'g' | 'y' | 'r' | 'a'（右折の矢印だけ青）。ew は東西に走る車、ns は南北
  ped,                      // 'go' | 'flash' | 'stop'（4本の横断歩道は同時。歩車分離式）
  rem                       // 歩行者信号がいまの状態でいる残り秒
}
sim.stats : { people, crossing, avgWait }
```

- 信号の順番（2D版と同じ）：東西 青15 → 黄3 → 右折矢印5 → 全赤2 → 南北 同じ → 歩行者 青 `green` 秒 → 点滅5 → 全赤3。
- 人：入口（`geom.GATES`・`geom.DOORS`）に現れ、別の入口へ。角の歩道を歩き、必要なら横断歩道を1本か2本渡る（斜めには渡らない）。青のときだけ渡り始め、点滅・赤では歩道のふちで待つ。人どうし・建物の壁・車道のふちを避ける（social force）。
- 自転車：人と同じ道すじで、秒速3〜4m。人が多いところでは歩く速さまで落とす。
- 車：`geom.ENTRIES` から入り、直進・左折（外側の車線）・右折（内側の車線、対向の直進車を待つ）。赤・黄で停止線に止まり、前の車に追従する。横断歩道に人がいれば待つ。バスは直進だけ。街の端で消える。

## world.js の約束（`CS3.World`）

```js
const world = CS3.World.create(scene);  // 地面・道路・建物・信号機・光を scene に足す
world.setSignals(sim.signal);           // 毎フレーム。信号の灯（emissive）を切り替える。点滅もここで
world.setNight(bool);                   // 昼／夜：空の色・光・窓明かり・街灯
world.update(t);                        // 毎フレーム（点滅などに使う。なくてもよい）
```

- 形はすべて `CS3.geom` から作る。歩道は `CURB_H` の高さ。
- 日本の交差点らしく：横断歩道の白い縞、停止線、車線の白線（中央は黄色でもよい）、歩道の縁石、点字ブロック、横型3灯＋右折矢印の車用信号、人の絵の歩行者信号。
- 影：DirectionalLight の影を地面と建物に（shadow map は 2048 まで）。スマホを考えて、影は main.js から切れるように `world.setShadows(bool)` を用意する。

## actors.js の約束（`CS3.Actors`）

```js
const actors = CS3.Actors.create(scene, { maxPeds: 800, maxCars: 80 });
actors.update(sim, dt);   // 毎フレーム。sim.peds / sim.cars からインスタンスの行列と色を作り直す
actors.setNight(bool);    // 夜はヘッドライト・テールランプを光らせる
actors.pick(raycaster)    // タップした人（sim.peds の要素）を返す。なければ null
```

- 人の部品（胴・頭・髪・腕2・脚2）、自転車（車輪2・フレーム）、車（車体・車室・窓・車輪・ライト・ウインカー）を、それぞれ **InstancedMesh** にする。1人・1台ごとの Mesh は作らない。
- 色は `setColorAt`。歩くときは `phase` で脚と腕を前後に振り、自転車は `phase` でペダルをこぐ。
- 見た目は2D版に合わせたローポリのアニメ塗り（MeshLambertMaterial か MeshToonMaterial、flatShading）。

## main.js の約束

- `WebGLRenderer`（antialias、pixelRatio は最大2）、`PerspectiveCamera`、`OrbitControls`（回転・ズーム・パン。真下にもぐらない）。
- 視点ボタン：**斜め上から**（最初の視点）／**真上から**／**歩く人の目線**（選んだ人の後ろ肩ごし。選んでいなければ横断歩道の近くの地上）。
- タップ（ドラッグでないとき）で人を選び、その人を追いかける。
- HUD：歩行者信号と残り秒、街にいる人・横断中・平均の待ち時間。ツールバー：一時停止、速さ ×1/×2/×4、視点、昼／夜、影。設定：人の流入、歩行者の青、自転車の割合。
- ループ：`requestAnimationFrame`。`sim.step` は固定刻み（1/30 秒）で回し、`actors.update` → `world.setSignals` → `render`。
- 2D版と同じ見た目の HUD（濃紺のカード、黄色のアクセント、Zen Kaku Gothic New）。スマホ縦画面でもシミュレーションが隠れない配置。
