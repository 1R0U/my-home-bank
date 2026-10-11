// 自分の家の中（Issue #386）の部屋と家具の「形」。
//
// 我が家タウンの建物と同じく、3Dエンジンに依存しないパーツ定義（buildingParts.ts の
// `BuildingPart`）で書き、WebView 側（webview/rpg-hub/houseRoom.ts）が `createPartMesh` で組み立てる。
//
// 家具のローカル座標は「床の上・家具の中心が原点」で、y = 0 が床。正面は +Z（カメラの側）。
// 部屋の中での位置（横・奥行き）は WebView 側が `HOUSE_ROOMS` と `ROOM_DEPTH` から決める。

import type { BuildingPart } from "./buildingParts.ts";
import type { HouseFloor, HouseFurnitureKind } from "./houseRoom.ts";
import { ROOM_DEPTH, ROOM_HEIGHT, ROOM_WIDTH } from "./houseRoom.ts";

type Vec3 = { x: number; y: number; z: number };

const box = (width: number, height: number, depth: number, position: Vec3, color: string, rotation?: Vec3): BuildingPart => ({
  color,
  depth,
  height,
  position,
  rotation,
  shape: "box",
  width,
});

const cylinder = (diameterTop: number, diameterBottom: number, height: number, position: Vec3, color: string, rotation?: Vec3): BuildingPart => ({
  color,
  diameterBottom,
  diameterTop,
  height,
  position,
  rotation,
  shape: "cylinder",
  tessellation: 20,
});

const sphere = (diameter: number, position: Vec3, color: string): BuildingPart => ({
  color,
  diameterX: diameter,
  diameterY: diameter,
  diameterZ: diameter,
  position,
  segments: 12,
  shape: "sphere",
});

const RIGHT_ANGLE = Math.PI / 2;

/** 家具の木の色 */
const WOOD = "#c58b52";
const WOOD_LIGHT = "#d9a46a";
const WOOD_DARK = "#7a4e2c";

export type HouseFurnitureShape = {
  /** 奥行き。奥の壁にぴったり付けて置くのに使う */
  depth: number;
  /** 名札を出す高さ（家具のいちばん上より少し上） */
  tagY: number;
  /**
   * 奥の壁に掛ける物か（窓）。掛ける物は床の上の家具と重ねて置いてよく、
   * 名札も出さない（掛ける物はどれも「ひとこと話す」だけのため）。
   */
  onWall?: true;
  parts: BuildingPart[];
};

/**
 * 階段の段。左（-X）から右（+X）へ上っていく段を `steps` 段積む。
 * 下りの階段は左右を反転させる（`mirror`）。
 */
const stairSteps = (steps: number, mirror: boolean): BuildingPart[] =>
  Array.from({ length: steps }, (_, index) => {
    const height = ((index + 1) * 2.2) / steps;
    const x = (-0.75 + index * (1.5 / (steps - 1))) * (mirror ? -1 : 1);
    return box(1.5 / (steps - 1) + 0.02, height, 1.1, { x, y: height / 2, z: 0 }, index % 2 === 0 ? WOOD : WOOD_LIGHT);
  });

