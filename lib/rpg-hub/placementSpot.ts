// 装飾を置く場所の計算（Issue #224）。描画に依存しない純粋な計算だけを持つ。
//
// 置く操作（placement.ts の canPlaceDecoration）と、3Dシーンに出す置き場所の目印
// （webview/rpg-hub/placementMarker.ts）の両方から使う。シーンのバンドルは
// es2017 向けに変換するため、変換できない書き方を含む mapObjects.ts を読み込めない。
// そのためここは catalog.ts・houseInterior.ts・movement.ts・townGrid.ts・worldBounds.ts だけに頼る。

import { getDecorationPlacement, groundedY } from "./catalog.ts";
import { getHouseLocation, isOnHouseFloor } from "./houseInterior.ts";
import { getCollisionHalfExtents, isBlocked } from "./movement.ts";
import {
  cellRangesOverlap,
  getBlockedCells,
  getCellsBounds,
  getObjectCells,
  snapDecorationToCells,
  snapRotationToQuarter,
} from "./townGrid.ts";
import { WORLD_HALF, isInsideWorld } from "./worldBounds.ts";
import type { MapObject } from "../../types/map";

/** プレイヤーの正面、どれだけ先に置くか（ワールド座標）。 */
export const PLACE_DISTANCE = 1.6;

/**
 * プレイヤーの正面の座標を求める。
 *
 * 置く場所をタップで指定せず「正面に置く」ことにしてあるのは、**歩いて位置を決める**
 * ためで、こうすると仮想パッド（画面全体に張った PanResponder）と取り合いにならない。
 * @param position - プレイヤーの位置
 * @param facingY - プレイヤーの向き（ラジアン、0が +Z）
 * @returns 置く場所のXZ座標
 */
export function getPlacementPoint(
  position: { x: number; z: number },
  facingY: number,
): { x: number; z: number } {
  return {
    x: position.x + Math.sin(facingY) * PLACE_DISTANCE,
    z: position.z + Math.cos(facingY) * PLACE_DISTANCE,
  };
}

/**
 * 選んだ装飾を、プレイヤーの正面に置くとしたときのマップオブジェクトを作る。
 *
 * **置く場所は正面の点に近いマス、向きはプレイヤーの向きに近い90度刻み**にする（Issue #445）。
 * 1マスに1つずつ置くため。向きを斜めにすると当たり判定が1マスからはみ出す。
 *
 * 置く操作（RpgHubScreen）と、置き場所の目印（webview/rpg-hub/placementMarker.ts）の
 * 両方がこれを使う。別々に組み立てると、目印は置けると出ているのに置けない、という
 * ずれが起きるため。
 * @param assetId - 置く装飾のアセットID
 * @param position - プレイヤーの位置
 * @param facingY - プレイヤーの向き（ラジアン、0が +Z）
 * @returns 置く候補。装飾でないIDなら null
 */
export function createPlacementCandidate(
  assetId: string,
  position: { x: number; z: number },
  facingY: number,
): MapObject | null {
  const placement = getDecorationPlacement(assetId);
  if (!placement) return null;
  const raw = getPlacementPoint(position, facingY);
  const point = snapDecorationToCells(assetId, raw.x, raw.z) as { x: number; z: number };
  const solid = placement.solid !== false;
  return {
    collidable: solid,
    ...(solid ? { collisionSize: { depth: placement.size, width: placement.size } } : {}),
    id: "__candidate__",
    interactive: false,
    model: assetId as MapObject["model"],
    position: { x: point.x, y: groundedY(placement.halfHeight, 1), z: point.z },
    rotationY: snapRotationToQuarter(facingY),
    type: "decoration",
  };
}

/**
 * 置こうとしているマスが、ほかの物で埋まっているか（Issue #445）。
 *
 * **置けるかはマスの空きで決める**（townGrid.ts の決まり）。建物の区画と扉の前・道・装飾・NPC・
 * 家の中の家具が占めるマスと、候補が占めるマスが1つでも重なれば置けない。踏んで歩ける草むらも1マスを占める。
 * 当たり判定の箱どうしでは比べない（以前はマスと箱の2本立てで、建物の横のめり込みなどを見落としていた）。
 * @param candidate - 置こうとしている装飾
 * @param objects - いまのマップオブジェクト一覧
 * @returns 埋まっていれば true
 */
export function isCellTaken(candidate: MapObject, objects: readonly MapObject[]): boolean {
  const cells = getObjectCells(candidate);
  if (!cells) return false;
  return objects.some(
    (object) =>
      object.id !== candidate.id && getBlockedCells(object).some((range) => cellRangesOverlap(cells, range)),
  );
}

