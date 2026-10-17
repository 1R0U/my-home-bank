/**
 * 我が家タウンのマス（格子）（Issue #445）。
 *
 * 町を一辺0.9のマスで区切り、建物・道・装飾は「どのマスに置くか」で位置を決める。
 * 以前は1つずつ座標を直書きし、扉の正面に道が来るよう手で合わせていた。
 *
 * - マス (列 col, 行 row) は x が col × 0.9 〜 (col + 1) × 0.9、z が row × 0.9 〜 (row + 1) × 0.9 の範囲。
 *   出発地点(0, 0)はマスの角にあたる。
 * - +X が東（列が増える）、+Z が北（行が増える）。
 * - 家の中（houseInterior.ts）は町とは別のマスで、床の南西の角（`HOUSE_GRID_ORIGIN`）をマス(0, 0)の角にする。
 *   町と同じ基準にすると、床の奥の端がマスの境目に来ず、奥の壁ぎわに何も置けなくなるため。
 *
 * **何がどれだけのマスを占めるか**（`getObjectCells` がこの決まりの唯一の実装）:
 * - 建物・自分の家・掲示板: 区画の 4×4（`BUILDING_LOT_CELLS`）。作るときに `footprint` を持たせる
 * - 道のタイル: 2×2。作るときに `footprint` を持たせる
 * - 装飾（「かざる」で置ける種類。町の固定物・散らす自然物も同じ種類）: カタログの `placement.cells`
 *   （`getDecorationCells`）。しげみ・岩・木・花壇は 2×2、ほかは1マス。位置は中心の座標から求める
 *   （保存した装飾は座標しか持たないため）。季節の飾り（雪だまりは 2×2）も `getDecorationCellRange` で同じく求める
 * - それ以外で当たり判定を持つ物（NPC・家の中の壁と家具）: 当たり判定の箱がかかるマス
 * - 当たり判定もマスも持たない物（町の外の柵など）: マスを占めない
 *
 * 建物の扉の前（区画のすぐ北の1行）は、物を置けないマスとして予約する（`getBlockedCells`）。
 *
 * **置けるかは「候補が占めるマスが、どれも空いているか」で決める。** 置く位置の目印・置くときの判定
 * （placementSpot.ts / placement.ts）、自然物や季節の飾りを散らす処理（mapObjects.ts /
 * seasonalDecorations.ts）、保存済みの装飾をマスへ寄せるマイグレーションの重なり検査が、すべてこの決まりで動く。
 * 当たり判定の箱どうしの比較は使わない（以前はマスと箱の2本立てで、互いにずれていた）。
 * 置いたあとに建物へ行けるかの確認（囲い込み防止）だけは、歩ける範囲を実際に調べる（placement.ts）。
 *
 * WebView のシーン（es2017 向けにバンドルする）からも読み込むので、引数での分割代入は使わない。
 */
import type { MapObject } from "../../types/map";
import { getBuildingParts, getDecorationPlacement, getPlaceableDecorations } from "./catalog.ts";
import { getHouseLocation, HOUSE_GRID_ORIGIN } from "./houseInterior.ts";
import { getPartsHalfExtent } from "./partExtent.ts";

/**
 * マスの一辺。装飾1つぶん。
 * 道のタイル（一辺1.8）はちょうど 2×2 マスになる。
 */
export const TOWN_CELL_SIZE = 0.9;

/** 建物1棟が占めるマスの数（東西・南北とも）。全部の建物でそろえている。 */
export const BUILDING_LOT_CELLS = 4;

/** 向きの単位（90度）。マスに置く物は東西南北のどれかを向く。 */
export const QUARTER_TURN = Math.PI / 2;

/** マスの番号。 */
export type TownCell = { col: number; row: number };

/** どのマスの並びか。町と家の中で、マス(0, 0)の位置が違う。 */
export type GridId = "house" | "town";

/** 占めるマスの範囲。南西のマスから東へ `cols`、北へ `rows` マスぶん。 */
export type CellRange = { col: number; cols: number; grid: GridId; row: number; rows: number };

/** 浮動小数の誤差で、ちょうどマスの境目の値が隣のマスへ落ちないようにする幅。 */
const EPSILON = 1e-6;

/** 町のマス(0, 0)の南西の角。 */
const TOWN_GRID_ORIGIN = { x: 0, z: 0 } as const;

/**
 * マスの並びの、マス(0, 0)の南西の角。
 * @param grid - マスの並び
 * @returns 角のXZ座標
 */
function getGridOrigin(grid: GridId): { x: number; z: number } {
  return grid === "house" ? HOUSE_GRID_ORIGIN : TOWN_GRID_ORIGIN;
}

/**
 * その座標が、どのマスの並びに入るか。家の中なら家の中のマス、それ以外は町のマス。
 * @param x - X座標
 * @param z - Z座標
 * @returns マスの並び
 */