/** 家具の種類ごとの形 */
export const HOUSE_FURNITURE_SHAPES: Record<HouseFurnitureKind, HouseFurnitureShape> = {
  bed: {
    depth: 2,
    parts: [
      box(2.2, 0.35, 2, { x: 0, y: 0.25, z: 0 }, WOOD),
      box(0.15, 1.1, 2, { x: -1.1, y: 0.55, z: 0 }, WOOD_DARK),
      box(2.05, 0.25, 1.9, { x: 0.05, y: 0.55, z: 0 }, "#fffaf0"),
      box(0.5, 0.18, 1.2, { x: -0.75, y: 0.75, z: 0 }, "#ffffff"),
      box(1.35, 0.12, 1.95, { x: 0.4, y: 0.72, z: 0 }, "#8ab6e8"),
    ],
    tagY: 1.4,
  },
  bookshelf: {
    depth: 0.5,
    parts: [
      // 前の開いた棚。背板・側板・天板と、3段の棚板で組む（中の本が見えるように）
      box(1.1, 1.9, 0.06, { x: 0, y: 0.95, z: -0.22 }, WOOD_DARK),
      ...[-0.52, 0.52].map((x) => box(0.06, 1.9, 0.5, { x, y: 0.95, z: 0 }, WOOD_DARK)),
      box(1.1, 0.06, 0.5, { x: 0, y: 1.87, z: 0 }, WOOD_DARK),
      ...[0.15, 0.75, 1.35].map((y) => box(0.98, 0.05, 0.46, { x: 0, y, z: 0 }, WOOD)),
      // 本。色と高さを少しずつ変えて並べる
      ...[
        { color: "#e76f51", height: 0.36, x: -0.36, y: 0.35 },
        { color: "#2a9d8f", height: 0.4, x: -0.22, y: 0.35 },
        { color: "#e9c46a", height: 0.32, x: -0.08, y: 0.35 },
        { color: "#8ab6e8", height: 0.38, x: 0.2, y: 0.95 },
        { color: "#f28fb0", height: 0.34, x: 0.34, y: 0.95 },
        { color: "#264653", height: 0.4, x: -0.3, y: 1.55 },
        { color: "#f4a261", height: 0.3, x: 0.05, y: 1.55 },
      ].map((book) =>
        box(0.12, book.height, 0.3, { x: book.x, y: book.y - 0.175 + book.height / 2, z: 0.02 }, book.color),
      ),
    ],
    tagY: 2.2,
  },
  closet: {
    depth: 0.7,
    parts: [
      box(1.5, 2.3, 0.7, { x: 0, y: 1.15, z: 0 }, WOOD),
      // 両開きの扉と取っ手
      box(0.7, 2.05, 0.04, { x: -0.37, y: 1.13, z: 0.36 }, WOOD_LIGHT),
      box(0.7, 2.05, 0.04, { x: 0.37, y: 1.13, z: 0.36 }, WOOD_LIGHT),
      box(0.05, 0.3, 0.06, { x: -0.07, y: 1.15, z: 0.4 }, WOOD_DARK),
      box(0.05, 0.3, 0.06, { x: 0.07, y: 1.15, z: 0.4 }, WOOD_DARK),
      // 上の飾り板と、服をかける場所だと分かる目印（ハンガーとワンピース）
      box(1.6, 0.12, 0.76, { x: 0, y: 2.36, z: 0 }, WOOD_DARK),
      { color: "#f28fb0", diameter: 0.32, height: 0.36, position: { x: 0, y: 1.88, z: 0.42 }, shape: "cone", tessellation: 8 },
      { color: "#e9c46a", diameter: 0.18, position: { x: 0, y: 2.1, z: 0.42 }, rotation: { x: RIGHT_ANGLE, y: 0, z: 0 }, shape: "torus", thickness: 0.03 },
    ],
    tagY: 2.75,
  },
  door: {
    depth: 0.14,
    parts: [
      box(1.2, 2.35, 0.1, { x: 0, y: 1.175, z: -0.02 }, WOOD_DARK),
      box(1.02, 2.2, 0.08, { x: 0, y: 1.1, z: 0.03 }, "#b5523b"),
      box(0.7, 0.5, 0.02, { x: 0, y: 1.65, z: 0.08 }, "#9c4431"),
      box(0.7, 0.7, 0.02, { x: 0, y: 0.6, z: 0.08 }, "#9c4431"),
      sphere(0.12, { x: 0.36, y: 1.1, z: 0.12 }, "#f2c94c"),
    ],
    tagY: 2.75,
  },
  plant: {
    depth: 0.6,
    parts: [
      cylinder(0.55, 0.4, 0.5, { x: 0, y: 0.25, z: 0 }, "#d97b4a"),
      sphere(0.7, { x: 0, y: 0.85, z: 0 }, "#3d9a63"),
      sphere(0.5, { x: 0.22, y: 1.15, z: 0.05 }, "#2f7a4e"),
      sphere(0.45, { x: -0.2, y: 1.1, z: -0.05 }, "#37905c"),
    ],
    tagY: 1.6,
  },
  sofa: {
    depth: 0.9,
    parts: [
      box(1.6, 0.45, 0.9, { x: 0, y: 0.3, z: 0 }, "#2a9d8f"),
      box(1.6, 0.75, 0.25, { x: 0, y: 0.7, z: -0.33 }, "#2a9d8f"),
      box(0.25, 0.6, 0.9, { x: -0.8, y: 0.45, z: 0 }, "#24877b"),
      box(0.25, 0.6, 0.9, { x: 0.8, y: 0.45, z: 0 }, "#24877b"),
      box(0.66, 0.14, 0.6, { x: -0.35, y: 0.58, z: 0.08 }, "#5ec4b6"),
      box(0.66, 0.14, 0.6, { x: 0.35, y: 0.58, z: 0.08 }, "#5ec4b6"),
      box(0.4, 0.4, 0.12, { x: 0.45, y: 0.85, z: -0.15 }, "#f2c94c", { x: -0.2, y: 0, z: 0.2 }),
    ],
    tagY: 1.4,
  },
  stairsDown: {
    // 2階の床に空いた下り口と、まわりの手すり
    depth: 1.2,
    parts: [
      box(1.6, 0.02, 1.1, { x: 0, y: 0.01, z: 0 }, "#4a3426"),
      ...[0, 1, 2].map((index) =>
        box(1.5, 0.02, 0.18, { x: 0, y: 0.02, z: -0.35 + index * 0.35 }, "#6b4a2f"),
      ),
      box(0.08, 0.9, 1.2, { x: 0.82, y: 0.45, z: 0 }, WOOD_DARK),
      box(1.7, 0.08, 0.08, { x: 0, y: 0.9, z: -0.6 }, WOOD_DARK),
      ...[-0.82, 0.82].map((x) => box(0.1, 0.95, 0.1, { x, y: 0.475, z: -0.6 }, WOOD_DARK)),
    ],
    tagY: 1.5,
  },
  stairsUp: {
    depth: 1.1,
    parts: [
      ...stairSteps(5, false),
      // 手すり
      box(0.08, 0.08, 0.08, { x: -0.85, y: 0.9, z: 0.5 }, WOOD_DARK),
      { ...box(2.1, 0.08, 0.08, { x: 0, y: 1.9, z: 0.5 }, WOOD_DARK), rotation: { x: 0, y: 0, z: 0.85 } },
    ],
    tagY: 2.75,
  },
  toyBox: {
    depth: 0.8,
    parts: [
      box(1.2, 0.6, 0.8, { x: 0, y: 0.3, z: 0 }, "#e76f51"),
      box(1.26, 0.1, 0.86, { x: 0, y: 0.62, z: 0 }, "#f4a261"),
      // くまのぬいぐるみ
      sphere(0.5, { x: 0.2, y: 0.92, z: 0.1 }, "#b07a4f"),
      sphere(0.36, { x: 0.2, y: 1.28, z: 0.1 }, "#b07a4f"),
      sphere(0.14, { x: 0.07, y: 1.44, z: 0.1 }, "#8a5a36"),
      sphere(0.14, { x: 0.33, y: 1.44, z: 0.1 }, "#8a5a36"),
      // ボール
      sphere(0.34, { x: -0.35, y: 0.84, z: 0.15 }, "#8ab6e8"),
    ],
    tagY: 1.8,
  },
  window: {
    depth: 0.12,
    onWall: true,
    parts: [
      box(1.6, 1.15, 0.1, { x: 0, y: 2.05, z: 0 }, "#ffffff"),
      box(1.4, 0.95, 0.06, { x: 0, y: 2.05, z: 0.04 }, "#bfe8ff"),
      box(0.06, 0.95, 0.04, { x: 0, y: 2.05, z: 0.08 }, "#ffffff"),
      box(1.4, 0.06, 0.04, { x: 0, y: 2.05, z: 0.08 }, "#ffffff"),
      box(1.8, 0.08, 0.2, { x: 0, y: 1.45, z: 0.06 }, WOOD),
    ],
    tagY: 2.8,
  },
};

