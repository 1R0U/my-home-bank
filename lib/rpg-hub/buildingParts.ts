// RPGハブに登場する建物・装飾・キャラクターの「形」を、3Dエンジンに依存しない
// データとして定義する。
//
// このファイルが持つのは**形だけ**。どのアセットIDがどの形を使うか、影を落とすか、
// 置くときの大きさはいくつか、といった対応づけは lib/rpg-hub/catalog.ts が1か所で持つ。
//
// WebView 側のシーン（webview/rpg-hub/scene.ts）が、この定義を読んで Babylon の
// MeshBuilder で組み立てる。形状の定義をここに1つだけ持つことで、描画側を差し替えても
// 見た目の定義が二重にならない（元は R3F 版の JSX に直接書かれていた）。
//
// 座標・寸法の単位はワールド座標の 1 = 1m 相当。position / rotation はオブジェクトの
// ローカル原点から見た値で、rotation はラジアン。

import type { PaletteSlot } from "../../types/map";

/** 箱。width（X） / height（Y） / depth（Z）。 */
export type BoxPart = {
  depth: number;
  height: number;
  shape: "box";
  width: number;
};

/** 円錐。tessellation は側面の分割数（4 なら四角錐）。 */
export type ConePart = {
  diameter: number;
  height: number;
  shape: "cone";
  tessellation: number;
};

/** 円柱。上面と底面で直径が異なる場合は diameterTop / diameterBottom を使う。 */
export type CylinderPart = {
  diameterBottom: number;
  diameterTop: number;
  height: number;
  shape: "cylinder";
  tessellation: number;
};

/** ドーナツ型。diameter は中心を通る輪の直径、thickness は管の太さ。 */
export type TorusPart = {
  diameter: number;
  shape: "torus";
  thickness: number;
};

/**
 * 球。軸ごとに直径を変えられるので、つぶした丸としても使える。
 * `segments` は分割の細かさで、小さくすると角ばった塊（岩など）になる。
 */
export type SpherePart = {
  diameterX: number;
  diameterY: number;
  diameterZ: number;
  segments: number;
  shape: "sphere";
};

type PartGeometry = BoxPart | ConePart | CylinderPart | SpherePart | TorusPart;

/** 建物・装飾を構成するパーツ1つ分。 */
export type BuildingPart = PartGeometry & {
  /** 16進カラーコード（#rrggbb）。 */
  color: string;
  /**
   * 面ごとに平らに陰影をつける（面の境目をはっきり出す）。
   *
   * 球や円錐は既定では頂点の法線をならすため、分割数を落としても**滑らかな塊**に見える。
   * 岩のように角のある物は、これを立てて面を出さないと団子になる。
   * 頂点を面ごとに分けるので、その分だけ頂点数は増える。
   */
  flatShaded?: boolean;
  /**
   * 色をオブジェクトごとに差し替える枠。
   * 指定があり、かつオブジェクト側の `palette` に同じ枠の色があれば、そちらを使う。
   * 同じ形のNPCを、色だけ変えて家族の人数ぶん置けるようにするためのもの。
   */
  paletteSlot?: PaletteSlot;
  /** ローカル原点からの位置。 */
  position: { x: number; y: number; z: number };
  /** ラジアンでの回転。省略時は無回転。 */
  rotation?: { x: number; y: number; z: number };
};

const box = (
  width: number,
  height: number,
  depth: number,
  position: { x: number; y: number; z: number },
  color: string,
  rotation?: { x: number; y: number; z: number },
): BuildingPart => ({ color, depth, height, position, rotation, shape: "box", width });

/**
 * パーツに色の差し替え枠を付ける。
 * @param part - 元のパーツ
 * @param paletteSlot - 差し替える枠
 * @returns 枠を付けたパーツ
 */
const withSlot = (part: BuildingPart, paletteSlot: PaletteSlot): BuildingPart => ({
  ...part,
  paletteSlot,
});

/**
 * パーツを「面ごとに平らな陰影」にする。
 * @param part - 元のパーツ
 * @returns 平らな陰影を指定したパーツ
 */
const flat = (part: BuildingPart): BuildingPart => ({ ...part, flatShaded: true });

const cone = (
  diameter: number,
  height: number,
  tessellation: number,
  position: { x: number; y: number; z: number },
  color: string,
  rotation?: { x: number; y: number; z: number },
): BuildingPart => ({ color, diameter, height, position, rotation, shape: "cone", tessellation });

const cylinder = (
  diameterTop: number,
  diameterBottom: number,
  height: number,
  tessellation: number,
  position: { x: number; y: number; z: number },
  color: string,
  rotation?: { x: number; y: number; z: number },
): BuildingPart => ({
  color,
  diameterBottom,
  diameterTop,
  height,
  position,
  rotation,
  shape: "cylinder",
  tessellation,
});

const sphere = (
  diameterX: number,
  diameterY: number,
  diameterZ: number,
  segments: number,
  position: { x: number; y: number; z: number },
  color: string,
  rotation?: { x: number; y: number; z: number },
): BuildingPart => ({
  color,
  diameterX,
  diameterY,
  diameterZ,
  position,
  rotation,
  segments,
  shape: "sphere",
});

const torus = (
  diameter: number,
  thickness: number,
  position: { x: number; y: number; z: number },
  color: string,
  rotation?: { x: number; y: number; z: number },
): BuildingPart => ({ color, diameter, position, rotation, shape: "torus", thickness });

/**
 * 寄棟屋根（四角錐）の傾き。軒先から棟までの、水平方向の距離に対する高さの比。
 *
 * カメラは水平から約41度で見下ろしている（scene.ts の CAMERA_OFFSET）。
 * 屋根の傾きがこれに近いと**奥側の斜面がカメラと平行になって消える**ため、
 * 十分にゆるい約32度にして、4つの斜面が上からすべて見えるようにしている。
 */
const ROOF_PITCH = 0.62;

/** 軒の出。屋根が壁より外へ張り出す長さ。 */
const ROOF_EAVES = 0.08;

