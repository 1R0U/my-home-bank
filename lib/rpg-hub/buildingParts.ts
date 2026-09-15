// RPGハブに登場する建物・装飾の見た目を、3Dエンジンに依存しないデータとして定義する。
//
// WebView 側のシーン（webview/rpg-hub/scene.ts）が、この定義を読んで Babylon の
// MeshBuilder で組み立てる。形状の定義をここに1つだけ持つことで、描画側を差し替えても
// 見た目の定義が二重にならない（元は R3F 版の JSX に直接書かれていた）。
//
// 座標・寸法の単位はワールド座標の 1 = 1m 相当。position / rotation はオブジェクトの
// ローカル原点から見た値で、rotation はラジアン。

import { RPG_HUB_ASSETS } from "./assets.ts";
import type { AssetId, PaletteSlot } from "../../types/map";

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

type PartGeometry = BoxPart | ConePart | CylinderPart | TorusPart;

/** 建物・装飾を構成するパーツ1つ分。 */
export type BuildingPart = PartGeometry & {
  /** 16進カラーコード（#rrggbb）。 */
  color: string;
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

const torus = (
  diameter: number,
  thickness: number,
  position: { x: number; y: number; z: number },
  color: string,
  rotation?: { x: number; y: number; z: number },
): BuildingPart => ({ color, diameter, position, rotation, shape: "torus", thickness });

const QUARTER_TURN = Math.PI / 4;
const RIGHT_ANGLE = Math.PI / 2;

/** 銀行。白い柱と金色の時計が目印。 */
const BANK_PARTS: BuildingPart[] = [
  box(2.8, 1.8, 2.1, { x: 0, y: -0.3, z: 0 }, "#dbeafe"),
  box(3, 0.24, 2.3, { x: 0, y: 0.72, z: 0 }, "#2563a8"),
  cone(3.1, 0.55, 4, { x: 0, y: 0.98, z: 0.08 }, "#f8fafc", { x: 0, y: QUARTER_TURN, z: 0 }),
  // 正面の2本の柱（柱本体と上下の装飾）
  ...[-0.92, 0.92].flatMap((x): BuildingPart[] => [
    cylinder(0.32, 0.4, 1.55, 10, { x, y: -0.12, z: 1.12 }, "#f8fafc"),
    box(0.45, 0.14, 0.42, { x, y: 0.72, z: 1.12 }, "#fbbf24"),
    box(0.46, 0.14, 0.44, { x, y: -0.96, z: 1.12 }, "#fbbf24"),
  ]),
  box(0.72, 1.15, 0.08, { x: 0, y: -0.45, z: 1.08 }, "#1e3a5f"),
  cylinder(0.68, 0.68, 0.1, 16, { x: 0, y: 1.38, z: 0.78 }, "#fbbf24", {
    x: RIGHT_ANGLE,
    y: 0,
    z: 0,
  }),
  box(0.08, 0.38, 0.04, { x: 0, y: 1.44, z: 0.84 }, "#fff7cc"),
];

/** ストア。赤い屋根と縞模様の日よけが目印。 */
const STORE_PARTS: BuildingPart[] = [
  box(2.7, 1.8, 2, { x: 0, y: -0.3, z: 0 }, "#fff3d6"),
  cone(3.24, 0.95, 4, { x: 0, y: 0.92, z: 0 }, "#dc5a3f", { x: 0, y: QUARTER_TURN, z: 0 }),
  box(2.85, 0.18, 0.7, { x: 0, y: 0.18, z: 1.14 }, "#f8fafc", { x: 0.14, y: 0, z: 0 }),
  // 日よけの縞模様
  ...[-1.08, -0.54, 0, 0.54, 1.08].map((x, index) =>
    box(0.3, 0.2, 0.72, { x, y: 0.19, z: 1.2 }, index % 2 === 0 ? "#ef6a4e" : "#fff7ed", {
      x: 0.14,
      y: 0,
      z: 0,
    }),
  ),
  box(0.82, 0.88, 0.08, { x: -0.68, y: -0.48, z: 1.03 }, "#7dd3fc"),
  box(0.68, 1.16, 0.08, { x: 0.68, y: -0.48, z: 1.03 }, "#9a4d2e"),
  box(1.45, 0.44, 0.12, { x: 0, y: 1.32, z: 0.82 }, "#f59e0b"),
  torus(0.26, 0.09, { x: 0, y: 1.32, z: 0.9 }, "#fff7ed"),
];

/** おてつだい。紫の屋根と掲示板が目印。 */
const TASKS_PARTS: BuildingPart[] = [
  box(2.7, 1.8, 2, { x: 0, y: -0.3, z: 0 }, "#d9b98c"),
  cone(3.3, 1.05, 4, { x: 0, y: 0.95, z: 0 }, "#6d3d78", { x: 0, y: QUARTER_TURN, z: 0 }),
  ...[-1.08, 1.08].map((x) => box(0.18, 1.9, 0.12, { x, y: -0.25, z: 1.04 }, "#6b4423")),
  box(2.25, 0.17, 0.12, { x: 0, y: 0.43, z: 1.04 }, "#6b4423"),
  box(1.32, 1.25, 0.12, { x: 0, y: -0.33, z: 1.08 }, "#8b5e34"),
  box(0.95, 0.86, 0.06, { x: 0, y: -0.28, z: 1.16 }, "#f4e3bd"),
  box(0.12, 0.42, 0.04, { x: -0.22, y: -0.25, z: 1.21 }, "#7c3aed", { x: 0, y: 0, z: -0.65 }),
  box(0.12, 0.72, 0.04, { x: 0.12, y: -0.34, z: 1.21 }, "#7c3aed", { x: 0, y: 0, z: 0.72 }),
  cylinder(0.1, 0.1, 1.05, 8, { x: 0, y: 1.52, z: 0 }, "#6b4423"),
  box(0.7, 0.42, 0.05, { x: 0.35, y: 1.7, z: 0 }, "#a855f7"),
];

/** 取引履歴。塔の上の時計が目印。 */
const HISTORY_PARTS: BuildingPart[] = [
  box(2.7, 1.75, 2, { x: 0, y: -0.32, z: 0 }, "#d8f3ec"),
  box(2.9, 0.22, 2.2, { x: 0, y: 0.78, z: 0 }, "#176b67"),
  box(1.2, 1, 1.15, { x: 0, y: 1.35, z: 0 }, "#f4e7c5"),
  cone(1.84, 0.65, 4, { x: 0, y: 1.98, z: 0 }, "#176b67", { x: 0, y: QUARTER_TURN, z: 0 }),
  cylinder(0.68, 0.68, 0.08, 18, { x: 0, y: 1.42, z: 0.6 }, "#fffaf0", {
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

/** 装飾の木。 */
const TREE_PARTS: BuildingPart[] = [cone(1.8, 1.8, 8, { x: 0, y: 0, z: 0 }, "#2f855a")];

/**
 * 道のタイル1枚。1.8角の平たい板で、並べて道にする。
 * 地面（y = -0.08）とZファイティングを起こさないよう、置くときに少し浮かせる。
 * 色は季節で変わる地面（春夏は緑、秋は橙、冬は白）のどれに対しても見分けがつく石の色。
 */
const PATH_PARTS: BuildingPart[] = [box(1.8, 0.06, 1.8, { x: 0, y: 0, z: 0 }, "#a39a8c")];

/** 岩。大小2つの箱を少しずらして重ね、削れた塊に見せる。 */
const ROCK_PARTS: BuildingPart[] = [
  box(0.9, 0.6, 0.8, { x: 0, y: 0, z: 0 }, "#8d8d86", { x: 0, y: 0.4, z: 0.12 }),
  box(0.5, 0.4, 0.45, { x: 0.35, y: -0.12, z: 0.25 }, "#a0a099", { x: 0, y: -0.6, z: 0 }),
];

/** 低木。木より低く、幹が見えない丸みのある茂み。 */
const BUSH_PARTS: BuildingPart[] = [
  cone(1.1, 0.75, 8, { x: 0, y: 0, z: 0 }, "#3f8f5e"),
  cone(0.75, 0.55, 8, { x: 0.28, y: -0.06, z: 0.2 }, "#4fa06b"),
];

/** 花壇。土の箱に縁をつけ、上に色違いの花を散らす。 */
const FLOWERBED_PARTS: BuildingPart[] = [
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
const LAMP_PARTS: BuildingPart[] = [
  cylinder(0.12, 0.18, 2, 8, { x: 0, y: 0, z: 0 }, "#4b5563"),
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
const VILLAGER_PARTS: BuildingPart[] = [
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
 * 高さは手の底(-0.33)から瞳の上(0.61)までの約0.94。住人（約1.5）より低く、ずんぐりさせている。
 */
const PLAYER_PARTS: BuildingPart[] = [
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
  // 目。頭の上のふくらみ → 白目 → 瞳の3段重ね。瞳は少し前へ寄せて前を見ているようにする
  ...[-0.25, 0.25].map((x) => cylinder(0.26, 0.28, 0.22, 12, { x, y: 0.41, z: 0.18 }, "#4fae3f")),
  ...[-0.25, 0.25].map((x) => cylinder(0.22, 0.22, 0.08, 12, { x, y: 0.54, z: 0.18 }, "#fdfdf6")),
  ...[-0.25, 0.25].map((x) => cylinder(0.12, 0.12, 0.06, 10, { x, y: 0.58, z: 0.22 }, "#1e2b1a")),
];

/** 未知のアセットIDに対するフォールバック。 */
const FALLBACK_PARTS: BuildingPart[] = [box(2.6, 2.4, 2.2, { x: 0, y: 0, z: 0 }, "#94a3b8")];

const PARTS_BY_ASSET: Record<string, BuildingPart[]> = {
  [RPG_HUB_ASSETS.bank]: BANK_PARTS,
  [RPG_HUB_ASSETS.bush]: BUSH_PARTS,
  [RPG_HUB_ASSETS.flowerbed]: FLOWERBED_PARTS,
  [RPG_HUB_ASSETS.history]: HISTORY_PARTS,
  [RPG_HUB_ASSETS.lamp]: LAMP_PARTS,
  [RPG_HUB_ASSETS.path]: PATH_PARTS,
  [RPG_HUB_ASSETS.player]: PLAYER_PARTS,
  [RPG_HUB_ASSETS.rock]: ROCK_PARTS,
  [RPG_HUB_ASSETS.store]: STORE_PARTS,
  [RPG_HUB_ASSETS.tasks]: TASKS_PARTS,
  [RPG_HUB_ASSETS.tree]: TREE_PARTS,
  [RPG_HUB_ASSETS.villager]: VILLAGER_PARTS,
};

/**
 * アセットIDに対応する見た目のパーツ一覧を返す。
 * 未知のIDでも描画が消えないよう、フォールバックの箱を返す。
 * @param assetId - 解決済みのアセットID
 * @returns パーツ一覧
 */
export function getBuildingParts(assetId: AssetId): BuildingPart[] {
  return PARTS_BY_ASSET[assetId] ?? FALLBACK_PARTS;
}
