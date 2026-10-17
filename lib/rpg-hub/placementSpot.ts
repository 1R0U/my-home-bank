// 装飾を置く場所の計算（Issue #224）。描画に依存しない純粋な計算だけを持つ。
//
// 置く操作（placement.ts の canPlaceDecoration）と、3Dシーンに出す置き場所の目印
// （webview/rpg-hub/placementMarker.ts）の両方から使う。シーンのバンドルは
// es2017 向けに変換するため、変換できない書き方を含む mapObjects.ts を読み込めない。
// そのためここは catalog.ts・houseInterior.ts・movement.ts だけに頼る。

import { getDecorationCells, getDecorationPlacement, getPlaceableDecorations, groundedY } from "./catalog.ts";
import { getHouseLocation, isOnHouseFloor } from "./houseInterior.ts";
import { getCollisionHalfExtents, isBlocked } from "./movement.ts";
import { snapRotationToQuarter, snapToCells, TOWN_CELL_SIZE } from "./townGrid.ts";
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
  const point = snapToCells(raw.x, raw.z, placement.cells ?? 1);
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

/** マスに1つずつ置く装飾（「かざる」で置ける物）。町の固定物にも同じ種類を使っている。 */
let gridDecorationIds: ReadonlySet<string> | null = null;

/**
 * マスを占める装飾かどうか。道のタイルや家の中の床・壁・家具は含めない。
 * @param object - マップオブジェクト
 * @returns マスを占める装飾なら true
 */
function occupiesCells(object: MapObject): boolean {
  if (object.type !== "decoration") return false;
  gridDecorationIds ??= new Set<string>(getPlaceableDecorations());
  return gridDecorationIds.has(object.model);
}

/**
 * 置こうとしているマスに、もう装飾があるか（Issue #445）。
 *
 * **1マスに置ける装飾は1つだけ。** 踏んで歩ける草むらも1マスを占める。
 * 当たり判定では見ない（草むらは当たり判定を持たない）ため、占めるマスの範囲どうしで比べる。
 * @param candidate - 置こうとしている装飾
 * @param objects - いまのマップオブジェクト一覧
 * @returns 同じマスに装飾があれば true
 */
export function isCellTaken(candidate: MapObject, objects: readonly MapObject[]): boolean {
  const cells = getDecorationCells(candidate.model) ?? 1;
  // 縁が接しているだけ（隣のマス）は重ならない扱いにする
  const epsilon = 1e-6;
  return objects.some((object) => {
    if (object.id === candidate.id || !occupiesCells(object)) return false;
    const otherCells = getDecorationCells(object.model) ?? 1;
    const reach = ((cells + otherCells) * TOWN_CELL_SIZE) / 2 - epsilon;
    return (
      Math.abs(candidate.position.x - object.position.x) < reach &&
      Math.abs(candidate.position.z - object.position.z) < reach
    );
  });
}

/**
 * 家の中にいるのに、置く場所が部屋の床の外になっているか（Issue #444）。
 *
 * 部屋の手前と右は見えない壁しかないので、壁際で外を向くと、正面の置く場所が床の外へ出る。
 * 当たり判定を持つ装飾は、大きさと向きを反映した四角がすべて床の内側にあるかを調べる。
 * 持たない物（踏んで歩ける草など）は中心の1点で調べる。
 * @param candidate - 置こうとしている装飾
 * @param playerPosition - プレイヤーの位置
 * @returns 家の中にいて、置く場所が床の外（はみ出しを含む）なら true。町にいるときは常に false
 */
export function isOutsideHouseFloor(candidate: MapObject, playerPosition: { x: number; z: number }): boolean {
  if (getHouseLocation(playerPosition.x, playerPosition.z) !== "house") return false;
  const half = candidate.collisionSize
    ? getCollisionHalfExtents(candidate.collisionSize, candidate.scale ?? 1, candidate.rotationY ?? 0)
    : { depth: 0, width: 0 };
  return !isOnHouseFloor(candidate.position.x, candidate.position.z, half.width, half.depth);
}

/**
 * 置く場所が、物やプレイヤー自身と重なっているかを調べる。
 *
 * `canPlaceDecoration` のうち軽い部分だけで、毎フレーム呼んでよい（置き場所の目印の色に使う）。
 * 置いたあとに建物へ行けるかの判定は重いので含めない。
 * @param candidate - 置こうとしている装飾
 * @param objects - いまのマップオブジェクト一覧
 * @param playerPosition - プレイヤーの位置
 * 家の中で、置く場所が部屋の床の外になっているときも置けない（`isOutsideHouseFloor`）。
 * 同じマスにもう装飾があるときも置けない（`isCellTaken`）。
 * @returns 重なっていて置けなければ true。踏んで歩ける装飾は、床の外でも埋まったマスでもなければ false
 */
export function isPlacementSpotBlocked(
  candidate: MapObject,
  objects: readonly MapObject[],
  playerPosition: { x: number; z: number },
): boolean {
  if (isOutsideHouseFloor(candidate, playerPosition)) return true;
  // 同じマスに装飾があれば、踏んで歩ける物でも置けない
  if (isCellTaken(candidate, objects)) return true;
  if (!(candidate.collidable && candidate.collisionSize)) return false;
  // **自分のいる場所には置けない。** 置けると自分を閉じ込める
  if (isBlocked(playerPosition.x, playerPosition.z, [candidate])) return true;
  // 既にある物の上にも置けない
  return overlapsSolid(candidate, objects);
}

/**
 * 置こうとしている装飾の当たり判定が、既にある物の当たり判定と重なるか。
 *
 * **四角どうしで比べ、縁が接しているだけなら重ならない扱いにする。** 隣り合うマスに
 * 置いた物は縁がちょうど接する（Issue #445）。以前は置く点をプレイヤー（半径0.45）に
 * 見立てて `isBlocked` で調べていたため、隣のマスの物とも重なっていると判定され、
 * 1マスおきにしか置けなかった。
 * @param candidate - 置こうとしている装飾（当たり判定を持つもの）
 * @param objects - いまのマップオブジェクト一覧
 * @returns 重なっていれば true
 */
function overlapsSolid(candidate: MapObject, objects: readonly MapObject[]): boolean {
  if (!candidate.collisionSize) return false;
  const half = getCollisionHalfExtents(candidate.collisionSize, candidate.scale ?? 1, candidate.rotationY ?? 0);
  const epsilon = 1e-6;
  return objects.some((object) => {
    if (!object.collidable || !object.collisionSize || object.id === candidate.id) return false;
    const other = getCollisionHalfExtents(object.collisionSize, object.scale ?? 1, object.rotationY ?? 0);
    return (
      Math.abs(candidate.position.x - object.position.x) < half.width + other.width - epsilon &&
      Math.abs(candidate.position.z - object.position.z) < half.depth + other.depth - epsilon
    );
  });
}
