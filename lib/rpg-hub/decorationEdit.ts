// かざるの編集モード（Issue #477）で、置く・動かす・回すときの判定と、置いた装飾の書き換え。
//
// 3Dシーンから「このマスに下ろした」と届いたあと、本当に置いてよいかをここで決める。
// 置いたあとに建物へ行けるかの確認（`canPlaceDecoration`）は重いので、シーンの目印では見ず、
// 指を離したときに1回だけ調べる。
//
// 描画に依存しない純粋な計算だけを持つ。mapObjects.ts を読み込むので、シーンのバンドルには入れない。

import { filterObjectsByLocation } from "./mapObjects.ts";
import { isFurnitureSpotBlocked, isMovableFurnitureId, placeFurnitureAt } from "./houseFurniture.ts";
import {
  canPlaceDecoration,
  createDecorationCandidate,
  isBuildingReachable,
  type PlacementRejection,
} from "./placement.ts";
import { isPlacedDecorationId } from "./placedId.ts";
import { getHouseLocation } from "./houseInterior.ts";
import { QUARTER_TURN, snapRotationToQuarter } from "./townGrid.ts";
import type { MapObject } from "../../types/map";

/** 置いた装飾の書き換え。指定しなかった値は変えない。 */
export type PlacedDecorationChange = { rotationY?: number; x?: number; z?: number };

/** 置く・動かす判定の結果。置けるなら候補、置けないなら理由。 */
export type EditCheckResult =
  | { candidate: MapObject; rejection: null }
  | { candidate: MapObject | null; rejection: PlacementRejection };

/**
 * 判定を、置く場所と同じ区画（家の中・町）の物だけに絞る。他の区画とは壁で閉じられていて
 * 行き来できないので、含めると到達の判定が余分に重くなる（1R0Uさんレビュー指摘）。
 * @param objects - マップオブジェクト一覧
 * @param point - 置く場所
 * @returns 同じ区画の物
 */
function objectsNear(objects: readonly MapObject[], point: { x: number; z: number }): MapObject[] {
  return filterObjectsByLocation(objects, getHouseLocation(point.x, point.z));
}

/**
 * 下の一覧から引っぱってきた装飾を、指を離したマスに置いてよいか。
 * @param assetId - 置く装飾
 * @param point - 指を離したマスの中心
 * @param objects - いまのマップオブジェクト一覧
 * @param player - プレイヤーの位置（プレイヤーと重なる場所・閉じ込める置き方は断る）
 * @param placedCount - すでに置いてある数
 * @returns 置ける候補か、置けない理由
 */
export function checkNewPlacement(
  assetId: string,
  point: { x: number; z: number },
  objects: readonly MapObject[],
  player: { x: number; z: number },
  placedCount: number,
): EditCheckResult {
  const candidate = createDecorationCandidate(assetId, point);
  // カタログに無い装飾は、どこにも置けない
  if (!candidate) return { candidate: null, rejection: "blocked" };
  const rejection = canPlaceDecoration(candidate, objectsNear(objects, candidate.position), player, placedCount);
  return rejection ? { candidate, rejection } : { candidate, rejection: null };
}

/**
 * 置いてある装飾を、指を離したマスへ動かしてよいか。
 *
 * **動かす装飾そのものは、判定から外す。** 外さないと、元の場所と重なる近くのマスへ
 * 少しずらすだけの移動が「埋まっている」で断られる。数も1つ減らして数える（置き直すだけなので、
 * 上限ちょうど置いてあっても動かせる）。向きは今のまま。
 * @param objectId - 動かす装飾のid
 * @param point - 指を離したマスの中心
 * @param objects - いまのマップオブジェクト一覧
 * @param player - プレイヤーの位置
 * @param placedCount - すでに置いてある数
 * @returns 置ける候補か、置けない理由
 */
