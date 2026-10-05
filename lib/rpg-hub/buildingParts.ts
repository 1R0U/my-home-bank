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

import type { PaletteSlot, SeasonSlot } from "../../types/map";

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
  /**
   * 季節で色が変わる部品の種類（Issue #282）。
   * 指定があれば、季節に合わせて `color` から寄せた色で描く（形は変わらない）。
   * 寄せ方は lib/rpg-hub/seasonalLook.ts が決める。
   */
  seasonSlot?: SeasonSlot;
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

/**
 * パーツを「季節で色が変わる部品」にする（Issue #282）。
 * @param seasonSlot - 部品の種類
 * @param part - 元のパーツ
 * @returns 季節の種類を付けたパーツ
 */
const seasonal = (seasonSlot: SeasonSlot, part: BuildingPart): BuildingPart => ({
  ...part,
  seasonSlot,
});

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

/** 6棟それぞれの屋根の寸法。壁の箱の大きさと上面の高さから決まる。 */
const BANK_ROOF = roofOn(3, 2.3, 0.84);
const STORE_ROOF = roofOn(2.7, 2, 0.6);
const TASKS_ROOF = roofOn(2.7, 2, 0.6);
const HISTORY_ROOF = roofOn(1.2, 1.15, 1.85);
const HOUSE_ROOF = roofOn(2.6, 2, 0.6);

const QUARTER_TURN = Math.PI / 4;
const RIGHT_ANGLE = Math.PI / 2;