/** 階ごとの壁・床の色。階が変わったと一目で分かるよう、壁の色を変える */
export const HOUSE_ROOM_SURFACES: Record<HouseFloor, { floor: string; floorLine: string; trim: string; wall: string }> = {
  ground: { floor: "#d9a46a", floorLine: "#b9834b", trim: "#a8774a", wall: "#fbeed7" },
  upstairs: { floor: "#c9b28a", floorLine: "#a99069", trim: "#8a7a5a", wall: "#e3f0e0" },
};

/**
 * 部屋の箱（床・奥の壁・左右の壁・幅木）。手前の壁と天井は作らず、そこから中を覗く。
 * 原点は部屋の手前の辺の中央・床の高さ。奥の壁が z = -ROOM_DEPTH。
 * @param floor - 階（色を変える）
 * @returns 部屋の箱のパーツ
 */
export function createRoomShellParts(floor: HouseFloor): BuildingPart[] {
  const colors = HOUSE_ROOM_SURFACES[floor];
  const wallThickness = 0.2;
  const halfWidth = ROOM_WIDTH / 2;
  return [
    // 床。手前へ少しはみ出させ、切り口を見せる
    box(ROOM_WIDTH + wallThickness * 2, 0.3, ROOM_DEPTH + 0.4, { x: 0, y: -0.15, z: -ROOM_DEPTH / 2 + 0.2 }, colors.floor),
    // 床板の継ぎ目
    ...[1, 2, 3].map((index) =>
      box(ROOM_WIDTH, 0.005, 0.04, { x: 0, y: 0.003, z: -ROOM_DEPTH + (index * ROOM_DEPTH) / 4 }, colors.floorLine),
    ),
    // 奥の壁と幅木
    box(ROOM_WIDTH + wallThickness * 2, ROOM_HEIGHT, wallThickness, { x: 0, y: ROOM_HEIGHT / 2, z: -ROOM_DEPTH - wallThickness / 2 }, colors.wall),
    box(ROOM_WIDTH, 0.16, 0.04, { x: 0, y: 0.08, z: -ROOM_DEPTH + 0.02 }, colors.trim),
    // 左右の壁
    ...[-1, 1].map((side) =>
      box(wallThickness, ROOM_HEIGHT, ROOM_DEPTH + 0.4, { x: side * (halfWidth + wallThickness / 2), y: ROOM_HEIGHT / 2, z: -ROOM_DEPTH / 2 + 0.2 }, colors.wall),
    ),
    ...[-1, 1].map((side) =>
      box(0.04, 0.16, ROOM_DEPTH, { x: side * (halfWidth - 0.02), y: 0.08, z: -ROOM_DEPTH / 2 }, colors.trim),
    ),
    // 壁の上の縁（切り口を締める）
    box(ROOM_WIDTH + wallThickness * 2, 0.12, wallThickness + 0.04, { x: 0, y: ROOM_HEIGHT, z: -ROOM_DEPTH - wallThickness / 2 }, colors.trim),
    ...[-1, 1].map((side) =>
      box(wallThickness + 0.04, 0.12, ROOM_DEPTH + 0.4, { x: side * (halfWidth + wallThickness / 2), y: ROOM_HEIGHT, z: -ROOM_DEPTH / 2 + 0.2 }, colors.trim),
    ),
  ];
}