export function checkMove(
  objectId: string,
  point: { x: number; z: number },
  objects: readonly MapObject[],
  player: { x: number; z: number },
  placedCount: number,
): EditCheckResult {
  const moving = objects.find((object) => object.id === objectId);
  if (!moving || !isPlacedDecorationId(objectId)) return { candidate: null, rejection: "blocked" };
  const candidate = createDecorationCandidate(moving.model, point, moving.rotationY ?? 0, objectId);
  if (!candidate) return { candidate: null, rejection: "blocked" };
  const others = objects.filter((object) => object.id !== objectId);
  const rejection = canPlaceDecoration(
    candidate,
    objectsNear(others, candidate.position),
    player,
    Math.max(0, placedCount - 1),
  );
  return rejection ? { candidate, rejection } : { candidate, rejection: null };
}

/**
 * 家具を、指を離したマスへ動かす・その場で回すとしたとき、置いてよいか（Issue #477）。
 *
 * 装飾と同じ判定（占めるマスが空いている・床の上・プレイヤーと重ならない・ほかの建物へ行ける）に加えて、
 * 機能のある家具（建物。クローゼット）は
 * - 家具の正面（使うときに立つ所）のマスが床の上で、空いていること
 * - 動かしたあとも、その家具の正面へ歩いて近づけること（きがえられなくならない）
 * を確かめる。飾りの家具（ソファ・植木。Issue #506）は使わないので、装飾と同じ判定だけで決める。
 * 動かす家具そのもの（正面のマットも形の一部）は判定から外す。
 * @param furnitureId - 動かす家具のid
 * @param point - 置きたいマスの中心（回すだけなら今の位置）
 * @param rotationY - 置くときの向き（動かすだけなら今の向き）
 * @param objects - いまのマップオブジェクト一覧
 * @param player - プレイヤーの位置
 * @returns 置ける候補か、置けない理由
 */
export function checkFurnitureChange(
  furnitureId: string,
  point: { x: number; z: number },
  rotationY: number,
  objects: readonly MapObject[],
  player: { x: number; z: number },
): EditCheckResult {
  const furniture = objects.find((object) => object.id === furnitureId);
  if (!furniture || !isMovableFurnitureId(furnitureId)) {
    return { candidate: null, rejection: "blocked" };
  }
  const candidate = placeFurnitureAt(furniture, point, rotationY);
  const zone = objectsNear(objects, candidate.position);
  const others = zone.filter((object) => object.id !== furnitureId);
  // 置ける数の上限は家具には関係しないので、0として数える
  const rejection = canPlaceDecoration(candidate, others, player, 0);
  if (rejection) return { candidate, rejection };
  // 正面のマスは建物にしか無いので、飾りの家具では床の上・空きだけを見る
  if (isFurnitureSpotBlocked(candidate, zone, player)) return { candidate, rejection: "blocked" };
  if (candidate.type === "building" && !isBuildingReachable([...others, candidate], player, furnitureId)) {
    return { candidate, rejection: "unreachable" };
  }
  return { candidate, rejection: null };
}

/**
 * 「まわす」を押したときの向き。今の向きから90度ずつ回す（上から見て反時計回り）。
 *
 * 装飾が占めるマスは正方形（1マスか 2×2 マス）なので、回しても占めるマスは変わらない。
 * 置けるかを調べ直す必要はない。家具は長方形のことがあるので、`checkFurnitureChange` で調べる。
 * @param rotationY - 今の向き（ラジアン）
 * @returns 90度回した向き（-π/2 〜 π）
 */
export function rotateQuarterTurn(rotationY: number): number {
  return snapRotationToQuarter(snapRotationToQuarter(rotationY) + QUARTER_TURN);
}

/**
 * 置いた装飾の一覧のうち1つを書き換えた、新しい一覧を返す（保存を待たずに画面へ出すため）。
 * @param placed - 置いた装飾の一覧
 * @param objectId - 書き換える装飾のid
 * @param change - 書き換える値
 * @returns 書き換えた一覧。見つからなければ元の一覧のまま
 */
export function applyPlacedChange(
  placed: readonly MapObject[],
  objectId: string,
  change: PlacedDecorationChange,
): MapObject[] {
  return placed.map((object) =>
    object.id === objectId
      ? {
          ...object,
          position: {
            ...object.position,
            x: change.x ?? object.position.x,
            z: change.z ?? object.position.z,
          },
          rotationY: change.rotationY ?? object.rotationY,
        }
      : object,
  );
}
