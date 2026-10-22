// 家の中の家具を、かざるの編集モードで動かす・回す（Issue #477）。
//
// 動かせるのは今はクローゼットだけ。家具はストアで買う物ではないので、しまえない（動かす・回すだけ）。
// 位置と向きは利用者ごとに house_furniture_layouts へ保存し、行が無ければ最初の位置
// （houseInterior.ts の定数）に置く。
//
// **家具は長方形のことがある**（クローゼットは横2 × 奥行き1マス）。装飾（1マスか 2×2）と違い、
// 回すと占めるマスが変わるので、回せるかも置けるかと同じく調べる。
//
// WebView のシーン（持ち上げて動かすときの目印）からも使うので、mapObjects.ts を読み込まない。
// 引数での分割代入も使わない（es2017 向けのバンドルで変換できないため）。

import { HOUSE_GRID_ORIGIN, isOnHouseFloor } from "./houseInterior.ts";
import { isPlacedDecorationId } from "./placedId.ts";
import { isPlacementSpotBlocked } from "./placementSpot.ts";
import {
  cellRangesOverlap,
  getCellAt,
  getCellRangeBounds,
  getFrontCells,
  getGridAt,
  getObjectCells,
  snapRotationToQuarter,
  TOWN_CELL_SIZE,
} from "./townGrid.ts";
import type { MapObject } from "../../types/map";

/** 動かせる家具のid。DBの house_furniture_layouts_furniture_allowed と同じ一覧にする */
export const MOVABLE_FURNITURE_IDS: readonly string[] = ["house-closet"];

/** 動かせる家具の名前。編集モードで選んだときにパネルへ出す（子供が読むので、ひらがな・カタカナ） */
const FURNITURE_LABELS: Record<string, string> = { "house-closet": "クローゼット" };

/**
 * 家具の名前。
 * @param id - 家具のid
 * @returns 名前。無ければ「かぐ」
 */
export function getFurnitureLabel(id: string): string {
  return FURNITURE_LABELS[id] ?? "かぐ";
}

/** 家具の位置と向き（`house_furniture_layouts` の1行を、アプリで使う形にしたもの） */
export type HouseFurnitureLayout = { furnitureId: string; rotationY: number; x: number; z: number };

/** 浮動小数の誤差で、ちょうどマスの幅の家具が1マス多く数えられないようにする幅 */
const EPSILON = 1e-6;

/**
 * 動かせる家具のidか。
 * @param id - マップ上のオブジェクトid
 * @returns 動かせる家具なら true
 */
export function isMovableFurnitureId(id: string): boolean {
  return MOVABLE_FURNITURE_IDS.includes(id);
}

/**
 * 編集モードで選べる・動かせる物か（置いた装飾と、動かせる家具）。
 * @param id - マップ上のオブジェクトid
 * @returns 選べるなら true
 */
export function isEditableId(id: string): boolean {
  return isPlacedDecorationId(id) || isMovableFurnitureId(id);
}

/**
 * 向き（Y軸まわり）の分だけ、XZ平面の向きを回す。0 の向き（+Z）を回すと (sin, cos) になる
 * （プレイヤーの向き `facingY` と同じ決まり）。
 * @param offset - 回す向き
 * @param angle - 回す角度（ラジアン）
 * @returns 回した向き
 */
function rotateXZ(offset: { x: number; z: number }, angle: number): { x: number; z: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: offset.x * cos + offset.z * sin, z: -offset.x * sin + offset.z * cos };
}

/**
 * 家具が、その向きで占めるマスの数（横・奥行き）。当たり判定の大きさから求める。
 * @param object - 家具
 * @param rotationY - 向き。省略時は今の向き
 * @returns 横（cols）と奥行き（rows）のマス数
 */
export function getFurnitureCells(object: MapObject, rotationY = object.rotationY ?? 0): { cols: number; rows: number } {
  const size = object.collisionSize ?? { depth: TOWN_CELL_SIZE, width: TOWN_CELL_SIZE };
  const cols = Math.max(1, Math.ceil(size.width / TOWN_CELL_SIZE - EPSILON));
  const rows = Math.max(1, Math.ceil(size.depth / TOWN_CELL_SIZE - EPSILON));
  // 90度・270度なら横と奥行きが入れ替わる
  const quarter = Math.round(snapRotationToQuarter(rotationY) / (Math.PI / 2));
  return Math.abs(quarter) % 2 === 1 ? { cols: rows, rows: cols } : { cols, rows };
}

/**
 * 家具を、点にいちばん近いマスへ、指定した向きで置き直したものを作る。
 *
 * 正面（`entranceOffset`）も一緒に回す。きがえるボタンが出る場所・建物から出るときに立つ場所は
 * ここから決まる（movement.ts の `getInteractionPoint` / `getBuildingExitPoint`）。
 * @param object - 家具（今の位置・向きのもの）
 * @param point - 置きたい点
 * @param rotationY - 向き（90度刻みへ寄せる）
 * @returns 置き直した家具
 */
