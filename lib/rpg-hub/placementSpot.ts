// 装飾を置く場所の計算（Issue #224）。描画に依存しない純粋な計算だけを持つ。
//
// 置く操作（placement.ts の canPlaceDecoration）と、3Dシーンの編集モードで出す置き場所の目印
// （webview/rpg-hub/decorationEditor.ts）の両方から使う。シーンのバンドルは
// es2017 向けに変換するため、変換できない書き方を含む mapObjects.ts を読み込めない。
// そのためここは catalog.ts・houseInterior.ts・movement.ts・townGrid.ts・worldBounds.ts だけに頼る。

import { getDecorationPlacement, groundedY } from "./catalog.ts";
import { getHouseLocation, isOnHouseFloor } from "./houseInterior.ts";
import { getCollisionHalfExtents, isBlocked } from "./movement.ts";
import {
  cellRangesOverlap,
  getBlockedCells,
  getCellRangeBounds,
  getObjectCells,
  snapDecorationToCells,
  snapRotationToQuarter,
} from "./townGrid.ts";
import { WORLD_HALF, isInsideWorld } from "./worldBounds.ts";
import type { MapObject } from "../../types/map";

/** 置こうとしている候補のid。マップの物のidと重ならないようにする。 */
export const CANDIDATE_ID = "__candidate__";

/**
 * 選んだ装飾を、指定した点に置くとしたときのマップオブジェクトを作る。
 *
 * **置く場所は点にいちばん近いマス、向きはいちばん近い90度刻み**にする（Issue #445）。
 * 1マスに1つずつ置くため。向きを斜めにすると当たり判定が1マスからはみ出す。
 *
 * 置く操作（RN 側の編集モード）と、置き場所の目印（webview/rpg-hub/decorationEditor.ts）の
 * 両方がこれを使う。別々に組み立てると、目印は置けると出ているのに置けない、という
 * ずれが起きるため。
 * @param assetId - 置く装飾のアセットID
 * @param point - 置きたい点（指を離した点など）。マスへ寄せる
 * @param rotationY - 向き（ラジアン、0が +Z）。90度刻みへ寄せる
 * @param id - 候補のid。置いてある装飾を動かすときは、その装飾のidを渡す
 * @returns 置く候補。装飾でないIDなら null
 */
export function createDecorationCandidate(
  assetId: string,
  point: { x: number; z: number },
  rotationY = 0,
  id = CANDIDATE_ID,
): MapObject | null {
  const placement = getDecorationPlacement(assetId);
  if (!placement) return null;
  const snapped = snapDecorationToCells(assetId, point.x, point.z) as { x: number; z: number };
  const solid = placement.solid !== false;
  return {
    collidable: solid,
    ...(solid ? { collisionSize: { depth: placement.size, width: placement.size } } : {}),
    id,
    interactive: false,
    model: assetId as MapObject["model"],
    position: { x: snapped.x, y: groundedY(placement.halfHeight, 1), z: snapped.z },
    rotationY: snapRotationToQuarter(rotationY),
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
 * 部屋の手前と右は見えない壁しかないので、指を床の外まで引っぱると、置く場所が床の外へ出る。
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
  // 横と縦のマス数は別々に使う。家具は長方形のことがある（Issue #477。以前は横の数を縦にも使っていて、
  // 1 × 2 マスに回したクローゼットの範囲を短く見積もり、床の外と判定していた）
  const bounds = cells
    ? getCellRangeBounds(cells)
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
