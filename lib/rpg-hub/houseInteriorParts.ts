// 自分の家の中（Issue #444）の床・壁と家具の「形」。
//
// 我が家タウンの建物と同じく、3Dエンジンに依存しないパーツ定義（buildingParts.ts の
// `BuildingPart`）で書き、カタログ（catalog.ts）に載せて町と同じシーンで組み立てる。
// 家具の形は、真横から見ていた家の中（Issue #386）で作ったものをそのまま使っている。
//
// 家具のローカル座標は「床の上・家具の中心が原点」で、y = 0 が床。正面は +Z。
// 部屋の中での位置は lib/rpg-hub/houseInterior.ts が決める。

import type { BuildingPart } from "./buildingParts.ts";

/** 家具の種類 */
export type HouseFurnitureKind = "closet" | "door" | "plant" | "sofa" | "window";

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
  /** 奥行き。奥の壁にぴったり付けて置くのと、当たり判定の奥行きに使う */
  depth: number;
  /** 奥の壁に掛ける物か（窓）。掛ける物は当たり判定を持たず、床の上の家具と重ねて置いてよい */
  onWall?: true;
  parts: BuildingPart[];
};

/**
 * 家の中のマスの一辺。町のマス（townGrid.ts の `TOWN_CELL_SIZE`）と同じ値。
 * townGrid.ts はこのファイルを（houseInterior.ts 経由で）読み込むので、ここから読み込むと循環する。
 * 同じ値であることは tests/houseInterior.test.mjs で確かめる。
 */
export const HOUSE_CELL_SIZE = 0.9;

/**
 * 玄関（土間）の大きさ。部屋の手前の辺の真ん中から、手前（+Z）へ四角く飛び出させる。
 * 幅は2マスにして、部屋のまん中の2マスの前にぴったり付ける（Issue #477）。
 */
export const HOUSE_ENTRANCE_SIZE = { depth: 1.5, width: HOUSE_CELL_SIZE * 2 } as const;

/** 家具の前に敷くマットの色（縁と内側） */
const MAT_COLORS = { edge: "#c96f5a", inner: "#e9a178" } as const;

/**
 * 動かせる家具（クローゼット）の正面に敷くマット。**家具の形の一部にする**（Issue #477）。
 * 別の物にしておくと、家具を持ち上げて動かしている間や回したときに、マットだけ置いてきぼりになる。
 *
 * 正面の1マス先（家具の中心から1マスぶん手前）の真ん中に敷く。ここは物を置けないマス
 * （townGrid.ts の `getFrontCells`）なので、マットが「ここには置けない」範囲の目印にもなる。
 * 幅は家具本体と同じにする（家具の横幅は形から測るので、広げると当たり判定まで広がる）。
 * @param width - 家具本体の横幅
 * @returns マットのパーツ
 */
function frontMatParts(width: number): BuildingPart[] {
  const z = HOUSE_CELL_SIZE;
  const depth = HOUSE_CELL_SIZE - 0.1;
  return [
    box(width, 0.02, depth, { x: 0, y: 0.01, z }, MAT_COLORS.edge),
    box(width - 0.2, 0.025, depth - 0.2, { x: 0, y: 0.012, z }, MAT_COLORS.inner),
  ];
}

/** 家具の種類ごとの形 */
export const HOUSE_FURNITURE_SHAPES: Record<HouseFurnitureKind, HouseFurnitureShape> = {
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
      // 正面のマット。クローゼットと一緒に動く・回る（Issue #477）
      ...frontMatParts(1.6),
    ],
  },
  // 玄関の出口（Issue #444）。手前へ飛び出した玄関（土間）の先の端。床だけに見せるため描かない
  // （カタログで invisible）。形は当たり判定の横幅（玄関の床と同じ）を決めるためだけに持つ。
  // 歩いて外へ出てしまわないよう当たり判定は持たせ、近づくと出るボタンで外へ出る
  // （何をする場所かは、上に浮かべる名札「そとへ」で分かる）
  door: {
    depth: 0.3,
    parts: [box(HOUSE_ENTRANCE_SIZE.width, 0.06, 0.3, { x: 0, y: 0.03, z: 0 }, WOOD_DARK)],
  },
  plant: {
    depth: 0.6,
    parts: [
      cylinder(0.55, 0.4, 0.5, { x: 0, y: 0.25, z: 0 }, "#d97b4a"),
      sphere(0.7, { x: 0, y: 0.85, z: 0 }, "#3d9a63"),
      sphere(0.5, { x: 0.22, y: 1.15, z: 0.05 }, "#2f7a4e"),
      sphere(0.45, { x: -0.2, y: 1.1, z: -0.05 }, "#37905c"),
    ],
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
  },
};