/**
 * 寄棟屋根の寸法を、載せる壁の箱から求める。
 *
 * **屋根は必ず壁より広くする。** 壁より狭いと壁の上面が屋根のまわりに残り、
 * 見下ろすカメラでは「縁のある盆」に見えてしまう（#214 以前の4棟がこれだった）。
 *
 * 分割数4の錐は「直径」が底面の正方形の外接円なので、45度回して壁と平行にすると、
 * 軒先までの距離は diameter / (2 * √2) になる。逆に解いて直径を出す。
 *
 * @param width - 壁の箱の幅（X）
 * @param depth - 壁の箱の奥行き（Z）
 * @param wallTopY - 壁の上面の高さ。屋根の底面をここに合わせる
 * @returns 屋根の直径・高さ・原点の高さ
 */
const roofOn = (width: number, depth: number, wallTopY: number) => {
  const reach = Math.max(width, depth) / 2 + ROOF_EAVES;
  const height = reach * ROOF_PITCH;
  return { diameter: reach * 2 * Math.SQRT2, height, y: wallTopY + height / 2 };
};

/** 5棟それぞれの屋根の寸法。壁の箱の大きさと上面の高さから決まる。 */
const BANK_ROOF = roofOn(3, 2.3, 0.84);
const STORE_ROOF = roofOn(2.7, 2, 0.6);
const TASKS_ROOF = roofOn(2.7, 2, 0.6);
const HISTORY_ROOF = roofOn(1.2, 1.15, 1.85);
const WARDROBE_ROOF = roofOn(2.6, 2, 0.6);

const QUARTER_TURN = Math.PI / 4;
const RIGHT_ANGLE = Math.PI / 2;

/** 銀行。白い柱と、屋根の上の金貨が目印。 */
export const BANK_PARTS: BuildingPart[] = [
  box(2.8, 1.8, 2.1, { x: 0, y: -0.3, z: 0 }, "#dbeafe"),
  box(3, 0.24, 2.3, { x: 0, y: 0.72, z: 0 }, "#2563a8"),
  cone(BANK_ROOF.diameter, BANK_ROOF.height, 4, { x: 0, y: BANK_ROOF.y, z: 0 }, "#3b7ec0", {
    x: 0,
    y: QUARTER_TURN,
    z: 0,
  }),
  // 正面の2本の柱（柱本体と上下の装飾）
  ...[-0.92, 0.92].flatMap((x): BuildingPart[] => [
    cylinder(0.32, 0.4, 1.55, 20, { x, y: -0.12, z: 1.12 }, "#f8fafc"),
    box(0.45, 0.14, 0.42, { x, y: 0.72, z: 1.12 }, "#fbbf24"),
    box(0.46, 0.14, 0.44, { x, y: -0.96, z: 1.12 }, "#fbbf24"),
  ]),
  box(0.72, 1.15, 0.08, { x: 0, y: -0.45, z: 1.08 }, "#1e3a5f"),
  // 金貨は棟の上に立てる。屋根の斜面に寝かせると、転がってきた硬貨のように見えるため
  cylinder(0.68, 0.68, 0.1, 28, { x: 0, y: BANK_ROOF.y + BANK_ROOF.height / 2 + 0.24, z: 0 }, "#fbbf24", {
    x: RIGHT_ANGLE,
    y: 0,
    z: 0,
  }),
  box(0.08, 0.38, 0.04, {
    x: 0,
    y: BANK_ROOF.y + BANK_ROOF.height / 2 + 0.3,
    z: 0.06,
  }, "#fff7cc"),
];

/**
 * ストア。
 *
 * **ぱっと見で「店」と分かることを優先**して作ってある（#214）。屋根の色だけでは
 * 隣の建物と見分けがつかないため、目印を「カメラから必ず見える場所」に置いた。
 *   - 屋根に立てた看板と、買い物ぶくろの絵。見下ろすカメラでいちばん確実に映る
 *   - 手前へ張り出した縞模様の日よけ。上から見ても縞が出る
 *   - 商品が並んだショーウィンドウ
 *   - 店先に積んだ木箱
 *
 * **地面に置く物は x の外側（1.43より外）へ寄せる。** 屋根は45度回した正方形で
 * ±1.43 まで張り出しており、その内側は軒の影に入って何を置いても見えない。
 * 当たり判定は ±1.7（collisionSize.width 3.4 の半分）なので、1.5前後なら
 * 影から出つつ、すり抜けられる場所にもならない。
 */
export const STORE_PARTS: BuildingPart[] = [
  box(2.7, 1.8, 2, { x: 0, y: -0.3, z: 0 }, "#fff3d6"),
  cone(STORE_ROOF.diameter, STORE_ROOF.height, 4, { x: 0, y: STORE_ROOF.y, z: 0 }, "#dc5a3f", {
    x: 0,
    y: QUARTER_TURN,
    z: 0,
  }),
  // 屋根の看板。棟より上へ出しつつ、手前の斜面に差し込む
  box(1.5, 0.74, 0.1, { x: 0, y: 1.44, z: 0.45 }, "#fff7ed"),
  box(0.46, 0.44, 0.06, { x: 0, y: 1.38, z: 0.53 }, "#d1603a"),
  torus(0.34, 0.075, { x: 0, y: 1.6, z: 0.53 }, "#a8452a", { x: RIGHT_ANGLE, y: 0, z: 0 }),
  // 日よけ。壁の幅いっぱいに広げ、手前へ張り出させる
  box(2.92, 0.14, 0.82, { x: 0, y: 0.14, z: 1.29 }, "#f8fafc", { x: 0.18, y: 0, z: 0 }),
  ...[-1.16, -0.58, 0, 0.58, 1.16].map((x, index) =>
    box(0.56, 0.17, 0.84, { x, y: 0.15, z: 1.3 }, index % 2 === 0 ? "#ef6a4e" : "#fff7ed", {
      x: 0.18,
      y: 0,
      z: 0,
    }),
  ),
  // ショーウィンドウ（枠 → ガラス → 並んだ商品）
  box(1.34, 1, 0.06, { x: -0.6, y: -0.44, z: 1 }, "#c9a87c"),
  box(1.18, 0.86, 0.06, { x: -0.6, y: -0.44, z: 1.04 }, "#7dd3fc"),
  box(0.2, 0.22, 0.07, { x: -1.04, y: -0.66, z: 1.08 }, "#ef476f"),
  box(0.18, 0.3, 0.07, { x: -0.62, y: -0.62, z: 1.08 }, "#ffd166"),
  box(0.22, 0.18, 0.07, { x: -0.2, y: -0.68, z: 1.08 }, "#7bc86c"),
  // 扉
  box(0.7, 1.16, 0.08, { x: 0.74, y: -0.48, z: 1.03 }, "#9a4d2e"),
  box(0.09, 0.09, 0.06, { x: 0.48, y: -0.5, z: 1.09 }, "#d4a754"),
  // 店先に積んだ木箱。底（-1.2）を地面に合わせる
  box(0.52, 0.42, 0.44, { x: 1.56, y: -0.99, z: 1 }, "#b98b5f"),
  box(0.4, 0.34, 0.36, { x: 1.52, y: -0.61, z: 1.04 }, "#c99d70", { x: 0, y: 0.4, z: 0 }),
  box(0.14, 0.14, 0.14, { x: 1.44, y: -0.37, z: 0.98 }, "#ef476f"),
  box(0.14, 0.14, 0.14, { x: 1.61, y: -0.37, z: 1.1 }, "#ffd166"),
];

