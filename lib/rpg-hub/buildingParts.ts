// RPGハブに登場する建物・装飾の見た目を、3Dエンジンに依存しないデータとして定義する。
//
// 現行の R3F 版（components/rpg-hub/BuildingMesh.tsx）は同じ形状を JSX で直接組んでいるが、
// WebView + Babylon.js 版では同じ形を Babylon の MeshBuilder で組み立てる必要がある。
// 形状の定義をここに1つだけ持つことで、エンジンを差し替えても見た目の定義が二重にならない。
//
// 座標・寸法の単位はワールド座標の 1 = 1m 相当。position / rotation はオブジェクトの
// ローカル原点から見た値で、rotation はラジアン。

import { RPG_HUB_ASSETS } from "./assets.ts";
import type { AssetId } from "../../types/map";

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

/** 未知のアセットIDに対するフォールバック。 */
const FALLBACK_PARTS: BuildingPart[] = [box(2.6, 2.4, 2.2, { x: 0, y: 0, z: 0 }, "#94a3b8")];

const PARTS_BY_ASSET: Record<string, BuildingPart[]> = {
  [RPG_HUB_ASSETS.bank]: BANK_PARTS,
  [RPG_HUB_ASSETS.history]: HISTORY_PARTS,
  [RPG_HUB_ASSETS.store]: STORE_PARTS,
  [RPG_HUB_ASSETS.tasks]: TASKS_PARTS,
  [RPG_HUB_ASSETS.tree]: TREE_PARTS,
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