export function placeFurnitureAt<T extends MapObject>(object: T, point: { x: number; z: number }, rotationY: number): T {
  const rotation = snapRotationToQuarter(rotationY);
  const cells = getFurnitureCells(object, rotation);
  // 家具は家の中にしか無いので、家の中のマスへ寄せる
  const origin = HOUSE_GRID_ORIGIN;
  const col = Math.round((point.x - origin.x) / TOWN_CELL_SIZE - cells.cols / 2 + EPSILON) || 0;
  const row = Math.round((point.z - origin.z) / TOWN_CELL_SIZE - cells.rows / 2 + EPSILON) || 0;
  const position = {
    ...object.position,
    x: origin.x + (col + cells.cols / 2) * TOWN_CELL_SIZE,
    z: origin.z + (row + cells.rows / 2) * TOWN_CELL_SIZE,
  };
  if (object.type !== "building") return { ...object, position, rotationY: rotation };
  // 今の向きの分を戻してから、新しい向きへ回す
  const base = rotateXZ(object.entranceOffset, -(object.rotationY ?? 0));
  const turned = rotateXZ(base, rotation);
  return {
    ...object,
    entranceOffset: { x: turned.x, y: object.entranceOffset.y, z: turned.z },
    position,
    rotationY: rotation,
  };
}

/**
 * 保存されている家具の位置と向きを、マップに反映する。行の無い家具は最初の位置のまま。
 * 正面のマットは家具の形の一部なので、家具と一緒に動く（houseInteriorParts.ts の frontMatParts）。
 * @param objects - マップオブジェクト（家具は最初の位置のもの）
 * @param layouts - 保存されている位置と向き
 * @returns 家具を置き直した一覧
 */
export function applyFurnitureLayouts(objects: readonly MapObject[], layouts: readonly HouseFurnitureLayout[]): MapObject[] {
  const byId = new Map(layouts.filter((layout) => isMovableFurnitureId(layout.furnitureId)).map((layout) => [layout.furnitureId, layout]));
  if (byId.size === 0) return [...objects];
  return objects.map((object) => {
    const layout = byId.get(object.id);
    return layout ? placeFurnitureAt(object, layout, layout.rotationY) : object;
  });
}

/**
 * 家具を、そこへその向きで置いたときに置けないか（軽い判定。編集モードの目印の色に使う）。
 *
 * - 占めるマスが埋まっている・床の外・プレイヤーと重なる（装飾と同じ `isPlacementSpotBlocked`）
 * - 正面（使うときに立つ所）のマスが、床の外か、ほかの物で埋まっている
 *
 * 動かす家具そのものは判定から外す。
 * 置いたあとに建物（家の出口・家具）へ行けるかの判定は重いので含めない（`checkFurnitureMove`）。
 * @param candidate - 置き直した家具（`placeFurnitureAt` の結果）
 * @param objects - いまのマップオブジェクト一覧
 * @param playerPosition - プレイヤーの位置
 * @returns 置けなければ true
 */
export function isFurnitureSpotBlocked(
  candidate: MapObject,
  objects: readonly MapObject[],
  playerPosition: { x: number; z: number },
): boolean {
  const others = objects.filter((object) => object.id !== candidate.id);
  if (isPlacementSpotBlocked(candidate, others, playerPosition)) return true;
  const front = getFrontCells(candidate);
  if (!front) return false;
  const bounds = getCellRangeBounds(front);
  const halfWidth = (bounds.maxX - bounds.minX) / 2;
  const halfDepth = (bounds.maxZ - bounds.minZ) / 2;
  if (!isOnHouseFloor(bounds.minX + halfWidth, bounds.minZ + halfDepth, halfWidth, halfDepth)) return true;
  return others.some((object) => {
    const cells = getObjectCells(object);
    return cells !== null && cellRangesOverlap(cells, front);
  });
}

/**
 * その点のマスを占めている、編集モードで選べる物（置いた装飾・動かせる家具）のidを探す。
 *
 * 3Dの形に指が当たらなかったとき（草むらのような低い物や、マスの端を押したとき）に使う。
 * 町の固定物（建物・道・散らした木）や、動かせない家具は返さない。
 * @param objects - マップオブジェクト一覧
 * @param x - 点のX座標
 * @param z - 点のZ座標
 * @returns 選べる物のid。無ければ null
 */
export function findEditableAt(objects: readonly MapObject[], x: number, z: number): string | null {
  const grid = getGridAt(x, z);
  const cell = getCellAt(x, z, 1, grid);
  const point = { col: cell.col, cols: 1, grid, row: cell.row, rows: 1 };
  // マスが重なることは無いはずだが、後から置いたものを優先する（上に見えているほう）
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index];
    if (!isEditableId(object.id)) continue;
    const cells = getObjectCells(object);
    if (cells && cellRangesOverlap(cells, point)) return object.id;
  }
  return null;
}