export function getGridAt(x: number, z: number): GridId {
  return getHouseLocation(x, z);
}

/**
 * 南西のマスから東・北へ `cells` マスぶんの範囲を求める。
 * @param cell - 南西のマス
 * @param cells - 一辺のマス数
 * @param grid - マスの並び。省略時は町
 * @returns XZ平面上の範囲
 */
export function getCellsBounds(
  cell: TownCell,
  cells: number,
  grid: GridId = "town",
): { maxX: number; maxZ: number; minX: number; minZ: number } {
  const origin = getGridOrigin(grid);
  return {
    maxX: origin.x + (cell.col + cells) * TOWN_CELL_SIZE,
    maxZ: origin.z + (cell.row + cells) * TOWN_CELL_SIZE,
    minX: origin.x + cell.col * TOWN_CELL_SIZE,
    minZ: origin.z + cell.row * TOWN_CELL_SIZE,
  };
}

/**
 * 南西のマスから `cells` マスぶんを占める物の、中心の座標を求める。
 * @param cell - 南西のマス
 * @param cells - 一辺のマス数
 * @param grid - マスの並び。省略時は町
 * @returns XZ座標
 */
export function getCellsCenter(cell: TownCell, cells: number, grid: GridId = "town"): { x: number; z: number } {
  const origin = getGridOrigin(grid);
  return {
    x: origin.x + (cell.col + cells / 2) * TOWN_CELL_SIZE,
    z: origin.z + (cell.row + cells / 2) * TOWN_CELL_SIZE,
  };
}

/**
 * 中心の座標から、`cells` マスぶんを占める物の南西のマスを求める。
 * 中心がマスにそろっていない座標は、いちばん近い置き方に寄せる。
 * @param x - 中心のX座標
 * @param z - 中心のZ座標
 * @param cells - 一辺のマス数
 * @param grid - マスの並び。省略時は町
 * @returns 南西のマス
 */
export function getCellAt(x: number, z: number, cells: number, grid: GridId = "town"): TownCell {
  const origin = getGridOrigin(grid);
  // 0.5 ちょうどを東・北へ寄せると、負の側と正の側で寄り方が変わる。誤差ぶん足して揃える
  // `|| 0` は -0 を 0 にそろえる（Math.round(-0.4) は -0 になり、比べるときに紛らわしい）
  return {
    col: Math.round((x - origin.x) / TOWN_CELL_SIZE - cells / 2 + EPSILON) || 0,
    row: Math.round((z - origin.z) / TOWN_CELL_SIZE - cells / 2 + EPSILON) || 0,
  };
}

/**
 * 座標を、`cells` マスぶんを占める物として置ける、いちばん近い中心へ寄せる。
 * 家の中の座標は家の中のマスへ、それ以外は町のマスへ寄せる。
 * @param x - X座標
 * @param z - Z座標
 * @param cells - 一辺のマス数
 * @returns マスにそろえた中心の座標
 */
export function snapToCells(x: number, z: number, cells: number): { x: number; z: number } {
  const grid = getGridAt(x, z);
  return getCellsCenter(getCellAt(x, z, cells, grid), cells, grid);
}

/**
 * 向きを、いちばん近い90度刻みへ寄せる。
 *
 * **マスに置く物は東西南北のどれかを向かせる。** 当たり判定は回転後の4頂点を囲む四角
 * （`getCollisionHalfExtents`）なので、斜めにすると最大√2倍に広がり、1マスからはみ出す。
 * @param rotationY - Y軸まわりの回転（ラジアン）
 * @returns 90度刻みに寄せた回転（-π/2 〜 π）
 */
export function snapRotationToQuarter(rotationY: number): number {
  const quarters = ((Math.round(rotationY / QUARTER_TURN) % 4) + 4) % 4;
  // 0, π/2, π, 3π/2 のうち 3π/2 は -π/2 で返す（rotationY の他の値と同じ向きの表し方にそろえる）
  return (quarters === 3 ? -1 : quarters) * QUARTER_TURN;
}

/**
 * 建物を区画（4×4マス）に置くときの中心の座標を求める。
 *
 * 東西は区画のまん中に置き、南北は**当たり判定の手前（北、扉のある側）の面を
 * 区画の北の縁にそろえる。** 建物の扉はすべて +Z を向いているため、区画のすぐ北の
 * マスに道を敷けば、扉の前に立った位置が必ずその道の上に乗る
 * （プレイヤーの当たり判定の半径0.45ぶん手前に立つ。道は2マス＝1.8あるので収まる）。
 * 掲示板のように奥行きの薄い物でも、扉の前と道の間が空かない。
 *
 * 建物の当たり判定は区画（一辺3.6）に収める（mapObjects.ts の `BUILDING_SCALE`）。
 * はみ出すと、隣のマスに置いた装飾が壁にめり込む。
 * @param lot - 区画の南西のマス
 * @param halfDepth - 拡大後の当たり判定の奥行きの半分
 * @returns 建物の中心のXZ座標
 */