/** 銀行。白い柱と、屋根の上の金貨が目印。 */
export const BANK_PARTS: BuildingPart[] = [
  box(2.8, 1.8, 2.1, { x: 0, y: -0.3, z: 0 }, "#dbeafe"),
  box(3, 0.24, 2.3, { x: 0, y: 0.72, z: 0 }, "#2563a8"),
  seasonal("roof", cone(BANK_ROOF.diameter, BANK_ROOF.height, 4, { x: 0, y: BANK_ROOF.y, z: 0 }, "#3b7ec0", {
    x: 0,
    y: QUARTER_TURN,
    z: 0,
  })),
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
  seasonal("roof", cone(STORE_ROOF.diameter, STORE_ROOF.height, 4, { x: 0, y: STORE_ROOF.y, z: 0 }, "#dc5a3f", {
    x: 0,
    y: QUARTER_TURN,
    z: 0,
  })),
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
  seasonal("roof", cone(TASKS_ROOF.diameter, TASKS_ROOF.height, 4, { x: 0, y: TASKS_ROOF.y, z: 0 }, "#6d3d78", {
    x: 0,
    y: QUARTER_TURN,
    z: 0,
  })),
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
  seasonal("roof", cone(HISTORY_ROOF.diameter, HISTORY_ROOF.height, 4, { x: 0, y: HISTORY_ROOF.y, z: 0 }, "#176b67", {
    x: 0,
    y: QUARTER_TURN,
    z: 0,
  })),
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
 * 自分の家（Issue #235）。
 *
 * 「着せ替え品を着替える場所」と分かることを優先して、他の4棟とは違う
 * ピンク〜紫の配色にしてある（銀行=青、ストア=赤橙、おてつだい=褐色、履歴=teal）。
 * 姿見やハンガーラックは中に入れるので、外側は壁・屋根・扉だけのシンプルな作り。
 *
 * `entranceOffset`（0, 0, 1.03）は他棟にならい、実際の扉の見た目位置（x: 0.4）とは
 * 揃えていない。店の扉も中心からずれているが entranceOffset.x は 0 のまま。
 */
export const HOUSE_PARTS: BuildingPart[] = [
  box(2.6, 1.8, 2, { x: 0, y: -0.3, z: 0 }, "#fbe1ef"),
  cone(HOUSE_ROOF.diameter, HOUSE_ROOF.height, 4, { x: 0, y: HOUSE_ROOF.y, z: 0 }, "#b565a7", {
    x: 0,
    y: QUARTER_TURN,
    z: 0,
  }),
  // 棟の上のリボン。屋根の斜面に寝かせると転がって見えるため、銀行の金貨と同じく棟の上に立てる
  box(0.08, 0.22, 0.05, { x: 0, y: HOUSE_ROOF.y + HOUSE_ROOF.height / 2 + 0.14, z: 0 }, "#f28fb0"),
  torus(0.16, 0.045, { x: -0.15, y: HOUSE_ROOF.y + HOUSE_ROOF.height / 2 + 0.16, z: 0 }, "#f28fb0", {
    x: 0,
    y: 0,
    z: 0.6,
  }),
  torus(0.16, 0.045, { x: 0.15, y: HOUSE_ROOF.y + HOUSE_ROOF.height / 2 + 0.16, z: 0 }, "#f28fb0", {
    x: 0,
    y: 0,
    z: -0.6,
  }),
  // 扉
  box(0.78, 1.2, 0.08, { x: 0.4, y: -0.48, z: 1.03 }, "#8a5fb0"),
  box(0.09, 0.09, 0.06, { x: 0.66, y: -0.5, z: 1.09 }, "#f0d98c"),
];

/**
 * 姿見（丸鏡）。自分の家の中に置く、着せ替え画面への入口（Issue #235）。
 *
 * 建物パーツと同じ仕組みで作った家具の1つ。`scale` は掛けない小さな家具なので、
 * 4棟の建物とは違い底面はローカル座標の y = -0.6 に合わせてある
 * （mapObjects.ts でこの値だけ position.y へ足している）。
 */
export const WARDROBE_PARTS: BuildingPart[] = [
  box(0.5, 0.06, 0.3, { x: 0, y: -0.57, z: 0 }, "#7a5a3a"),
  box(0.06, 0.9, 0.06, { x: 0, y: -0.09, z: 0 }, "#7a5a3a"),
  cylinder(0.7, 0.7, 0.06, 24, { x: 0, y: 0.45, z: 0 }, "#e8c76b", { x: RIGHT_ANGLE, y: 0, z: 0 }),
  cylinder(0.58, 0.58, 0.045, 24, { x: 0, y: 0.45, z: 0.02 }, "#dff3fb", { x: RIGHT_ANGLE, y: 0, z: 0 }),
];

/**
 * 家の中の壁。1枚だけを繰り返し並べて、部屋の3辺を囲む（Issue #235）。
 *
 * 道のタイルと同じ考え方で、正方形の1枚を隙間なく並べる形にしてある。
 * 壁ごとに幅を変えられるよう伸び縮みさせると、当たり判定（正方形前提）とずれるため。
 */
export const HOUSE_WALL_PARTS: BuildingPart[] = [box(1.2, 1.6, 1.2, { x: 0, y: 0, z: 0 }, "#e8d5c4")];

/** ハンガーラック。掛かった服を円錐で表す、自分で置ける装飾（Issue #235）。 */
export const HANGER_RACK_PARTS: BuildingPart[] = [
  box(0.06, 1.3, 0.06, { x: 0, y: 0, z: 0 }, "#7a5a3a"),
  box(0.5, 0.05, 0.05, { x: 0, y: 0.6, z: 0 }, "#7a5a3a"),
  cone(0.34, 0.42, 8, { x: 0, y: 0.27, z: 0 }, "#f28fb0"),
];

/**
 * 更衣室の入口を囲むカーテン（Issue #235）。
 *
 * 上の棒と、左右に寄せた布・タッセルだけの見た目。当たり判定は持たせない
 * （カタログの `houseChangingCurtain` で `solid: false` を指定している）ので、
 * 通り道をふさがない。
 */
export const CHANGING_CURTAIN_PARTS: BuildingPart[] = [
  box(4, 0.06, 0.06, { x: 0, y: 0.8, z: 0 }, "#8a5fb0"),
  box(0.45, 1.6, 0.08, { x: -1.85, y: 0, z: 0 }, "#c98fd6", { x: 0, y: 0, z: 0.1 }),
  box(0.45, 1.6, 0.08, { x: 1.85, y: 0, z: 0 }, "#c98fd6", { x: 0, y: 0, z: -0.1 }),
  torus(0.16, 0.035, { x: -1.85, y: 0.3, z: 0.05 }, "#f28fb0", { x: RIGHT_ANGLE, y: 0, z: 0 }),
  torus(0.16, 0.035, { x: 1.85, y: 0.3, z: -0.05 }, "#f28fb0", { x: RIGHT_ANGLE, y: 0, z: 0 }),
];

/**
 * 階段。2階への行き来に使う（Issue #235）。上り下りどちらの建物にも同じ形を使う。
 *
 * 段は手前（-Z、入口側）が低く、奥（+Z）へ向かって高くなる。扉は+Z向きという
 * 他の建物と同じ前提（movement.ts）に合わせ、奥へ進むほど「上っていく」向きにしてある。
 */
export const STAIRS_PARTS: BuildingPart[] = [
  box(1, 0.15, 0.4, { x: 0, y: -0.5, z: -0.3 }, "#8b6f47"),
  box(1, 0.15, 0.4, { x: 0, y: -0.35, z: -0.1 }, "#96794f"),
  box(1, 0.15, 0.4, { x: 0, y: -0.2, z: 0.1 }, "#a18357"),
  box(1, 0.15, 0.4, { x: 0, y: -0.05, z: 0.3 }, "#ac8d5f"),
  // 手すり
  box(0.06, 0.6, 1, { x: -0.52, y: -0.2, z: 0 }, "#6b4a2f"),
  box(0.06, 0.6, 1, { x: 0.52, y: -0.2, z: 0 }, "#6b4a2f"),
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
  seasonal("blossom", sphere(1.36, 1.12, 1.3, 14, { x: 0, y: 0.42, z: 0 }, "#2f7a4e")),
  seasonal("blossom", sphere(1, 0.86, 0.96, 12, { x: 0.33, y: 0.76, z: -0.13 }, "#37905c")),
  seasonal("blossom", sphere(0.84, 0.72, 0.8, 12, { x: -0.35, y: 0.6, z: 0.23 }, "#2a6f47")),
  seasonal("blossom", sphere(0.72, 0.62, 0.7, 10, { x: 0.1, y: 1, z: 0.19 }, "#3d9a63")),
  seasonal("blossom", sphere(0.62, 0.54, 0.6, 10, { x: -0.22, y: 0.28, z: -0.38 }, "#276542")),
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
  seasonal("foliage", sphere(1.02, 0.8, 0.96, 14, { x: 0, y: 0, z: 0 }, "#3a8a56")),
  seasonal("foliage", sphere(0.74, 0.62, 0.72, 12, { x: 0.29, y: -0.06, z: 0.22 }, "#469a63")),
  seasonal("foliage", sphere(0.58, 0.5, 0.56, 10, { x: -0.28, y: -0.09, z: -0.18 }, "#327d4c")),
  seasonal(
    "foliage",
    flat(cone(0.13, 0.56, 4, { x: 0.23, y: 0.28, z: -0.22 }, "#4fa86b", { x: 0.16, y: 0, z: -0.42 })),
  ),
  seasonal(
    "foliage",
    flat(cone(0.12, 0.48, 4, { x: -0.26, y: 0.24, z: 0.2 }, "#44a062", { x: -0.2, y: 0.9, z: 0.5 })),
  ),
];

/**
 * 草むら。地面にまばらに生やして、単色の平面が続くのを防ぐ。
 *
 * 細い円錐を、根元をそろえて外へ倒しただけ。長さと傾きをばらしている。
 * 踏んで歩けるよう、マップ側では当たり判定を持たせていない。
 */
export const GRASS_PARTS: BuildingPart[] = [
  seasonal(
    "grass",
    flat(cone(0.19, 0.72, 4, { x: 0, y: 0.06, z: 0 }, "#4ca35f", { x: 0.12, y: 0, z: 0.14 })),
  ),
  seasonal(
    "grass",
    flat(cone(0.17, 0.62, 4, { x: 0.19, y: 0.01, z: 0.11 }, "#58b26c", { x: 0.14, y: 0.8, z: -0.46 })),
  ),
  seasonal(
    "grass",
    flat(cone(0.16, 0.54, 4, { x: -0.18, y: -0.02, z: -0.09 }, "#429455", { x: -0.2, y: 1.9, z: 0.5 })),
  ),
  seasonal(
    "grass",
    flat(cone(0.15, 0.46, 4, { x: 0.07, y: -0.05, z: -0.21 }, "#4ca35f", { x: 0.46, y: 2.8, z: -0.16 })),
  ),
  seasonal(
    "grass",
    flat(cone(0.14, 0.4, 4, { x: -0.13, y: -0.07, z: 0.19 }, "#3f9455", { x: -0.44, y: 3.6, z: 0.22 })),
  ),
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
 * 全キャラクター共通の基本の体（Issue #332）。足・胴・手・頭の4種類だけでできた素体。
 *
 * 各キャラクターは、この体に耳・顔・しっぽなどのパーツを**足していく**ことで個性を出す。
 * 体の寸法を揃えておくことで、着せ替え品の位置合わせをキャラクターごとにやり直さずに済む
 * （アンカーは catalog.ts の `BASE_BODY_ANCHORS`）。
 *
 * 守る制約（Issue #287 から引き継ぐ）。
 *   - 当たり判定の直径（0.9）に収まる横幅（最大は頭の0.8）。町では `PLAYER_SCALE` 倍で描くが、
 *     大きくするのは見た目だけで、当たり判定（半径0.45）は広げない（movement.ts）
 *   - 足底は y = -0.34、頭のてっぺんは y = 0.62（全体の高さ0.96）
 *   - 正面は +Z。住人（VILLAGER_PARTS）と同じ向きで、進む向きへ回すときも同じ計算
 *     （`Math.atan2(dx, dz)`）が使える
 *   - カメラ（+X+Z から見下ろす）に映るのは上面と +X面・+Z面の3つだけ。個性を出すパーツは
 *     その3面に寄せる
 *
 * 寸法は足の一辺（0.16）を単位にしてある（胴の幅は3個分、頭のはみ出しは1個分）。
 *
 * **色の差し替え枠。** すべて `skin`（体の地の色）。全キャラクター共通で、枠の意味は次のとおり。
 *   - `skin` … 体の地の色（基本の体と、耳・しっぽなど体と同じ色のパーツ）
 *   - `accent` … 地の色より濃い（または目立つ）差し色（模様・耳の内側・鼻など）
 *   - `hair` … 使わない
 * 目・おなかなど、どの色でも顔や体の向きが見分けられてほしいパーツは枠を付けず固定色にする。
 *
 * @param color - 体の地の色（パレット未指定のときに使う既定色）
 * @returns 基本の体のパーツ一覧
 */
export function createBaseBodyParts(color: string): BuildingPart[] {
  return [
    // 足。一辺0.16の立方体を左右に1つずつ置く。底面を足底（y = -0.34）に合わせる。
    // 足どうしの間は足1個分（0.16）空ける。足を3つ並べて真ん中だけ抜いた並びになる
    ...[-0.16, 0.16].map((x) => withSlot(box(0.16, 0.16, 0.16, { x, y: -0.26, z: 0 }, color), "skin")),
    // 胴。二足歩行で立つので縦長にする。横幅は左右の足の外側どうし（0.48）に揃え、
    // 底面を足の上面（y = -0.18）に載せる
    withSlot(box(0.48, 0.4, 0.32, { x: 0, y: 0.02, z: 0 }, color), "skin"),
    // 手。足と同じ一辺0.16の立方体を、胴の左右の面にくっつける（胴の端 0.24 + 0.08）。
    // 高さは胴の中ほどよりやや上（y = -0.02〜0.14）
    ...[-0.32, 0.32].map((x) => withSlot(box(0.16, 0.16, 0.16, { x, y: 0.06, z: 0 }, color), "skin")),
    // 頭。胴より横幅・奥行きを大きくして、頭でっかちのゆるキャラらしい比率にする。
    // 横長にし、左右へ足1個分（0.16）ずつはみ出させる。底面を胴の上面（y = 0.22）に載せる。てっぺんは y = 0.62
    withSlot(box(0.8, 0.4, 0.56, { x: 0, y: 0.42, z: 0 }, color), "skin"),
  ];
}

/**
 * 基本の体に付ける、共通の目（Issue #332）。
 *
 * 縦長の薄い黒い板を、頭の正面（z = 0.28）に貼る（板の前面は z = 0.3）。
 * 正面と同じ位置に置くと面が重なってちらつくため、厚み0.02ぶん前へ出す。
 * 体の色に関わらず顔が見分けられるよう、色の差し替え枠は付けない。
 *
 * 目の位置を全キャラクターで揃えることで、めがねなど顔の着せ替え品の位置
 * （catalog.ts の `BASE_BODY_ANCHORS.face`）を共通にできる。
 *
 * @returns 左右の目のパーツ
 */
export function createBaseEyeParts(): BuildingPart[] {
  return [-0.18, 0.18].map((x) => box(0.08, 0.12, 0.02, { x, y: 0.42, z: 0.29 }, "#1e2b1a"));
}

/**
 * プレイヤー（カエル）。基本の体（createBaseBodyParts）にカエルらしいパーツを足したもの（Issue #332）。
 *
 * ほかのキャラクターと違い、目を頭の正面ではなく**頭の上のふくらみ**に付ける。
 * 上から見下ろすカメラでも、目が頭の上に飛び出しているのがカエルらしさの一番の手がかりになるため。
 * そのぶん、顔・頭の着せ替え品のアンカーはカエルだけ別の値にしてある（catalog.ts の `player`）。
 *
 *   - 口は、頭より一回り大きい薄い帯にして、+X面と+Z面へぐるりと回り込ませる
 *   - おなか（のど）はクリーム色の固定色にして、胴の正面に貼る
 *   - 頭の上と背中に、濃い色の斑点を不揃いに散らす
 *
 * **色の差し替え枠。** `skin` … 体の明るい緑（体・目のふくらみ）／`accent` … 濃い緑（口・斑点）。
 * 目・おなかは固定。
 */
export const PLAYER_PARTS: BuildingPart[] = [
  ...createBaseBodyParts("#4fae3f"),
  // 目のふくらみ。頭の上面（y = 0.62）の左右の前寄りに、箱を載せる（y = 0.62〜0.78、z = 0.12〜0.28）。
  // 前面は頭の正面と揃え、帽子の山（頭のアンカーの後ろ寄り）と重ならないよう間を空ける
  ...[-0.26, 0.26].map((x) => withSlot(box(0.2, 0.16, 0.16, { x, y: 0.7, z: 0.2 }, "#4fae3f"), "skin")),
  // 目。ふくらみの正面に、共通の目より少し低い黒い板を貼る（前面は z = 0.3）
  ...[-0.26, 0.26].map((x) => box(0.08, 0.1, 0.02, { x, y: 0.7, z: 0.29 }, "#1e2b1a")),
  // 口。頭（0.8 × 0.56）より一回り大きい薄い帯にして、頭の正面・左右の面へ回り込ませる
  withSlot(box(0.82, 0.03, 0.58, { x: 0, y: 0.32, z: 0 }, "#2f7a2a"), "accent"),
  // おなか（のど）。胴の正面（z = 0.16）に貼る
  box(0.32, 0.24, 0.02, { x: 0, y: 0, z: 0.17 }, "#f7e9c4"),
  // 斑点。頭の上面の後ろ寄りに、大きさと位置を不揃いにして散らす（のっぺりした箱に見えないように）
  withSlot(box(0.12, 0.02, 0.12, { x: -0.18, y: 0.63, z: -0.14 }, "#2f7a2a"), "accent"),
  withSlot(box(0.08, 0.02, 0.08, { x: 0.16, y: 0.63, z: -0.18 }, "#2f7a2a"), "accent"),
  withSlot(box(0.06, 0.02, 0.06, { x: 0.02, y: 0.63, z: -0.02 }, "#2f7a2a"), "accent"),
  // 背中（胴の背面 z = -0.16）にも2つ
  withSlot(box(0.1, 0.1, 0.02, { x: -0.1, y: 0.08, z: -0.17 }, "#2f7a2a"), "accent"),
  withSlot(box(0.08, 0.08, 0.02, { x: 0.12, y: -0.04, z: -0.17 }, "#2f7a2a"), "accent"),
];

/**
 * プレイヤー（うさぎ）。基本の体（createBaseBodyParts）にうさぎらしいパーツを足したもの（Issue #332）。
 *
 * 長い耳が特徴なので、頭の上面から高く立てて、見下ろすカメラにも大きく映るようにしている。
 * 耳の先は y = 1.05 まで伸び、ほかのキャラクターより背が高い。
 *
 * **色の差し替え枠。** `skin` … 体の白（体・耳）／`accent` … ピンク（耳の内側・鼻・ほお）。
 * 目・しっぽは固定。
 */
export const RABBIT_PARTS: BuildingPart[] = [
  ...createBaseBodyParts("#fdf7ee"),
  // 耳。長い箱を頭の上面に立て、左右それぞれ外側へ少し倒す（Z軸回転でX方向に傾ける）。
  // 縦長の箱は、上端を +X へ動かすのに負のZ回転が要る（横長のMUSTACHE_PARTSとは符号が逆）
  ...[-1, 1].map((side) =>
    withSlot(box(0.14, 0.44, 0.1, { x: side * 0.18, y: 0.83, z: 0 }, "#fdf7ee", { x: 0, y: 0, z: -side * 0.12 }), "skin"),
  ),
  // 耳の内側。耳の正面（z = 0.05）に貼り、耳と同じだけ傾ける
  ...[-1, 1].map((side) =>
    withSlot(box(0.08, 0.34, 0.02, { x: side * 0.18, y: 0.83, z: 0.06 }, "#f5b8c8", { x: 0, y: 0, z: -side * 0.12 }), "accent"),
  ),
  ...createBaseEyeParts(),
  // 鼻。目の間の下、頭の正面に貼る
  withSlot(box(0.06, 0.04, 0.02, { x: 0, y: 0.34, z: 0.29 }, "#e07ba0"), "accent"),
  // ほお。目の外側の下に、横長の薄い板を貼る
  ...[-0.28, 0.28].map((x) => withSlot(box(0.08, 0.04, 0.02, { x, y: 0.34, z: 0.29 }, "#f5b8c8"), "accent")),
  // しっぽ（綿毛）。胴の背中の下寄りに立方体を付ける（z = -0.16〜-0.32）
  box(0.16, 0.16, 0.16, { x: 0, y: -0.06, z: -0.24 }, "#ffffff"),
];

/**
 * プレイヤー（ねこ）。基本の体（createBaseBodyParts）にねこらしいパーツを足したもの（Issue #332）。
 *
 * **色の差し替え枠。** `skin` … 体の明るい橙（体・耳・しっぽ）／`accent` … 濃い橙（しま模様・しっぽの先）。目・ひげは固定。
 */
export const PLAYER_CAT_PARTS: BuildingPart[] = [
  ...createBaseBodyParts("#e8934a"),
  // 耳。底面が一辺0.24の四角錐（正面から見て三角形）を、頭の上面（y = 0.62）に載せる。
  // 45度回して底面の辺を頭の辺と平行にし、角ばった体となじませる。
  // 前後は頭の真ん中（z = 0）に置く
  ...[-0.26, 0.26].map((x) =>
    withSlot(cone(0.24 * Math.SQRT2, 0.24, 4, { x, y: 0.74, z: 0 }, "#e8934a", { x: 0, y: Math.PI / 4, z: 0 }), "skin"),
  ),
  ...createBaseEyeParts(),
  // しま模様。体より濃い色の細い板を、カメラに映る頭の上面と左右の面に貼る。
  // 色の差し替え枠を `accent` にして、体の色（skin）を変えても模様だけ別の色を選べるようにする。
  // 頭の上面（y = 0.62）には、耳の間（x = ±0.14 の内側）に前後向きの3本を、耳より前寄りに置く
  ...[-0.08, 0, 0.08].map((x) =>
    withSlot(box(0.04, 0.02, 0.2, { x, y: 0.63, z: 0.14 }, "#c9702a"), "accent"),
  ),
  // 頭の左右の面（x = ±0.4）には、横向きの2本ずつを後ろ寄りに置く（前寄りはひげと重なるため）
  ...[-1, 1].flatMap((side) =>
    [0.44, 0.52].map((y) =>
      withSlot(box(0.02, 0.04, 0.16, { x: side * 0.41, y, z: -0.08 }, "#c9702a"), "accent"),
    ),
  ),
  // 胴の背中（z = -0.16）には、横向きの3本を貼る。いちばん下の1本は、しっぽの付け根より上に収める
  ...[0.16, 0.08, 0].map((y) =>
    withSlot(box(0.32, 0.04, 0.02, { x: 0, y, z: -0.17 }, "#c9702a"), "accent"),
  ),
  // しっぽ。太さ0.08の角材を、胴の背中の下寄りから後ろへ伸ばし（z = -0.16〜-0.36）、
  // 根元を重ねて上へ立ち上げる（y = -0.12〜0.2）。真上から見ても頭の後ろに先が出るよう、
  // 先端は頭の底（y = 0.22）より上まで伸ばし、模様と同じ濃い色にする
  withSlot(box(0.08, 0.08, 0.2, { x: 0, y: -0.08, z: -0.26 }, "#e8934a"), "skin"),
  withSlot(box(0.08, 0.32, 0.08, { x: 0, y: 0.04, z: -0.32 }, "#e8934a"), "skin"),
  withSlot(box(0.08, 0.08, 0.08, { x: 0, y: 0.24, z: -0.32 }, "#c9702a"), "accent"),
  // ひげ。細長い板を、目の下のほお（頭の正面）に左右2本ずつ貼る（目と同じく前面は z = 0.3）。
  // 外側の端を頭の横（0.4）より少しはみ出させて、真上から見ても見えるようにする。
  // 上の1本は外側を上へ、下の1本は外側を下へ傾けて、扇形に開かせる
  ...[-1, 1].flatMap((side) =>
    [
      { tilt: 0.15, y: 0.32 },
      { tilt: -0.15, y: 0.26 },
    ].map((whisker) =>
      box(0.2, 0.02, 0.02, { x: side * 0.34, y: whisker.y, z: 0.29 }, "#1e2b1a", { x: 0, y: 0, z: side * whisker.tilt }),
    ),
  ),
];

/**
 * プレイヤー（ハムスター）。基本の体（createBaseBodyParts）にハムスターらしいパーツを足したもの（Issue #332）。
 *
 * 丸い耳（ねこの三角耳と対比させる）と、正面に張り出したほおぶくろ・おなかのクリーム色で、
 * ほかのキャラクターとシルエットを変えている。しっぽは持たせない。
 *
 * **色の差し替え枠。** `skin` … 体の明るい茶（体・耳）／`accent` … 濃い茶（耳の内側・鼻・背中の筋）。
 * 目・ほおぶくろ・おなかは固定（以前は `hair` だったが、全キャラクターで枠の意味を揃えるため固定色にした）。
 */
export const PLAYER_HAMSTER_PARTS: BuildingPart[] = [
  ...createBaseBodyParts("#d9a24b"),
  // 耳。丸い板（円柱を X軸まわりに90度起こして正面へ向けたもの）を頭の上面に立てる。
  // 下半分を頭に埋めて、上へ半円がのぞくようにする（中心 y = 0.66、半径0.09）
  ...[-0.28, 0.28].map((x) =>
    withSlot(cylinder(0.18, 0.18, 0.06, 16, { x, y: 0.66, z: -0.04 }, "#d9a24b", { x: Math.PI / 2, y: 0, z: 0 }), "skin"),
  ),
  // 耳の内側。耳の正面（z = -0.01）に、ひとまわり小さい丸い板を貼る
  ...[-0.28, 0.28].map((x) =>
    withSlot(cylinder(0.1, 0.1, 0.02, 16, { x, y: 0.66, z: 0 }, "#c9852f", { x: Math.PI / 2, y: 0, z: 0 }), "accent"),
  ),
  ...createBaseEyeParts(),
  // 鼻。目の間の下、頭の正面に貼る
  withSlot(box(0.06, 0.04, 0.02, { x: 0, y: 0.34, z: 0.29 }, "#7a4a3a"), "accent"),
  // ほおぶくろ。目の外側の下に、厚みのある板を張り出させる（z = 0.28〜0.32）
  ...[-0.26, 0.26].map((x) => box(0.16, 0.12, 0.04, { x, y: 0.3, z: 0.3 }, "#f6e6c8")),
  // おなか。胴の正面（z = 0.16）に貼る
  box(0.32, 0.28, 0.02, { x: 0, y: 0, z: 0.17 }, "#f6e6c8"),
  // 背中の筋。頭の上面の真ん中から後ろへ、胴の背中へ続く濃い色の帯
  withSlot(box(0.16, 0.02, 0.36, { x: 0, y: 0.63, z: -0.08 }, "#c9852f"), "accent"),
  withSlot(box(0.16, 0.32, 0.02, { x: 0, y: 0.04, z: -0.17 }, "#c9852f"), "accent"),
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

/** 王冠。ぎざぎざを5つ並べ、正面に宝石を1つ載せる（Issue #235）。 */
export const CROWN_PARTS: BuildingPart[] = [
  // 土台の輪
  cylinder(0.5, 0.46, 0.14, 16, { x: 0, y: 0.07, z: 0 }, "#fbbf24"),
  // ぎざぎざ。5つを輪の上に等間隔で並べる。
  // 配置半径は土台の輪の上端の半径（diameterTop 0.5 → 半径0.25）に合わせる。
  // 0.4のままだと輪の外側に浮いてしまい、土台とつながって見えない（1R0Uさんレビュー指摘）。
  ...[0, 1, 2, 3, 4].map((i) => {
    const angle = (i / 5) * Math.PI * 2;
    return cone(0.14, 0.18, 4, { x: Math.sin(angle) * 0.25, y: 0.23, z: Math.cos(angle) * 0.25 }, "#fbbf24");
  }),
  // 正面の宝石
  sphere(0.09, 0.09, 0.09, 10, { x: 0, y: 0.16, z: 0.42 }, "#ef4444"),
];

/**
 * つば付きのキャップ（Issue #300）。アンカーの真上に載る向きで、山の底が y = 0。
 *
 * HAT_PARTS（山高帽寄り）と違い、円形のつば（帽子全体を覆う縁）を持たない。
 * かわりに、前方（+Z、顔の向いている方向）だけへ突き出す平たいつば（バイザー）にする。
 * カメラは見下ろし視点なので、山の上面とつばの上面・前面がどちらもよく見える。
 */
export const CAP_PARTS: BuildingPart[] = [
  // 山。半球（つぶした球）で丸みを出す
  sphere(0.62, 0.4, 0.62, 16, { x: 0, y: 0.2, z: 0 }, "#1d4ed8"),
  // 山の縁（帯）。山と頭の境目に巻いて区切りを出す（HAT_PARTSのリボンと同じ役目）
  cylinder(0.62, 0.62, 0.05, 16, { x: 0, y: 0.03, z: 0 }, "#1e3a8a"),
  // つば（バイザー）。山の前面から前方へ突き出す、平たい板
  box(0.5, 0.06, 0.28, { x: 0, y: 0.1, z: 0.45 }, "#1e3a8a"),
  // てっぺんのボタン（野球帽らしさの手がかり）
  sphere(0.08, 0.08, 0.08, 10, { x: 0, y: 0.4, z: 0 }, "#1e3a8a"),
];

/**
 * 麦わら帽子（Issue #300）。アンカーの真上に載る向きで、つばの下端が y = 0。
 *
 * HAT_PARTS / CAP_PARTS と違い、つばを広く平らにして麦わら帽子らしさを出す。
 * 山は低めのドームにして、農作業・浜辺で被る帽子の輪郭に寄せている。
 */
export const STRAW_HAT_PARTS: BuildingPart[] = [
  // つば。広く平ら
  cylinder(0.95, 0.95, 0.045, 20, { x: 0, y: 0.0225, z: 0 }, "#e3c16f"),
  // 山。低めのドーム
  cylinder(0.4, 0.46, 0.22, 16, { x: 0, y: 0.155, z: 0 }, "#d1a94e"),
  // 山の縁の帯。麦わら帽子らしい焦げ茶のリボン
  cylinder(0.42, 0.42, 0.05, 16, { x: 0, y: 0.07, z: 0 }, "#7a4a24"),
];

/**
 * サンタの帽子（Issue #300）。アンカーの真上に載る向きで、縁の毛皮の下端が y = 0。
 *
 * 山（三角の部分）は後方（-Z、顔と逆方向）へ傾けて垂らし、先端に白い玉を付けて
 * サンタ帽子らしい「垂れ」を表現する。傾ける角度・玉の位置は見た目合わせの近似値。
 */
export const SANTA_HAT_PARTS: BuildingPart[] = [
  // 縁の毛皮
  cylinder(0.62, 0.62, 0.14, 16, { x: 0, y: 0.07, z: 0 }, "#f8fafc"),
  // 山。後方へ傾けて垂らす
  cone(0.56, 0.62, 16, { x: 0, y: 0.38, z: -0.05 }, "#dc2626", { x: -0.5, y: 0, z: 0.25 }),
  // 先端の白い玉。山の回転（x: -0.5, z: 0.25）で先端が -X 側へ倒れるのに合わせる
  // （1R0Uレビュー対応：+X 側に置くと先端から離れて浮いて見える）
  sphere(0.16, 0.16, 0.16, 10, { x: -0.08, y: 0.64, z: -0.2 }, "#f8fafc"),
];

/**
 * ニット帽（Issue #300）。アンカーの真上に載る向きで、折り返しの下端が y = 0。
 *
 * 折り返し（cuff）とドーム状の山だけの、装飾の少ないシンプルな形にしている。
 */
export const KNIT_HAT_PARTS: BuildingPart[] = [
  // 折り返し（頭に巻く帯）
  cylinder(0.64, 0.68, 0.14, 16, { x: 0, y: 0.07, z: 0 }, "#374151"),
  // 山。ドーム状
  sphere(0.62, 0.5, 0.62, 16, { x: 0, y: 0.39, z: 0 }, "#4b5563"),
  // てっぺんの小さい玉
  sphere(0.1, 0.1, 0.1, 10, { x: 0, y: 0.64, z: 0 }, "#374151"),
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
 * サングラス（Issue #300）。GLASSES_PARTSと骨格は同じ。
 *
 * レンズが輪だけの GLASSES_PARTS と違い、中まで塗りつぶした色付きのレンズにして
 * 「向こうが透けない」印象にする。
 */
export const SUNGLASSES_PARTS: BuildingPart[] = [
  // レンズ。塗りつぶし
  ...[-0.25, 0.25].map((x) => sphere(0.28, 0.26, 0.05, 16, { x, y: 0, z: 0 }, "#111827")),
  // ブリッジ
  box(0.22, 0.03, 0.03, { x: 0, y: 0, z: 0 }, "#111827"),
  // つる。左右へ後ろ向きに伸ばす
  ...[-0.37, 0.37].map((x) => box(0.03, 0.03, 0.2, { x, y: 0, z: -0.12 }, "#111827")),
];

/**
 * 眼帯（Issue #300）。GLASSES_PARTSと同じ目の高さ（y = 0）を基準にする。
 *
 * 左目（x = -0.25、GLASSES_PARTSのレンズと同じ位置）だけを覆い、反対側の頬まで
 * 帯を渡す。
 */
export const EYEPATCH_PARTS: BuildingPart[] = [
  // 覆う部分。左目だけを覆う
  box(0.24, 0.22, 0.05, { x: -0.25, y: 0, z: 0.02 }, "#111827"),
  // 帯。反対側の頬まで少し斜めに渡す
  box(0.62, 0.05, 0.03, { x: 0.02, y: 0.03, z: -0.02 }, "#111827", { x: 0, y: 0, z: 0.12 }),
];

/**
 * つけひげ（Issue #300）。GLASSES_PARTSより下（口の高さ、y が負の側）に置く。
 *
 * 中央の一本と、外側へカールする左右2本の組み合わせ。
 */
export const MUSTACHE_PARTS: BuildingPart[] = [
  // 中央
  box(0.22, 0.05, 0.04, { x: 0, y: -0.16, z: 0.03 }, "#1f2937"),
  // 両端。外側へ広がりながら上へカールする（1R0Uレビュー対応：符号が逆で下がっていた）
  ...[-1, 1].map((side) =>
    box(0.16, 0.05, 0.04, { x: side * 0.19, y: -0.13, z: 0.03 }, "#1f2937", {
      x: 0,
      y: 0,
      z: side * 0.5,
    }),
  ),
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
  seasonal("needle", cone(1.5, 0.95, 10, { x: 0, y: 0.05, z: 0 }, "#2a6b46")),
  seasonal("needle", cone(1.16, 0.8, 10, { x: 0, y: 0.62, z: 0 }, "#31784f")),
  seasonal("needle", cone(0.82, 0.7, 10, { x: 0, y: 1.18, z: 0 }, "#38855a")),
];

/** ひょろ長い木。幹を高くして、葉のかたまりを上へ寄せる。 */
export const TREE_TALL_PARTS: BuildingPart[] = [
  cylinder(0.15, 0.3, 1.35, 10, { x: 0, y: -0.22, z: 0 }, "#7a5738"),
  seasonal("foliage", sphere(1.1, 1, 1.05, 14, { x: 0, y: 0.78, z: 0 }, "#2f7a4e")),
  seasonal("foliage", sphere(0.8, 0.72, 0.76, 12, { x: 0.22, y: 1.24, z: -0.1 }, "#37905c")),
  seasonal("foliage", sphere(0.6, 0.55, 0.58, 10, { x: -0.24, y: 1.08, z: 0.2 }, "#2a6f47")),
];

/** 若木。低くて丸い。 */
export const TREE_YOUNG_PARTS: BuildingPart[] = [
  cylinder(0.12, 0.2, 0.55, 8, { x: 0, y: -0.27, z: 0 }, "#7a5738"),
  seasonal("foliage", sphere(0.86, 0.72, 0.82, 12, { x: 0, y: 0.3, z: 0 }, "#379657")),
  seasonal("foliage", sphere(0.6, 0.5, 0.56, 10, { x: 0.2, y: 0.55, z: -0.1 }, "#43a566")),
];

/** 広がった低木。地面を這うように低く、横に大きい。 */
export const BUSH_WIDE_PARTS: BuildingPart[] = [
  seasonal("foliage", sphere(1.3, 0.6, 1.16, 14, { x: 0, y: 0, z: 0 }, "#3a8a56")),
  seasonal("foliage", sphere(0.9, 0.46, 0.82, 12, { x: 0.36, y: -0.06, z: 0.24 }, "#469a63")),
  seasonal("foliage", sphere(0.7, 0.38, 0.64, 10, { x: -0.34, y: -0.07, z: -0.2 }, "#327d4c")),
  seasonal(
    "foliage",
    flat(cone(0.12, 0.44, 4, { x: 0.3, y: 0.2, z: -0.22 }, "#4fa86b", { x: 0.2, y: 0, z: -0.4 })),
  ),
];

/** 立ち上がった低木。葉先を多めに出す。 */
export const BUSH_TALL_PARTS: BuildingPart[] = [
  seasonal("foliage", sphere(0.8, 0.9, 0.78, 14, { x: 0, y: 0.05, z: 0 }, "#3a8a56")),
  seasonal("foliage", sphere(0.56, 0.6, 0.54, 12, { x: 0.24, y: -0.16, z: 0.18 }, "#469a63")),
  seasonal(
    "foliage",
    flat(cone(0.13, 0.54, 4, { x: 0.2, y: 0.42, z: -0.16 }, "#4fa86b", { x: 0.16, y: 0, z: -0.36 })),
  ),
  seasonal(
    "foliage",
    flat(cone(0.12, 0.48, 4, { x: -0.22, y: 0.38, z: 0.18 }, "#44a062", { x: -0.2, y: 0.9, z: 0.42 })),
  ),
  seasonal(
    "foliage",
    flat(cone(0.11, 0.42, 4, { x: 0.04, y: 0.46, z: 0.22 }, "#57b06c", { x: 0.34, y: 2.1, z: 0.1 })),
  ),
];

/** 実のなった低木。赤い実で色味を足す。 */
export const BUSH_BERRY_PARTS: BuildingPart[] = [
  seasonal("foliage", sphere(1, 0.78, 0.94, 14, { x: 0, y: 0, z: 0 }, "#357f4e")),
  seasonal("foliage", sphere(0.7, 0.58, 0.66, 12, { x: -0.28, y: -0.06, z: 0.22 }, "#3f9159")),
  box(0.12, 0.12, 0.12, { x: 0.22, y: 0.3, z: 0.14 }, "#d1453f"),
  box(0.11, 0.11, 0.11, { x: -0.16, y: 0.24, z: -0.26 }, "#e05a4c"),
  box(0.1, 0.1, 0.1, { x: 0.3, y: 0.12, z: -0.2 }, "#c33b36"),
  seasonal(
    "foliage",
    flat(cone(0.11, 0.44, 4, { x: -0.3, y: 0.28, z: -0.1 }, "#4fa86b", { x: -0.18, y: 0.6, z: 0.4 })),
  ),
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
  seasonal(
    "grass",
    flat(cone(0.18, 0.44, 4, { x: 0, y: 0, z: 0 }, "#4ca35f", { x: 0.3, y: 0, z: 0.26 })),
  ),
  seasonal(
    "grass",
    flat(cone(0.17, 0.4, 4, { x: 0.26, y: -0.02, z: 0.14 }, "#58b26c", { x: 0.26, y: 0.8, z: -0.5 })),
  ),
  seasonal(
    "grass",
    flat(cone(0.16, 0.36, 4, { x: -0.24, y: -0.03, z: -0.12 }, "#429455", { x: -0.3, y: 1.9, z: 0.52 })),
  ),
  seasonal(
    "grass",
    flat(cone(0.15, 0.34, 4, { x: 0.1, y: -0.04, z: -0.28 }, "#4ca35f", { x: 0.5, y: 2.8, z: -0.2 })),
  ),
  seasonal(
    "grass",
    flat(cone(0.14, 0.3, 4, { x: -0.18, y: -0.05, z: 0.26 }, "#3f9455", { x: -0.48, y: 3.6, z: 0.3 })),
  ),
  seasonal(
    "grass",
    flat(cone(0.13, 0.28, 4, { x: 0.3, y: -0.06, z: -0.2 }, "#57b06c", { x: 0.2, y: 4.4, z: -0.44 })),
  ),
];

/** 背の高い草むら。細い葉をまっすぐ立てる。 */
export const GRASS_TALL_PARTS: BuildingPart[] = [
  seasonal(
    "grass",
    flat(cone(0.14, 0.92, 4, { x: 0, y: 0.18, z: 0 }, "#4ca35f", { x: 0.06, y: 0, z: 0.08 })),
  ),
  seasonal(
    "grass",
    flat(cone(0.13, 0.8, 4, { x: 0.14, y: 0.12, z: 0.08 }, "#58b26c", { x: 0.08, y: 0.9, z: -0.16 })),
  ),
  seasonal(
    "grass",
    flat(cone(0.12, 0.7, 4, { x: -0.13, y: 0.07, z: -0.06 }, "#429455", { x: -0.1, y: 2, z: 0.2 })),
  ),
  seasonal(
    "grass",
    flat(cone(0.11, 0.58, 4, { x: 0.05, y: 0.02, z: -0.16 }, "#3f9455", { x: 0.22, y: 3, z: -0.1 })),
  ),
];

/** 花の咲いた草むら。 */
export const GRASS_FLOWER_PARTS: BuildingPart[] = [
  seasonal(
    "grass",
    flat(cone(0.17, 0.56, 4, { x: 0, y: 0.02, z: 0 }, "#4ca35f", { x: 0.12, y: 0, z: 0.16 })),
  ),
  seasonal(
    "grass",
    flat(cone(0.15, 0.48, 4, { x: 0.18, y: -0.02, z: 0.1 }, "#58b26c", { x: 0.14, y: 0.9, z: -0.42 })),
  ),
  seasonal(
    "grass",
    flat(cone(0.14, 0.42, 4, { x: -0.17, y: -0.04, z: -0.08 }, "#429455", { x: -0.2, y: 2, z: 0.46 })),
  ),
  box(0.12, 0.12, 0.12, { x: 0.06, y: 0.3, z: -0.14 }, "#f6d365"),
  box(0.11, 0.11, 0.11, { x: -0.2, y: 0.22, z: 0.16 }, "#ef8fb7"),
  box(0.1, 0.1, 0.1, { x: 0.24, y: 0.18, z: 0.2 }, "#e9e6ef"),
];

/**
 * 季節の地面の飾り（Issue #282）。季節に合わせて町じゅうの地面に散らす。
 *
 * どれも**地面に貼りつく薄い物**にする。踏んで歩く場所に置くため、背が高いと
 * 足もとを隠してしまう。散らし方は lib/rpg-hub/seasonalDecorations.ts が決める。
 */

/** 春。地面に散った桜の花びら。 */
export const SEASON_PETALS_PARTS: BuildingPart[] = [
  { color: "#f9c6d6", x: -0.32, z: -0.18, y: 0.4 },
  { color: "#f7b3c9", x: 0.12, z: -0.3, y: 1.3 },
  { color: "#fbd7e3", x: 0.34, z: 0.08, y: 2.2 },
  { color: "#f4a6c0", x: -0.08, z: 0.22, y: 0.9 },
  { color: "#fbd7e3", x: -0.4, z: 0.3, y: 2.7 },
  { color: "#f7b3c9", x: 0.26, z: 0.38, y: 1.8 },
].map((petal) =>
  box(0.13, 0.02, 0.09, { x: petal.x, y: 0, z: petal.z }, petal.color, { x: 0, y: petal.y, z: 0 }),
);

/** 秋。地面に積もった落ち葉。赤・橙・黄を混ぜる。 */
export const SEASON_LEAVES_PARTS: BuildingPart[] = [
  { color: "#d9602b", x: -0.3, z: -0.2, y: 0.3 },
  { color: "#e8a33a", x: 0.1, z: -0.34, y: 1.1 },
  { color: "#c2412d", x: 0.36, z: 0.02, y: 2.4 },
  { color: "#e58a2f", x: -0.04, z: 0.14, y: 0.7 },
  { color: "#f0c24a", x: -0.38, z: 0.34, y: 2 },
  { color: "#d9602b", x: 0.22, z: 0.36, y: 2.9 },
  { color: "#b8452e", x: 0.02, z: -0.06, y: 1.6 },
].map((leaf) =>
  box(0.2, 0.025, 0.13, { x: leaf.x, y: 0, z: leaf.z }, leaf.color, { x: 0, y: leaf.y, z: 0 }),
);

/**
 * 冬。地面に積もった雪だまり。
 *
 * 平たくつぶした球を地面へ半分ほど埋め、上の丸みだけを見せる。大小2つを寄せて、
 * 輪郭が単純な楕円にならないようにしている。
 */
export const SEASON_SNOW_PARTS: BuildingPart[] = [
  sphere(1.5, 0.2, 1.1, 14, { x: 0, y: 0, z: 0 }, "#f4f8fb"),
  sphere(0.9, 0.16, 0.8, 12, { x: 0.52, y: 0, z: 0.34 }, "#eaf1f7"),
];

/**
 * 未知のアセットIDに対するフォールバックの形。
 * 対応づけは catalog.ts が持つが、`box` はこのファイルの内部ヘルパーなので形はここに置く。
 */
export const FALLBACK_PARTS: BuildingPart[] = [
  box(2.6, 2.4, 2.2, { x: 0, y: 0, z: 0 }, "#94a3b8"),
];