/** 部屋の壁・床の色 */
const HOUSE_ROOM_COLORS = { floor: "#d9a46a", floorLine: "#b9834b", trim: "#a8774a", wall: "#fbeed7" } as const;

/**
 * 部屋の床のマスの数（横・奥行き）。
 *
 * **床の大きさはマスの数で決める**（Issue #477）。以前は 12 × 8 で、マス（0.9）で割り切れず、
 * 「かざる」で出すマス目が右と手前の端で半端に切れていた。
 */
export const HOUSE_ROOM_CELLS = { cols: 14, rows: 9 } as const;

/**
 * 部屋の大きさ（3Dの座標。1 = 1m 相当）。横 14 マス × 奥行き 9 マス（12.6 × 8.1）。
 *
 * 我が家タウンのカメラ（正射影で縦におよそ15ぶん映る）に、部屋がまるごと収まる大きさにしてある。
 * 横幅・奥行きは、マスの一辺と壁の1枚の長さ（`HOUSE_WALL_TILE_LENGTH`）の両方で割り切れる値にする。
 */
export const HOUSE_ROOM_SIZE = {
  depth: HOUSE_CELL_SIZE * HOUSE_ROOM_CELLS.rows,
  wallHeight: 3.2,
  wallThickness: 0.3,
  width: HOUSE_CELL_SIZE * HOUSE_ROOM_CELLS.cols,
} as const;

/**
 * 高い壁（奥・左）1枚の長さ。この長さの壁を並べて部屋を囲む。
 * 横14マス・奥行き9マスのどちらも割り切れるよう、1マスぶんにする。
 */
export const HOUSE_WALL_TILE_LENGTH = HOUSE_CELL_SIZE;

/** 床板の継ぎ目の間隔。2マスおきにして、「かざる」で出すマス目の線と重ねる */
const FLOOR_SEAM_SPACING = HOUSE_CELL_SIZE * 2;

/**
 * 部屋の床。壁の下まで広げ、壁の切れ目（四隅）を柱でふさぐ。
 * 原点は部屋の中央・床の上面（y = 0）。
 * @returns 床と四隅の柱のパーツ
 */
function createHouseFloorParts(): BuildingPart[] {
  const colors = HOUSE_ROOM_COLORS;
  // 分割代入しない（esbuild が ios13 ターゲットへ変換できず、`npm run build:scene` が落ちる）
  const depth = HOUSE_ROOM_SIZE.depth;
  const wallHeight = HOUSE_ROOM_SIZE.wallHeight;
  const wallThickness = HOUSE_ROOM_SIZE.wallThickness;
  const width = HOUSE_ROOM_SIZE.width;
  const outerX = width / 2 + wallThickness / 2;
  const outerZ = depth / 2 + wallThickness / 2;
  const post = (x: number, z: number, height: number, color: string) =>
    box(wallThickness, height, wallThickness, { x, y: height / 2, z }, color);
  return [
    box(width + wallThickness * 2, 0.1, depth + wallThickness * 2, { x: 0, y: -0.05, z: 0 }, colors.floor),
    // 床板の継ぎ目（横向きに、奥から2マスおきに4本）
    ...[1, 2, 3, 4].map((index) =>
      box(width, 0.005, 0.04, { x: 0, y: 0.003, z: -depth / 2 + index * FLOOR_SEAM_SPACING }, colors.floorLine),
    ),
    // 高い壁（奥・左）の端の柱。手前右の角は壁が無いので柱も置かない
    post(-outerX, -outerZ, wallHeight, colors.wall),
    post(outerX, -outerZ, wallHeight, colors.wall),
    post(-outerX, outerZ, wallHeight, colors.wall),
  ];
}

/** 部屋の床と四隅の柱 */
export const HOUSE_FLOOR_PARTS: BuildingPart[] = createHouseFloorParts();