/**
 * おてつだい。
 *
 * **ぱっと見で「お手伝いの受付」と分かることを優先**して作ってある（#214）。
 * 以前は正面が一枚の掲示板だけで、隣の建物と屋根の色しか違わなかった。
 * 目印をどこへ置くかの考え方は STORE_PARTS のコメントと同じ。
 *   - 屋根に立てた看板と、大きなチェック
 *   - 扉の横の掲示板と、まっすぐ貼られていない貼り紙
 *   - 壁際に立てかけたほうきと、足元のバケツ（お手伝いの道具）
 *   - 屋根の旗
 *
 * 扉は中央のまま。`entranceOffset`（0, 0, 1.08）と揃える必要があるため、
 * 物を足すときも扉は動かさない。
 */
export const TASKS_PARTS: BuildingPart[] = [
  box(2.7, 1.8, 2, { x: 0, y: -0.3, z: 0 }, "#d9b98c"),
  cone(TASKS_ROOF.diameter, TASKS_ROOF.height, 4, { x: 0, y: TASKS_ROOF.y, z: 0 }, "#6d3d78", {
    x: 0,
    y: QUARTER_TURN,
    z: 0,
  }),
  // 屋根の看板と大きなチェック。2本の棒がチェックの2画で、傾きもそのぶん付けている
  box(1.5, 0.74, 0.1, { x: 0, y: 1.44, z: 0.45 }, "#f9f2e0"),
  box(0.17, 0.36, 0.06, { x: -0.11, y: 1.37, z: 0.53 }, "#6d28d9", { x: 0, y: 0, z: 0.785 }),
  box(0.17, 0.61, 0.06, { x: 0.16, y: 1.51, z: 0.53 }, "#6d28d9", { x: 0, y: 0, z: -0.567 }),
  // 扉（中央）
  box(0.84, 1.2, 0.08, { x: 0, y: -0.5, z: 1.03 }, "#6b4423"),
  box(0.09, 0.09, 0.06, { x: 0.28, y: -0.5, z: 1.09 }, "#d4a754"),
  // 掲示板（扉の左）。柱2本 → 板 → 小屋根
  ...[-1.2, -0.48].map((x) => box(0.12, 1.78, 0.12, { x, y: -0.31, z: 1.1 }, "#6b4423")),
  box(0.94, 0.98, 0.09, { x: -0.84, y: -0.16, z: 1.1 }, "#8b5e34"),
  box(1.08, 0.11, 0.24, { x: -0.84, y: 0.39, z: 1.12 }, "#6b4423", { x: -0.22, y: 0, z: 0 }),
  // 貼り紙。まっすぐ貼らないことで「貼り出されている」感じを出す
  box(0.34, 0.42, 0.04, { x: -1.02, y: -0.08, z: 1.16 }, "#f4e3bd", { x: 0, y: 0, z: 0.1 }),
  box(0.3, 0.38, 0.04, { x: -0.64, y: -0.3, z: 1.16 }, "#fdf6e3", { x: 0, y: 0, z: -0.13 }),
  // 壁際に立てかけたほうきと、足元のバケツ。軒の影に入らないよう外側へ寄せる
  // 傾きの符号に注意。Z軸まわりに正で回すと上端が -X（壁の側）へ倒れる。
  // 負にすると壁から離れる方向へ倒れて、寄りかからず倒れかけに見える
  cylinder(0.07, 0.09, 1.3, 8, { x: 1.5, y: -0.5, z: 0.85 }, "#a9763f", { x: 0, y: 0, z: 0.17 }),
  box(0.3, 0.3, 0.16, { x: 1.59, y: -1.05, z: 0.85 }, "#d9a441", { x: 0, y: 0, z: 0.17 }),
  cylinder(0.38, 0.3, 0.34, 12, { x: 1.5, y: -1.03, z: 1.3 }, "#4f93cf"),
  box(0.42, 0.06, 0.42, { x: 1.5, y: -0.86, z: 1.3 }, "#3d7cb0"),
  // 屋根の旗
  cylinder(0.1, 0.1, 1.1, 14, { x: 0, y: 1.6, z: -0.35 }, "#6b4423"),
  box(0.7, 0.42, 0.05, { x: 0.35, y: 1.92, z: -0.35 }, "#a855f7"),
];