export function getLotBuildingPosition(lot: TownCell, halfDepth: number): { x: number; z: number } {
  const bounds = getCellsBounds(lot, BUILDING_LOT_CELLS);
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    z: bounds.maxZ - halfDepth,
  };
}

/**
 * 装飾が占めるマスの数（一辺）を引く。カタログの `placement.cells` で、省略時は1マス。
 *
 * **「省略時は1」はここだけに書く。** 置く位置の目印・置く判定・散らす処理がそれぞれ書くと、
 * 1つ直し忘れたときに互いにずれる。
 * @param assetId - アセットID
 * @returns マスの数。装飾でなければ null
 */
export function getDecorationCells(assetId: string): number | null {
  const placement = getDecorationPlacement(assetId);
  return placement ? placement.cells ?? 1 : null;
}

/**
 * 装飾を、座標にいちばん近いマスへ寄せたときの中心。
 * @param assetId - 装飾のアセットID
 * @param x - X座標
 * @param z - Z座標
 * @returns マスにそろえた中心の座標。装飾でなければ null
 */
export function snapDecorationToCells(assetId: string, x: number, z: number): { x: number; z: number } | null {
  const cells = getDecorationCells(assetId);
  return cells === null ? null : snapToCells(x, z, cells);
}

/**
 * 装飾を、南西のマスを指定して置くときの中心。
 * @param assetId - 装飾のアセットID
 * @param cell - 南西のマス
 * @returns 中心の座標。装飾でなければ null
 */
export function getDecorationCenter(assetId: string, cell: TownCell): { x: number; z: number } | null {
  const cells = getDecorationCells(assetId);
  return cells === null ? null : getCellsCenter(cell, cells);
}

/** `getDecorationMaxScale` の結果。形から毎回計算すると重いので覚えておく。 */
const MAX_SCALE_BY_ID = new Map<string, number>();

/**
 * 装飾を、見た目も当たり判定も占めるマスからはみ出さずに置ける、いちばん大きい拡大率。
 *
 * 見た目の広がりはパーツの形から求める（`getPartsHalfExtent`）。手で書くと、形を直したときにずれる。
 * @param assetId - アセットID
 * @returns 拡大率の上限。装飾でなければ null
 */
export function getDecorationMaxScale(assetId: string): number | null {
  const cached = MAX_SCALE_BY_ID.get(assetId);
  if (cached !== undefined) return cached;
  const placement = getDecorationPlacement(assetId);
  if (!placement) return null;
  const halfCell = ((placement.cells ?? 1) * TOWN_CELL_SIZE) / 2;
  const half = Math.max(getPartsHalfExtent(getBuildingParts(assetId as MapObject["model"])), placement.size / 2);
  const maxScale = half > 0 ? halfCell / half : Infinity;
  MAX_SCALE_BY_ID.set(assetId, maxScale);
  return maxScale;
}

/** マスに1つずつ置く装飾（「かざる」で置ける物）。町の固定物や散らす自然物にも同じ種類を使っている。 */
let gridDecorationIds: ReadonlySet<string> | null = null;

/**
 * マスにそろえて置く装飾か。町の外の柵や家の中の家具は含めない（それらは当たり判定で見る）。
 * @param model - アセットID
 * @returns マスにそろえて置く装飾なら true
 */
function isGridDecoration(model: string): boolean {
  if (!gridDecorationIds) gridDecorationIds = new Set<string>(getPlaceableDecorations());
  return gridDecorationIds.has(model);
}

/**
 * 装飾を、中心の座標に置いたときに占めるマスの範囲。
 * @param assetId - 装飾のアセットID
 * @param x - 中心のX座標
 * @param z - 中心のZ座標
 * @returns マスの範囲。装飾でなければ null
 */
export function getDecorationCellRange(assetId: string, x: number, z: number): CellRange | null {
  const cells = getDecorationCells(assetId);
  if (cells === null) return null;
  const grid = getGridAt(x, z);
  const cell = getCellAt(x, z, cells, grid);
  return { col: cell.col, cols: cells, grid, row: cell.row, rows: cells };
}

/**
 * 当たり判定の箱がかかるマスの範囲。縁が接しているだけのマスは含めない。
 * @param object - 当たり判定を持つ物
 * @returns マスの範囲
 */