/**
 * 町にいるとき、置こうとしている装飾が町の境界（柵・海）からはみ出すかを調べる（Issue #194）。
 *
 * 柵の外や海の上に置けると、歩いて取りに行けず、しまえなくなる。
 * 当たり判定を持つものは大きさまで、踏んで歩けるものは中心だけを見る。
 * 家の中は町の外にある別の場所（壁で囲まれている）なので、ここでは見ない。
 * @param candidate - 置こうとしている装飾
 * @param playerPosition - プレイヤーの位置
 * @returns はみ出すなら true
 */
function isOutsideTown(candidate: MapObject, playerPosition: { x: number; z: number }): boolean {
  if (!isInsideWorld(playerPosition.x, playerPosition.z)) return false;
  const half = candidate.collisionSize
    ? getCollisionHalfExtents(candidate.collisionSize, candidate.scale ?? 1, candidate.rotationY ?? 0)
    : { depth: 0, width: 0 };
  return (
    Math.abs(candidate.position.x) + half.width > WORLD_HALF ||
    Math.abs(candidate.position.z) + half.depth > WORLD_HALF
  );
}

/**
 * 家の中にいるのに、置く場所が部屋の床の外になっているか（Issue #444）。
 *
 * 部屋の手前と右は見えない壁しかないので、壁際で外を向くと、正面の置く場所が床の外へ出る。
 * **占めるマス（1マスまたは 2×2 マス）がすべて床の内側にあるか**を調べる（Issue #445）。
 * 踏んで歩ける草むらのように当たり判定を持たない物も、マス全体で見る。中心の1点だけで見ると、
 * マスの一部が床の外へ出ていても置けてしまう。当たり判定はマスに収めてあるので、マスで見れば足りる。
 * @param candidate - 置こうとしている装飾
 * @param playerPosition - プレイヤーの位置
 * @returns 家の中にいて、置く場所が床の外（はみ出しを含む）なら true。町にいるときは常に false
 */
export function isOutsideHouseFloor(candidate: MapObject, playerPosition: { x: number; z: number }): boolean {
  if (getHouseLocation(playerPosition.x, playerPosition.z) !== "house") return false;
  const collision = candidate.collisionSize
    ? getCollisionHalfExtents(candidate.collisionSize, candidate.scale ?? 1, candidate.rotationY ?? 0)
    : { depth: 0, width: 0 };
  // 占めるマスの範囲（家の中のマス）と、念のため当たり判定とも比べ、広いほうで見る
  // （マスに収まらない物を足したときに緩くならないように）
  const cells = getObjectCells(candidate);
  const bounds = cells
    ? getCellsBounds({ col: cells.col, row: cells.row }, cells.cols, cells.grid)
    : { maxX: candidate.position.x, maxZ: candidate.position.z, minX: candidate.position.x, minZ: candidate.position.z };
  const halfWidth = Math.max(collision.width, (bounds.maxX - bounds.minX) / 2);
  const halfDepth = Math.max(collision.depth, (bounds.maxZ - bounds.minZ) / 2);
  return !isOnHouseFloor((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2, halfWidth, halfDepth);
}

/**
 * 置く場所のマスが埋まっているか、プレイヤー自身と重なっているか、町の境界からはみ出すかを調べる。
 *
 * `canPlaceDecoration` のうち軽い部分だけで、毎フレーム呼んでよい（置き場所の目印の色に使う）。
 * 置いたあとに建物へ行けるかの判定は重いので含めない。
 * 家の中で、置く場所が部屋の床の外になっているときも置けない（`isOutsideHouseFloor`）。
 * @param candidate - 置こうとしている装飾
 * @param objects - いまのマップオブジェクト一覧
 * @param playerPosition - プレイヤーの位置
 * @returns 置けなければ true。踏んで歩ける装飾は、町の境界・家の床の外・埋まったマスのときだけ true
 */
export function isPlacementSpotBlocked(
  candidate: MapObject,
  objects: readonly MapObject[],
  playerPosition: { x: number; z: number },
): boolean {
  if (isOutsideTown(candidate, playerPosition)) return true;
  if (isOutsideHouseFloor(candidate, playerPosition)) return true;
  // 占めるマスが埋まっていれば、踏んで歩ける物でも置けない
  if (isCellTaken(candidate, objects)) return true;
  if (!(candidate.collidable && candidate.collisionSize)) return false;
  // **自分のいる場所には置けない。** 置けると自分を閉じ込める（プレイヤーはマスを占めないので当たり判定で見る）
  return isBlocked(playerPosition.x, playerPosition.z, [candidate]);
}