/** 取引履歴。塔の上の時計が目印。 */
export const HISTORY_PARTS: BuildingPart[] = [
  box(2.7, 1.75, 2, { x: 0, y: -0.32, z: 0 }, "#d8f3ec"),
  box(2.9, 0.22, 2.2, { x: 0, y: 0.78, z: 0 }, "#176b67"),
  box(1.2, 1, 1.15, { x: 0, y: 1.35, z: 0 }, "#f4e7c5"),
  cone(HISTORY_ROOF.diameter, HISTORY_ROOF.height, 4, { x: 0, y: HISTORY_ROOF.y, z: 0 }, "#176b67", {
    x: 0,
    y: QUARTER_TURN,
    z: 0,
  }),
  cylinder(0.68, 0.68, 0.08, 28, { x: 0, y: 1.42, z: 0.6 }, "#fffaf0", {
    x: RIGHT_ANGLE,
    y: 0,
    z: 0,
  }),
  box(0.045, 0.28, 0.035, { x: 0, y: 1.5, z: 0.66 }, "#334155"),
  box(0.04, 0.24, 0.035, { x: 0.1, y: 1.4, z: 0.66 }, "#334155", { x: 0, y: 0, z: -0.9 }),
  ...[-0.92, 0.92].map((x) => box(0.28, 1.65, 0.16, { x, y: -0.28, z: 1.04 }, "#b98b5f")),
  box(0.9, 1.1, 0.12, { x: 0, y: -0.48, z: 1.05 }, "#245b57"),
  box(1.5, 0.32, 0.1, { x: 0, y: 0.18, z: 1.09 }, "#d4a754"),
];

/**
 * 更衣室。
 *
 * 「着せ替え品を着替える場所」と分かることを優先して、他の4棟とは違う
 * ピンク〜紫の配色にしてある（銀行=青、ストア=赤橙、おてつだい=褐色、履歴=teal）。
 *   - 正面の姿見（丸鏡）。ショーウィンドウと同じ考え方で、外からでも用途が分かるようにした
 *   - 扉の左右に立てたハンガーラックと、掛かった服（円錐）
 *   - 棟の上のリボン
 *
 * `entranceOffset`（0, 0, 1.03）は他棟にならい、実際の扉の見た目位置（x: 0.4）とは
 * 揃えていない。店の扉も中心からずれているが entranceOffset.x は 0 のまま。
 */
export const WARDROBE_PARTS: BuildingPart[] = [
  box(2.6, 1.8, 2, { x: 0, y: -0.3, z: 0 }, "#fbe1ef"),
  cone(WARDROBE_ROOF.diameter, WARDROBE_ROOF.height, 4, { x: 0, y: WARDROBE_ROOF.y, z: 0 }, "#b565a7", {
    x: 0,
    y: QUARTER_TURN,
    z: 0,
  }),
  // 棟の上のリボン。屋根の斜面に寝かせると転がって見えるため、銀行の金貨と同じく棟の上に立てる
  box(0.08, 0.22, 0.05, { x: 0, y: WARDROBE_ROOF.y + WARDROBE_ROOF.height / 2 + 0.14, z: 0 }, "#f28fb0"),
  torus(0.16, 0.045, { x: -0.15, y: WARDROBE_ROOF.y + WARDROBE_ROOF.height / 2 + 0.16, z: 0 }, "#f28fb0", {
    x: 0,
    y: 0,
    z: 0.6,
  }),
  torus(0.16, 0.045, { x: 0.15, y: WARDROBE_ROOF.y + WARDROBE_ROOF.height / 2 + 0.16, z: 0 }, "#f28fb0", {
    x: 0,
    y: 0,
    z: -0.6,
  }),
  // 姿見（丸鏡）。枠 → ガラスの順に少し前へ出す
  cylinder(0.86, 0.86, 0.07, 24, { x: -0.72, y: 0.02, z: 1 }, "#e8c76b", { x: RIGHT_ANGLE, y: 0, z: 0 }),
  cylinder(0.7, 0.7, 0.05, 24, { x: -0.72, y: 0.02, z: 1.03 }, "#dff3fb", { x: RIGHT_ANGLE, y: 0, z: 0 }),
  // 扉
  box(0.78, 1.2, 0.08, { x: 0.4, y: -0.48, z: 1.03 }, "#8a5fb0"),
  box(0.09, 0.09, 0.06, { x: 0.66, y: -0.5, z: 1.09 }, "#f0d98c"),
  // ハンガーラック（左右）。柱 → 横棒 → 掛かった服（円錐）
  ...[-1.5, 1.5].flatMap((x): BuildingPart[] => [
    box(0.06, 1.3, 0.06, { x, y: -0.15, z: 1 }, "#7a5a3a"),
    box(0.5, 0.05, 0.05, { x, y: 0.45, z: 1 }, "#7a5a3a"),
    cone(0.34, 0.42, 8, { x, y: 0.12, z: 1 }, x < 0 ? "#f28fb0" : "#8fc9f2"),
  ]),
];

/**
 * 装飾の木（広葉樹）。
 *
 * 幹は根元へ向かって太くなる円錐台にする。同じ太さの棒だと生えている感じが出ない。
 * 葉は大きさと緑を少しずつ変えた5つのかたまりを**わざとずらして**重ね、輪郭を崩している。
 * 左右対称に組むと、マップに12本並べたときに全部同じ形に見えてしまうため。
 * マップ側で1本ずつ scale と rotationY を変えているので、非対称に組んでおけば
 * 回すだけで別の木に見える。
 *
 * 底面はローカル座標の y = -0.9（DECORATION_SPECS.tree の halfHeight）に合わせる。
 */
export const TREE_PARTS: BuildingPart[] = [
  cylinder(0.17, 0.36, 0.95, 12, { x: 0, y: -0.42, z: 0 }, "#7a5738"),
  sphere(1.36, 1.12, 1.3, 14, { x: 0, y: 0.42, z: 0 }, "#2f7a4e"),
  sphere(1, 0.86, 0.96, 12, { x: 0.33, y: 0.76, z: -0.13 }, "#37905c"),
  sphere(0.84, 0.72, 0.8, 12, { x: -0.35, y: 0.6, z: 0.23 }, "#2a6f47"),
  sphere(0.72, 0.62, 0.7, 10, { x: 0.1, y: 1, z: 0.19 }, "#3d9a63"),
  sphere(0.62, 0.54, 0.6, 10, { x: -0.22, y: 0.28, z: -0.38 }, "#276542"),
];