/**
 * 奥と左の、高い壁の1枚。原点は壁の中央・床の上面で、部屋の内側が +Z。
 * 内側の下に幅木、上に縁を付ける。
 * @returns 壁のパーツ
 */
function createHouseWallParts(): BuildingPart[] {
  const colors = HOUSE_ROOM_COLORS;
  // 分割代入しない（esbuild が ios13 ターゲットへ変換できず、`npm run build:scene` が落ちる）
  const wallHeight = HOUSE_ROOM_SIZE.wallHeight;
  const wallThickness = HOUSE_ROOM_SIZE.wallThickness;
  const length = HOUSE_WALL_TILE_LENGTH;
  return [
    box(length, wallHeight, wallThickness, { x: 0, y: wallHeight / 2, z: 0 }, colors.wall),
    box(length, 0.16, 0.04, { x: 0, y: 0.08, z: wallThickness / 2 + 0.02 }, colors.trim),
    box(length, 0.12, wallThickness + 0.04, { x: 0, y: wallHeight, z: 0 }, colors.trim),
  ];
}

/** 奥と左の、高い壁の1枚 */
export const HOUSE_WALL_PARTS: BuildingPart[] = createHouseWallParts();

/**
 * 見えない壁（カタログで `invisible: true`）の形。描かないので見た目には使わないが、
 * カタログの決まり（形を必ず持つ）に合わせて小さな箱を1つ持たせる。
 */
export const HOUSE_INVISIBLE_WALL_PARTS: BuildingPart[] = [
  box(HOUSE_ROOM_SIZE.wallThickness, 0.1, HOUSE_ROOM_SIZE.wallThickness, { x: 0, y: 0.05, z: 0 }, WOOD_DARK),
];

/**
 * 玄関（土間）の床。部屋の床と区別できるよう石の色にする。原点は玄関の床の中央・床の上面。
 * 部屋の床と同じ高さ（上面が y = 0）に置く。
 */
export const HOUSE_ENTRANCE_FLOOR_PARTS: BuildingPart[] = [
  box(HOUSE_ENTRANCE_SIZE.width, 0.1, HOUSE_ENTRANCE_SIZE.depth, { x: 0, y: -0.05, z: 0 }, "#c9bba4"),
  // 敷石の継ぎ目
  box(0.04, 0.005, HOUSE_ENTRANCE_SIZE.depth, { x: 0, y: 0.003, z: 0 }, "#a89a84"),
  box(HOUSE_ENTRANCE_SIZE.width, 0.005, 0.04, { x: 0, y: 0.003, z: 0 }, "#a89a84"),
];

/**
 * 家具の前に敷くマット。機能のある家具の前に敷いて、立つ場所の目印にする
 * （我が家タウンの建物の前の道と同じ役目）。原点は床の上面。
 * 今は玄関の出口（そとへ）の前だけ。動かせる家具（クローゼット）のマットは家具の形の一部（`frontMatParts`）。
 */
export const HOUSE_MAT_PARTS: BuildingPart[] = [
  box(1.5, 0.02, 1, { x: 0, y: 0.01, z: 0 }, MAT_COLORS.edge),
  box(1.3, 0.025, 0.8, { x: 0, y: 0.012, z: 0 }, MAT_COLORS.inner),
];

/**
 * 家具の横幅（3Dの座標）。形のパーツのいちばん外側から測る（箱の width、円柱などの直径）。
 * 傾けた箱（ソファのクッション）は、傾けたあとの横の広がりで測る。当たり判定の横幅に使う。
 * @param kind - 家具の種類
 * @returns 家具の横幅
 */
export function getFurnitureWidth(kind: HouseFurnitureKind): number {
  return (
    2 *
    Math.max(
      ...HOUSE_FURNITURE_SHAPES[kind].parts.map((part) => {
        if (part.shape === "box") {
          const angle = part.rotation?.z ?? 0;
          const half = Math.abs((part.width / 2) * Math.cos(angle)) + Math.abs((part.height / 2) * Math.sin(angle));
          return Math.abs(part.position.x) + half;
        }
        const size =
          part.shape === "sphere"
            ? part.diameterX
            : part.shape === "cylinder"
              ? Math.max(part.diameterTop, part.diameterBottom)
              : part.diameter;
        return Math.abs(part.position.x) + size / 2;
      }),
    )
  );
}
