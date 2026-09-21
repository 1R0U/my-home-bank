// DBに保存された「置いた装飾」を、マップに出せる形へ変換する（Issue #223）。
//
// **DBは外から来るデータとして扱う。** 行が壊れていても画面全体を落とさず、
// その行だけ捨てて残りを表示する。検証は `parseMapObjects` に任せる
// （あの関数は map_objects への移行を見越して先に置かれていた。#101）。
//
// 見た目・当たり判定の大きさ・地面に接する高さは、**DBではなくカタログから引く**
// （lib/rpg-hub/catalog.ts）。形を作り直しても、置いたものが宙に浮かないようにするため。
//
// **家の中に置いたものは、部屋の中心からの相対座標で持つ**（Issue #244）。
// 部屋の位置はアプリ側の定数なので、並べ方を変えてもDBの行はそのまま使える。

import { getDecorationPlacement, groundedY } from "./catalog.ts";
import { parseMapObjects } from "./mapObjects.ts";
import type { MapObject } from "../../types/map";

/**
 * `placed_decorations` の1行。
 *
 * 列名はDBに合わせたスネークケース。`numeric` は取得時に文字列で返ることがあるため、
 * 数値として扱う前に必ず `Number` を通す。
 */
export type PlacedDecorationRow = {
  asset_id: string;
  id: string;
  position_x: number | string;
  position_z: number | string;
  rotation_y: number | string;
  /**
   * 家の中に置いた場合の、その家の持ち主（`users.id`）。
   * null なら町・庭で、座標はワールド座標。
   */
  room_owner_id: string | null;
  scale: number | string;
  /** 置いた人（`users.id`）。しまえるのは自分が置いたものだけ */
  user_id: string;
};

/**
 * 置いた装飾のオブジェクトIDにつける接頭辞。
 * 町の固定物（`building-bank` や `scatter-12` など）とぶつからないようにする。
 */
export const PLACED_ID_PREFIX = "placed-";

/**
 * DBの行を、`parseMapObject` に渡せる候補の形にする。
 *
 * ここでは検証しない。**未知のアセットIDでも候補は作る**（`collisionSize` を
 * 付けられないまま返す）。弾くのは `parseMapObjects` の仕事で、
 * 判定を2か所に分けると片方だけ緩くなる。
 * @param row - DBの1行
 * @param origin - 座標の基準。家の中なら部屋の中心、外なら原点
 * @returns 検証前の候補
 */
export function toCandidate(
  row: PlacedDecorationRow,
  origin: { x: number; z: number } = { x: 0, z: 0 },
): Record<string, unknown> {
  const scale = Number(row.scale);
  const placement = getDecorationPlacement(row.asset_id);
  // 踏んで歩けるもの（草むらなど）は当たり判定を持たせない。
  // movement.ts は collisionSize が無いものを判定から外す。
  const solid = placement !== null && placement.solid !== false;

  return {
    collidable: solid,
    ...(solid && placement
      ? { collisionSize: { depth: placement.size, width: placement.size } }
      : {}),
    id: `${PLACED_ID_PREFIX}${row.id}`,
    interactive: false,
    model: row.asset_id,
    position: {
      x: origin.x + Number(row.position_x),
      // 高さは保存しない。カタログの halfHeight と大きさから毎回決める
      y: placement === null ? 0 : groundedY(placement.halfHeight, scale),
      z: origin.z + Number(row.position_z),
    },
    rotationY: Number(row.rotation_y),
    scale,
    type: "decoration",
  };
}

/**
 * DBの行をマップオブジェクトへ変換する。
 *
 * 壊れた行は捨て、理由を `errors` に返す。呼び出し側は `objects` をそのまま
 * マップへ足してよい。
 *
 * **家の中の行は、持ち主の部屋の中心を足してワールド座標にする。** 部屋が分からない
 * 持ち主（家族から外れた人など）の行は、置き場所が決まらないので捨てる。
 * @param rows - `placed_decorations` の行
 * @param roomCenters - 持ち主のid → 部屋の中心（`getHouseRoomCenters`）
 * @returns 変換できたオブジェクトと、捨てた行の理由
 */
export function toPlacedDecorations(
  rows: readonly PlacedDecorationRow[],
  roomCenters: Record<string, { x: number; z: number }> = {},
): {
  errors: string[];
  objects: MapObject[];
} {
  const errors: string[] = [];
  const candidates: Record<string, unknown>[] = [];

  for (const row of rows) {
    if (row.room_owner_id === null || row.room_owner_id === undefined) {
      candidates.push(toCandidate(row));
      continue;
    }
    const center = roomCenters[row.room_owner_id];
    if (!center) {
      errors.push(`${row.id}: 家の中の装飾だが、その家が見つかりません`);
      continue;
    }
    candidates.push(toCandidate(row, center));
  }

  const parsed = parseMapObjects(candidates);
  return { errors: [...errors, ...parsed.errors], objects: parsed.objects };
}