/**
 * 道のタイル1枚。1.8角の平たい板で、並べて道にする。
 * 地面（y = -0.08）とZファイティングを起こさないよう、置くときに少し浮かせる。
 * 色は季節で変わる地面（春夏は緑、秋は橙、冬は白）のどれに対しても見分けがつく石の色。
 */
export const PATH_PARTS: BuildingPart[] = [box(1.8, 0.06, 1.8, { x: 0, y: 0, z: 0 }, "#a39a8c")];

/**
 * 岩。
 *
 * **球の分割数をかなり落として、面を残す。** 岩は丸くないので、分割を上げるとただの
 * 団子になる。軸ごとに直径を変えて潰し、さらに3軸とも回して割れた向きをばらす。
 * 大中小の3つを寄せることで、ひとつの球ではなく積み重なった石に見せている。
 */
export const ROCK_PARTS: BuildingPart[] = [
  flat(sphere(1.02, 0.7, 0.84, 5, { x: 0, y: 0, z: 0 }, "#8a8a83", { x: 0.16, y: 0.5, z: 0.2 })),
  flat(sphere(0.62, 0.5, 0.56, 4, { x: 0.34, y: -0.1, z: 0.2 }, "#9b9b93", { x: 0.3, y: -0.7, z: 0.25 })),
  flat(sphere(0.36, 0.28, 0.32, 4, { x: -0.3, y: -0.16, z: 0.27 }, "#7e7e77", { x: 0, y: 1.2, z: 0.4 })),
];

/**
 * 低木（茂み）。
 *
 * 丸いかたまりだけだと苔玉に見えるので、**外へ飛び出した葉先**を足して輪郭を崩す。
 * かたまりごとに緑を変えているのは、単色だと塗った球にしか見えないため。
 */
export const BUSH_PARTS: BuildingPart[] = [
  sphere(1.02, 0.8, 0.96, 14, { x: 0, y: 0, z: 0 }, "#3a8a56"),
  sphere(0.74, 0.62, 0.72, 12, { x: 0.29, y: -0.06, z: 0.22 }, "#469a63"),
  sphere(0.58, 0.5, 0.56, 10, { x: -0.28, y: -0.09, z: -0.18 }, "#327d4c"),
  flat(cone(0.13, 0.56, 4, { x: 0.23, y: 0.28, z: -0.22 }, "#4fa86b", { x: 0.16, y: 0, z: -0.42 })),
  flat(cone(0.12, 0.48, 4, { x: -0.26, y: 0.24, z: 0.2 }, "#44a062", { x: -0.2, y: 0.9, z: 0.5 })),
];

/**
 * 草むら。地面にまばらに生やして、単色の平面が続くのを防ぐ。
 *
 * 細い円錐を、根元をそろえて外へ倒しただけ。長さと傾きをばらしている。
 * 踏んで歩けるよう、マップ側では当たり判定を持たせていない。
 */
export const GRASS_PARTS: BuildingPart[] = [
  flat(cone(0.19, 0.72, 4, { x: 0, y: 0.06, z: 0 }, "#4ca35f", { x: 0.12, y: 0, z: 0.14 })),
  flat(cone(0.17, 0.62, 4, { x: 0.19, y: 0.01, z: 0.11 }, "#58b26c", { x: 0.14, y: 0.8, z: -0.46 })),
  flat(cone(0.16, 0.54, 4, { x: -0.18, y: -0.02, z: -0.09 }, "#429455", { x: -0.2, y: 1.9, z: 0.5 })),
  flat(cone(0.15, 0.46, 4, { x: 0.07, y: -0.05, z: -0.21 }, "#4ca35f", { x: 0.46, y: 2.8, z: -0.16 })),
  flat(cone(0.14, 0.4, 4, { x: -0.13, y: -0.07, z: 0.19 }, "#3f9455", { x: -0.44, y: 3.6, z: 0.22 })),
];

/** 花壇。土の箱に縁をつけ、上に色違いの花を散らす。 */
export const FLOWERBED_PARTS: BuildingPart[] = [
  box(1.6, 0.28, 1.6, { x: 0, y: 0, z: 0 }, "#8b6f47"),
  box(1.72, 0.1, 1.72, { x: 0, y: 0.16, z: 0 }, "#a1855f"),
  ...[
    { color: "#ef476f", x: -0.4, z: -0.35 },
    { color: "#ffd166", x: 0.35, z: -0.2 },
    { color: "#f9a8d4", x: 0, z: 0.4 },
    { color: "#c084fc", x: 0.45, z: 0.45 },
    { color: "#fb923c", x: -0.45, z: 0.3 },
    // 引数での分割代入は使わない。WebView 用バンドルの esbuild ターゲット（ios13）で
    // 変換できず、ビルドが落ちる。
  ].map((flower) => box(0.16, 0.16, 0.16, { x: flower.x, y: 0.27, z: flower.z }, flower.color)),
];

/** 街灯。柱の上に明かりの箱を載せる（実際の照明は置かず、色だけで表す）。 */
export const LAMP_PARTS: BuildingPart[] = [
  cylinder(0.12, 0.18, 2, 14, { x: 0, y: 0, z: 0 }, "#4b5563"),
  box(0.34, 0.34, 0.34, { x: 0, y: 1.12, z: 0 }, "#fde68a"),
  box(0.44, 0.08, 0.44, { x: 0, y: 1.33, z: 0 }, "#374151"),
];

/**
 * 住人（NPC）。
 *
 * 服・髪・肌の3か所に色の差し替え枠を付けてある。形は共通のまま `palette` で色を変えることで、
 * 家族の人数ぶんキャラクターを増やしてもアセットは1つで済む。
 * 高さは足の底(-0.71)から髪の上(0.79)までの約1.5で、プレイヤー（1.6）と並べて不自然にならない。
 */