function getCollisionCells(object: MapObject): CellRange {
  const size = object.collisionSize as { depth: number; width: number };
  const scale = object.scale ?? 1;
  // 90度刻みでない向きにも対応するため、回したあとの4頂点を囲む四角で見る（movement.ts と同じ考え方）
  const rotation = object.rotationY ?? 0;
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  const halfWidth = ((size.width * cos + size.depth * sin) * scale) / 2;
  const halfDepth = ((size.width * sin + size.depth * cos) * scale) / 2;
  const grid = getGridAt(object.position.x, object.position.z);
  const origin = getGridOrigin(grid);
  const minCol = Math.floor((object.position.x - halfWidth - origin.x) / TOWN_CELL_SIZE + EPSILON);
  const maxCol = Math.ceil((object.position.x + halfWidth - origin.x) / TOWN_CELL_SIZE - EPSILON);
  const minRow = Math.floor((object.position.z - halfDepth - origin.z) / TOWN_CELL_SIZE + EPSILON);
  const maxRow = Math.ceil((object.position.z + halfDepth - origin.z) / TOWN_CELL_SIZE - EPSILON);
  return { col: minCol, cols: Math.max(maxCol - minCol, 1), grid, row: minRow, rows: Math.max(maxRow - minRow, 1) };
}

/**
 * 物が占めるマスの範囲（冒頭の決まりの唯一の実装）。
 * @param object - マップオブジェクト（置こうとしている候補も含む）
 * @returns マスの範囲。マスを占めない物なら null
 */
export function getObjectCells(object: MapObject): CellRange | null {
  if (object.footprint) {
    return {
      col: object.footprint.col,
      cols: object.footprint.cells,
      grid: "town",
      row: object.footprint.row,
      rows: object.footprint.cells,
    };
  }
  if (object.type === "decoration" && isGridDecoration(object.model)) {
    return getDecorationCellRange(object.model, object.position.x, object.position.z);
  }
  if (object.collidable && object.collisionSize) return getCollisionCells(object);
  return null;
}

/**
 * 物を置けないマスの範囲。占めるマス（`getObjectCells`）に加え、区画に置いた建物は
 * 扉の前（区画のすぐ北の1行）も含める。扉の前に物を置かれると、建物に入れなくなるため。
 * @param object - マップオブジェクト
 * @returns マスの範囲の一覧。マスを占めない物なら空
 */
export function getBlockedCells(object: MapObject): CellRange[] {
  const cells = getObjectCells(object);
  if (!cells) return [];
  if (object.type !== "building" || !object.footprint) return [cells];
  return [cells, { col: cells.col, cols: cells.cols, grid: cells.grid, row: cells.row + cells.rows, rows: 1 }];
}

/**
 * 2つのマスの範囲が重なるか。縁が接しているだけ（隣のマス）は重ならない。
 * @param a - 範囲
 * @param b - 範囲
 * @returns 重なれば true
 */
export function cellRangesOverlap(a: CellRange, b: CellRange): boolean {
  return (
    a.grid === b.grid &&
    a.col < b.col + b.cols &&
    b.col < a.col + a.cols &&
    a.row < b.row + b.rows &&
    b.row < a.row + a.rows
  );
}

/**
 * 範囲の中のマスを1つずつ、`Set` に入れられる文字列にする。
 * @param range - マスの範囲
 * @returns マスごとの文字列
 */
export function cellKeys(range: CellRange): string[] {
  const keys: string[] = [];
  for (let col = range.col; col < range.col + range.cols; col += 1) {
    for (let row = range.row; row < range.row + range.rows; row += 1) {
      keys.push(`${range.grid}:${col}:${row}`);
    }
  }
  return keys;
}

/**
 * 物の一覧から、物を置けないマスの集合を作る。たくさん置く処理（散らす処理）で、
 * 毎回全部の物と比べずに済むようにする。
 * @param objects - マップオブジェクト
 * @returns 置けないマスの集合（`cellKeys` の文字列）
 */
export function collectBlockedCells(objects: readonly MapObject[]): Set<string> {
  const blocked = new Set<string>();
  for (const object of objects) {
    for (const range of getBlockedCells(object)) {
      for (const key of cellKeys(range)) blocked.add(key);
    }
  }
  return blocked;
}

/**
 * マスの範囲が、置けないマスの集合のどれとも重ならないか。
 * @param range - 調べる範囲
 * @param blocked - 置けないマスの集合
 * @returns どのマスも空いていれば true
 */
export function isCellRangeFree(range: CellRange, blocked: ReadonlySet<string>): boolean {
  return cellKeys(range).every((key) => !blocked.has(key));
}

/**
 * 範囲を、まわりに `margin` マスずつ広げる。散らす物どうしの間を空けるのに使う。
 * @param range - マスの範囲
 * @param margin - 広げるマスの数
 * @returns 広げた範囲
 */
export function expandCellRange(range: CellRange, margin: number): CellRange {
  return {
    col: range.col - margin,
    cols: range.cols + margin * 2,
    grid: range.grid,
    row: range.row - margin,
    rows: range.rows + margin * 2,
  };
}
