// 季節の地面の飾り（花びら・落ち葉・雪だまり）を散らす（Issue #282）。
//
// マップデータ（mapStore / DB）には入れない。**季節から毎回決まる見た目**なので、
// 保存すると季節が変わったときに消し忘れが起きる。WebView のシーンが、今のマップと
// 季節からその場で作る。

import type { AssetId, DecorationMapObject, MapObject, Season } from "../../types/map";
import { RPG_HUB_ASSETS } from "./assets.ts";
import { getDecorationPlacement, groundedY } from "./catalog.ts";
import { createRandom } from "./random.ts";
import {
  cellKeys,
  collectBlockedCells,
  getDecorationCellRange,
  getDecorationMaxScale,
  isCellRangeFree,
  snapDecorationToCells,
} from "./townGrid.ts";

/** 季節ごとに散らす飾りと数。夏は何も散らさない。 */
const SEASONAL_SCATTER: Record<Season, { count: number; model: AssetId; seed: number } | null> = {
  autumn: { count: 110, model: RPG_HUB_ASSETS.seasonLeaves, seed: 20260901 },
  spring: { count: 90, model: RPG_HUB_ASSETS.seasonPetals, seed: 20260301 },
  summer: null,
  winter: { count: 70, model: RPG_HUB_ASSETS.seasonSnow, seed: 20261201 },
};

/**
 * 散らす範囲（中心からの距離）。町の中も含める。
 * 町の外の自然物（mapObjects.ts の SCATTER_HALF = 34）より少し内側にとどめる。
 * 地面のメッシュ（100角）はプレイヤーに付いて動くので、範囲の外でも地面は途切れない。
 */
const SEASONAL_SCATTER_HALF = 30;

/**
 * 飾りが避ける相手か。
 *
 * **マスを占める物（townGrid.ts の決まり）はすべて避ける。** 建物や木の根元に雪だまりがめり込むと
 * 不自然で、道の上に落ち葉が積もると道が見えなくなるため。
 * NPC（歩き回る）だけは避けない。薄い飾りなので重なっても困らない。
 * @param object - マップオブジェクト
 * @returns 避けるなら true
 */
function isObstacle(object: MapObject): boolean {
  return object.type !== "npc";
}

/**
 * 季節の地面の飾りを散らす。
 *
 * 決まった種の擬似乱数を使うので、同じマップと季節からは毎回同じ並びになる
 * （画面を開き直すたびに落ち葉の位置が変わると落ち着かないため）。
 * @param season - 季節
 * @param objects - 今のマップ（建物・道・置いた装飾など）。これらとは重ねない
 * @returns 散らした飾り。夏は空
 */
export function scatterSeasonalDecorations(
  season: Season,
  objects: readonly MapObject[],
): DecorationMapObject[] {
  const scatter = SEASONAL_SCATTER[season];
  if (!scatter) return [];
  const placement = getDecorationPlacement(scatter.model);
  if (!placement) return [];

  const random = createRandom(scatter.seed);
  const placed: DecorationMapObject[] = [];
  // 置けないマス。置いた飾りのマスも足していき、飾りどうしも重ねない
  const blocked = collectBlockedCells(objects.filter(isObstacle));

  let remaining = scatter.count;
  // 置ける場所が見つからないまま回り続けないよう、試行回数に上限を置く
  let attempts = scatter.count * 40;
  while (remaining > 0 && attempts > 0) {
    attempts -= 1;
    // 町のマスにそろえて置く（Issue #445）。乱数の引き方は変えず、引いた値をマスへ寄せる。
    // 大きさも、占めるマス（雪だまりは 2×2）からはみ出さない範囲に抑える
    // 分割代入にしない（esbuild が ios13 ターゲットへ変換できない）
    const point = snapDecorationToCells(
      scatter.model,
      (random() * 2 - 1) * SEASONAL_SCATTER_HALF,
      (random() * 2 - 1) * SEASONAL_SCATTER_HALF,
    ) as { x: number; z: number };
    const x = point.x;
    const z = point.z;
    const scale = Math.min(0.8 + random() * 0.5, getDecorationMaxScale(scatter.model) ?? Infinity);
    // 地面に貼りつく薄い飾りなので、向きは自由のまま（当たり判定を持たない）
    const rotationY = random() * Math.PI * 2;
    // 寄せた先が散らす範囲の外へ出ることがある（±30 に近い値を 2×2 で寄せると ±30.6）。もう一度見る
    if (Math.abs(x) > SEASONAL_SCATTER_HALF || Math.abs(z) > SEASONAL_SCATTER_HALF) continue;

    const object: DecorationMapObject = {
      collidable: false,
      id: `season-${season}-${remaining}`,
      interactive: false,
      model: scatter.model,
      position: { x, y: groundedY(placement.halfHeight, scale), z },
      rotationY,
      scale,
      type: "decoration",
    };
    const range = getDecorationCellRange(scatter.model, x, z);
    if (!range || !isCellRangeFree(range, blocked)) continue;

    placed.push(object);
    for (const key of cellKeys(range)) blocked.add(key);
    remaining -= 1;
  }

  return placed;
}