export const VILLAGER_PARTS: BuildingPart[] = [
  // 足
  ...[-0.13, 0.13].map((x) => box(0.16, 0.42, 0.18, { x, y: -0.5, z: 0 }, "#3f3f46")),
  // 胴（服）
  withSlot(box(0.52, 0.62, 0.3, { x: 0, y: 0, z: 0 }, "#60a5fa"), "accent"),
  // 腕
  ...[-0.33, 0.33].map((x) =>
    withSlot(box(0.13, 0.5, 0.16, { x, y: -0.02, z: 0 }, "#60a5fa"), "accent"),
  ),
  // 手
  ...[-0.33, 0.33].map((x) => withSlot(box(0.14, 0.12, 0.17, { x, y: -0.3, z: 0 }, "#f3c9a4"), "skin")),
  // 首
  withSlot(box(0.18, 0.1, 0.18, { x: 0, y: 0.35, z: 0 }, "#f3c9a4"), "skin"),
  // 頭
  withSlot(box(0.42, 0.4, 0.38, { x: 0, y: 0.6, z: 0 }, "#f3c9a4"), "skin"),
  // 髪
  withSlot(box(0.46, 0.15, 0.42, { x: 0, y: 0.75, z: 0 }, "#3f2a1d"), "hair"),
  withSlot(box(0.46, 0.22, 0.06, { x: 0, y: 0.66, z: -0.19 }, "#3f2a1d"), "hair"),
  // 目（正面は +Z）
  ...[-0.1, 0.1].map((x) => box(0.07, 0.08, 0.04, { x, y: 0.63, z: 0.19 }, "#1f2937")),
];

/**
 * プレイヤー（カエル）。
 *
 * 当たり判定はシーン側の `PLAYER_COLLISION_RADIUS`（0.45）で決まっているため、見た目も
 * 横幅がその直径（0.9）に収まるように組んである。足先だけ少しはみ出して踏ん張って見せる。
 *
 * 正面は +Z。住人（VILLAGER_PARTS）と同じ向きに揃えてあり、進む向きへ回すときも同じ
 * 計算（`Math.atan2(dx, dz)`）が使える。
 *
 * **カメラ（+X+Z から見下ろす）に映るのは上面と +X面・+Z面の3つだけ**なので、
 * カエルらしさが出る要素を全部その3面に寄せてある。
 *   - 目は頭の上に飛び出させる（上面に出る）
 *   - 口は頭より一回り大きい濃い緑の帯にして、+X面と+Z面の両方に回り込ませる
 *   - のどのクリーム色は口の帯のすぐ下に、頭より奥行きだけ大きくして +Z面に出す
 *   - 頭を胴より高くして、上から見たときに頭と背中のあいだに段差を作る
 *
 * 高さは手の底(-0.33)から瞳の上(0.60)までの約0.93。住人（約1.5）より低く、ずんぐりさせている。
 */
export const PLAYER_PARTS: BuildingPart[] = [
  // 後ろ足（もも → 足先）。体の横で畳んで、足先を前へ出す
  ...[-0.36, 0.36].map((x) => box(0.2, 0.26, 0.34, { x, y: -0.12, z: -0.26 }, "#2f7a2a")),
  ...[-0.36, 0.36].map((x) => box(0.26, 0.1, 0.32, { x, y: -0.28, z: 0.02 }, "#2f7a2a")),
  // 前足（腕 → 手）。頭の下から前へ突く
  ...[-0.3, 0.3].map((x) => box(0.13, 0.2, 0.13, { x, y: -0.18, z: 0.46 }, "#2f7a2a")),
  ...[-0.32, 0.32].map((x) => box(0.18, 0.09, 0.22, { x, y: -0.29, z: 0.56 }, "#2f7a2a")),
  // 胴（背中）。頭より低く細くして、上から見たときに頭との段差を作る
  box(0.66, 0.34, 0.5, { x: 0, y: -0.08, z: -0.28 }, "#4fae3f"),
  // 背中の斑点。等間隔に並べないことで、のっぺりした箱に見えないようにする
  box(0.16, 0.06, 0.14, { x: -0.15, y: 0.09, z: -0.22 }, "#2f7a2a"),
  box(0.12, 0.06, 0.12, { x: 0.17, y: 0.09, z: -0.34 }, "#2f7a2a"),
  box(0.1, 0.06, 0.1, { x: -0.02, y: 0.09, z: -0.44 }, "#2f7a2a"),
  // 頭。胴より大きく、高く、前に出す
  box(0.8, 0.6, 0.56, { x: 0, y: 0.08, z: 0.22 }, "#4fae3f"),
  // のど。頭より奥行きだけ大きくして、+Z面にクリーム色が出るようにする
  box(0.62, 0.14, 0.58, { x: 0, y: -0.14, z: 0.22 }, "#f7e9c4"),
  // 口。頭より一回り大きい帯にして、+X面と+Z面へぐるりと回り込ませる
  box(0.84, 0.09, 0.6, { x: 0, y: -0.02, z: 0.22 }, "#2f7a2a"),
  // 鼻の穴。真上から見たときの「顔の向き」の手がかりになる
  ...[-0.08, 0.08].map((x) => box(0.05, 0.04, 0.05, { x, y: 0.38, z: 0.42 }, "#2f7a2a")),
  // 目。まぶたのふくらみ → 眼球 → 瞳の3段重ね。円柱だと輪切りの角が出るので球で作る。
  // 瞳は少し前と上へ寄せて、見下ろすカメラからも前を見ているように見せる
  ...[-0.25, 0.25].map((x) => sphere(0.3, 0.26, 0.3, 14, { x, y: 0.36, z: 0.18 }, "#4fae3f")),
  ...[-0.25, 0.25].map((x) => sphere(0.24, 0.24, 0.24, 16, { x, y: 0.48, z: 0.18 }, "#fdfdf6")),
  ...[-0.25, 0.25].map((x) => sphere(0.13, 0.13, 0.13, 12, { x, y: 0.53, z: 0.24 }, "#1e2b1a")),
];

/**
 * 着せ替え品（Issue #221）。
 *
 * **装着先の座標を持たない。** どこに付くかはキャラクター側のアンカー
 * （catalog.ts の `anchors`）が決める。ここにあるのは「アンカーに載せたときの形」だけで、
 * 原点がアンカーの位置に一致する。キャラクターを差し替えるときも、ここは触らない。
 *
 * 大きさはカエル（PLAYER_PARTS）に合わせた基準で作ってあり、頭の小さいキャラクターには
 * アンカー側の `scale` で縮めて付ける。**アイテムごとにキャラ別の寸法を持たせない。**
 */

