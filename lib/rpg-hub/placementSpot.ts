// 装飾を置く場所の計算（Issue #224）。描画に依存しない純粋な計算だけを持つ。
//
// 置く操作（placement.ts の canPlaceDecoration）と、3Dシーンに出す置き場所の目印
// （webview/rpg-hub/placementMarker.ts）の両方から使う。シーンのバンドルは
// es2017 向けに変換するため、変換できない書き方を含む mapObjects.ts を読み込めない。
// そのためここは catalog.ts と movement.ts だけに頼る。

import { getDecorationPlacement, groundedY } from "./catalog.ts";
import { isBlocked } from "./movement.ts";
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
  const point = getPlacementPoint(position, facingY);
  const solid = placement.solid !== false;
  return {
    collidable: solid,
    ...(solid ? { collisionSize: { depth: placement.size, width: placement.size } } : {}),
    id: "__candidate__",
    interactive: false,
    model: assetId as MapObject["model"],
    position: { x: point.x, y: groundedY(placement.halfHeight, 1), z: point.z },
    type: "decoration",
  };
}

/**
 * 置く場所が、物やプレイヤー自身と重なっているかを調べる。
 *
 * `canPlaceDecoration` のうち軽い部分だけで、毎フレーム呼んでよい（置き場所の目印の色に使う）。
 * 置いたあとに建物へ行けるかの判定は重いので含めない。
 * @param candidate - 置こうとしている装飾
 * @param objects - いまのマップオブジェクト一覧
 * @param playerPosition - プレイヤーの位置
 * @returns 重なっていて置けなければ true。踏んで歩ける装飾は常に false
 */
export function isPlacementSpotBlocked(
  candidate: MapObject,
  objects: readonly MapObject[],
  playerPosition: { x: number; z: number },
): boolean {
  if (!(candidate.collidable && candidate.collisionSize)) return false;
  // **自分のいる場所には置けない。** 置けると自分を閉じ込める
  if (isBlocked(playerPosition.x, playerPosition.z, [candidate])) return true;
  // 既にある物の上にも置けない
  return isBlocked(candidate.position.x, candidate.position.z, objects);
}
