// DBに保存された「置いた装飾」を、マップに出せる形へ変換する（Issue #223）。
//
// **DBは外から来るデータとして扱う。** 行が壊れていても画面全体を落とさず、
// その行だけ捨てて残りを表示する。検証は `parseMapObjects` に任せる
// （あの関数は map_objects への移行を見越して先に置かれていた。#101）。
//
// 見た目・当たり判定の大きさ・地面に接する高さは、**DBではなくカタログから引く**
// （lib/rpg-hub/catalog.ts）。形を作り直しても、置いたものが宙に浮かないようにするため。

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
  scale: number | string;
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
 * @returns 検証前の候補
 */
export function toCandidate(row: PlacedDecorationRow): Record<string, unknown> {
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
      x: Number(row.position_x),
      // 高さは保存しない。カタログの halfHeight と大きさから毎回決める
      y: placement === null ? 0 : groundedY(placement.halfHeight, scale),
      z: Number(row.position_z),
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
 * @param rows - `placed_decorations` の行
 * @returns 変換できたオブジェクトと、捨てた行の理由
 */
export function toPlacedDecorations(rows: readonly PlacedDecorationRow[]): {
  errors: string[];
  objects: MapObject[];
} {
  return parseMapObjects(rows.map(toCandidate));
}