/** 帽子。アンカーの真上に載る向きで、つばの下端が y = 0。 */
export const HAT_PARTS: BuildingPart[] = [
  // つば
  cylinder(0.66, 0.66, 0.06, 16, { x: 0, y: 0.03, z: 0 }, "#7c3aed"),
  // 山
  cylinder(0.4, 0.44, 0.26, 16, { x: 0, y: 0.19, z: 0 }, "#8b5cf6"),
  // リボン。つばとの境目に巻いて、山とつばの区切りを出す
  cylinder(0.46, 0.46, 0.07, 16, { x: 0, y: 0.09, z: 0 }, "#facc15"),
];

/**
 * めがね。正面（+Z）を向いた輪が2つ。
 *
 * レンズの間隔（x = ±0.25）はカエルの目の位置に合わせた**基準値**で、目の間隔が違う
 * キャラクターにはアンカーの `scale` を変えて合わせる（住人は 0.4 で ±0.1 になる）。
 */
export const GLASSES_PARTS: BuildingPart[] = [
  // レンズの縁。トーラスは既定でXZ平面に寝ているので、X軸まわりに90度起こして正面へ向ける
  ...[-0.25, 0.25].map((x) =>
    torus(0.26, 0.035, { x, y: 0, z: 0 }, "#1f2937", { x: Math.PI / 2, y: 0, z: 0 }),
  ),
  // ブリッジ
  box(0.24, 0.03, 0.03, { x: 0, y: 0, z: 0 }, "#1f2937"),
  // つる。左右へ後ろ向きに伸ばす
  ...[-0.37, 0.37].map((x) => box(0.03, 0.03, 0.2, { x, y: 0, z: -0.12 }, "#1f2937")),
];

/**
 * 木・低木・岩・草むらの別パターン。
 *
 * 同じ形だけを並べると、いくら散らしても模様のように見える。1種類につき4つ用意して、
 * 置くときにランダムで選ぶ（`INITIAL_MAP_OBJECTS` の散布）。
 * 底面の高さは `DECORATION_SPECS` の `halfHeight` と合わせること。合っていないと
 * 地面から浮くか、埋まる。
 */

/** 針葉樹。円錐を3段重ねる。 */
export const TREE_PINE_PARTS: BuildingPart[] = [
  cylinder(0.16, 0.3, 0.7, 10, { x: 0, y: -0.55, z: 0 }, "#6b4a2f"),
  cone(1.5, 0.95, 10, { x: 0, y: 0.05, z: 0 }, "#2a6b46"),
  cone(1.16, 0.8, 10, { x: 0, y: 0.62, z: 0 }, "#31784f"),
  cone(0.82, 0.7, 10, { x: 0, y: 1.18, z: 0 }, "#38855a"),
];

/** ひょろ長い木。幹を高くして、葉のかたまりを上へ寄せる。 */
export const TREE_TALL_PARTS: BuildingPart[] = [
  cylinder(0.15, 0.3, 1.35, 10, { x: 0, y: -0.22, z: 0 }, "#7a5738"),
  sphere(1.1, 1, 1.05, 14, { x: 0, y: 0.78, z: 0 }, "#2f7a4e"),
  sphere(0.8, 0.72, 0.76, 12, { x: 0.22, y: 1.24, z: -0.1 }, "#37905c"),
  sphere(0.6, 0.55, 0.58, 10, { x: -0.24, y: 1.08, z: 0.2 }, "#2a6f47"),
];

/** 若木。低くて丸い。 */
export const TREE_YOUNG_PARTS: BuildingPart[] = [
  cylinder(0.12, 0.2, 0.55, 8, { x: 0, y: -0.27, z: 0 }, "#7a5738"),
  sphere(0.86, 0.72, 0.82, 12, { x: 0, y: 0.3, z: 0 }, "#379657"),
  sphere(0.6, 0.5, 0.56, 10, { x: 0.2, y: 0.55, z: -0.1 }, "#43a566"),
];

/** 広がった低木。地面を這うように低く、横に大きい。 */
export const BUSH_WIDE_PARTS: BuildingPart[] = [
  sphere(1.3, 0.6, 1.16, 14, { x: 0, y: 0, z: 0 }, "#3a8a56"),
  sphere(0.9, 0.46, 0.82, 12, { x: 0.36, y: -0.06, z: 0.24 }, "#469a63"),
  sphere(0.7, 0.38, 0.64, 10, { x: -0.34, y: -0.07, z: -0.2 }, "#327d4c"),
  flat(cone(0.12, 0.44, 4, { x: 0.3, y: 0.2, z: -0.22 }, "#4fa86b", { x: 0.2, y: 0, z: -0.4 })),
];

/** 立ち上がった低木。葉先を多めに出す。 */
export const BUSH_TALL_PARTS: BuildingPart[] = [
  sphere(0.8, 0.9, 0.78, 14, { x: 0, y: 0.05, z: 0 }, "#3a8a56"),
  sphere(0.56, 0.6, 0.54, 12, { x: 0.24, y: -0.16, z: 0.18 }, "#469a63"),
  flat(cone(0.13, 0.54, 4, { x: 0.2, y: 0.42, z: -0.16 }, "#4fa86b", { x: 0.16, y: 0, z: -0.36 })),
  flat(cone(0.12, 0.48, 4, { x: -0.22, y: 0.38, z: 0.18 }, "#44a062", { x: -0.2, y: 0.9, z: 0.42 })),
  flat(cone(0.11, 0.42, 4, { x: 0.04, y: 0.46, z: 0.22 }, "#57b06c", { x: 0.34, y: 2.1, z: 0.1 })),
];

/** 実のなった低木。赤い実で色味を足す。 */
export const BUSH_BERRY_PARTS: BuildingPart[] = [
  sphere(1, 0.78, 0.94, 14, { x: 0, y: 0, z: 0 }, "#357f4e"),
  sphere(0.7, 0.58, 0.66, 12, { x: -0.28, y: -0.06, z: 0.22 }, "#3f9159"),
  box(0.12, 0.12, 0.12, { x: 0.22, y: 0.3, z: 0.14 }, "#d1453f"),
  box(0.11, 0.11, 0.11, { x: -0.16, y: 0.24, z: -0.26 }, "#e05a4c"),
  box(0.1, 0.1, 0.1, { x: 0.3, y: 0.12, z: -0.2 }, "#c33b36"),
  flat(cone(0.11, 0.44, 4, { x: -0.3, y: 0.28, z: -0.1 }, "#4fa86b", { x: -0.18, y: 0.6, z: 0.4 })),
];

/** 立った岩。縦に細長い塊。 */
export const ROCK_TALL_PARTS: BuildingPart[] = [
  flat(sphere(0.62, 1.12, 0.58, 5, { x: 0, y: 0.1, z: 0 }, "#8a8a83", { x: 0.1, y: 0.6, z: 0.14 })),
  flat(sphere(0.5, 0.3, 0.46, 4, { x: 0.28, y: -0.32, z: 0.16 }, "#9b9b93", { x: 0, y: -0.5, z: 0.2 })),
];

/** 平たい岩。踏み石のように地面へ寝かせる。 */
export const ROCK_FLAT_PARTS: BuildingPart[] = [
  flat(sphere(1.25, 0.42, 1, 5, { x: 0, y: 0, z: 0 }, "#8f8f88", { x: 0.06, y: 0.9, z: 0.08 })),
  flat(sphere(0.5, 0.26, 0.44, 4, { x: -0.4, y: -0.06, z: 0.26 }, "#a0a099", { x: 0, y: 1.4, z: 0.15 })),
];

/** 小石の集まり。 */
export const ROCK_PILE_PARTS: BuildingPart[] = [
  flat(sphere(0.56, 0.4, 0.5, 5, { x: -0.18, y: 0, z: -0.1 }, "#8a8a83", { x: 0.12, y: 0.3, z: 0.1 })),
  flat(sphere(0.44, 0.32, 0.4, 4, { x: 0.24, y: -0.04, z: 0.18 }, "#9b9b93", { x: 0, y: -0.8, z: 0.2 })),
  flat(sphere(0.34, 0.26, 0.3, 4, { x: 0.02, y: -0.07, z: 0.34 }, "#7e7e77", { x: 0.2, y: 1.6, z: 0 })),
  flat(sphere(0.26, 0.2, 0.24, 4, { x: -0.3, y: -0.1, z: 0.24 }, "#a4a49c", { x: 0, y: 2.4, z: 0.3 })),
];

/** 広がった草むら。短い葉を横に散らす。 */
export const GRASS_WIDE_PARTS: BuildingPart[] = [
  flat(cone(0.18, 0.44, 4, { x: 0, y: 0, z: 0 }, "#4ca35f", { x: 0.3, y: 0, z: 0.26 })),
  flat(cone(0.17, 0.4, 4, { x: 0.26, y: -0.02, z: 0.14 }, "#58b26c", { x: 0.26, y: 0.8, z: -0.5 })),
  flat(cone(0.16, 0.36, 4, { x: -0.24, y: -0.03, z: -0.12 }, "#429455", { x: -0.3, y: 1.9, z: 0.52 })),
  flat(cone(0.15, 0.34, 4, { x: 0.1, y: -0.04, z: -0.28 }, "#4ca35f", { x: 0.5, y: 2.8, z: -0.2 })),
  flat(cone(0.14, 0.3, 4, { x: -0.18, y: -0.05, z: 0.26 }, "#3f9455", { x: -0.48, y: 3.6, z: 0.3 })),
  flat(cone(0.13, 0.28, 4, { x: 0.3, y: -0.06, z: -0.2 }, "#57b06c", { x: 0.2, y: 4.4, z: -0.44 })),
];

/** 背の高い草むら。細い葉をまっすぐ立てる。 */
export const GRASS_TALL_PARTS: BuildingPart[] = [
  flat(cone(0.14, 0.92, 4, { x: 0, y: 0.18, z: 0 }, "#4ca35f", { x: 0.06, y: 0, z: 0.08 })),
  flat(cone(0.13, 0.8, 4, { x: 0.14, y: 0.12, z: 0.08 }, "#58b26c", { x: 0.08, y: 0.9, z: -0.16 })),
  flat(cone(0.12, 0.7, 4, { x: -0.13, y: 0.07, z: -0.06 }, "#429455", { x: -0.1, y: 2, z: 0.2 })),
  flat(cone(0.11, 0.58, 4, { x: 0.05, y: 0.02, z: -0.16 }, "#3f9455", { x: 0.22, y: 3, z: -0.1 })),
];

/** 花の咲いた草むら。 */
export const GRASS_FLOWER_PARTS: BuildingPart[] = [
  flat(cone(0.17, 0.56, 4, { x: 0, y: 0.02, z: 0 }, "#4ca35f", { x: 0.12, y: 0, z: 0.16 })),
  flat(cone(0.15, 0.48, 4, { x: 0.18, y: -0.02, z: 0.1 }, "#58b26c", { x: 0.14, y: 0.9, z: -0.42 })),
  flat(cone(0.14, 0.42, 4, { x: -0.17, y: -0.04, z: -0.08 }, "#429455", { x: -0.2, y: 2, z: 0.46 })),
  box(0.12, 0.12, 0.12, { x: 0.06, y: 0.3, z: -0.14 }, "#f6d365"),
  box(0.11, 0.11, 0.11, { x: -0.2, y: 0.22, z: 0.16 }, "#ef8fb7"),
  box(0.1, 0.1, 0.1, { x: 0.24, y: 0.18, z: 0.2 }, "#e9e6ef"),
];

/**
 * 未知のアセットIDに対するフォールバックの形。
 * 対応づけは catalog.ts が持つが、`box` はこのファイルの内部ヘルパーなので形はここに置く。
 */
export const FALLBACK_PARTS: BuildingPart[] = [
  box(2.6, 2.4, 2.2, { x: 0, y: 0, z: 0 }, "#94a3b8"),
];
