// 季節の地面の飾り（花びら・落ち葉・雪だまり）を散らす（Issue #282）。
//
// マップデータ（mapStore / DB）には入れない。**季節から毎回決まる見た目**なので、
// 保存すると季節が変わったときに消し忘れが起きる。WebView のシーンが、今のマップと
// 季節からその場で作る。

import type { AssetId, DecorationMapObject, MapObject, Season } from "../../types/map";
import { RPG_HUB_ASSETS } from "./assets.ts";
import { getDecorationPlacement, groundedY } from "./catalog.ts";
import { createRandom } from "./random.ts";

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
 * 間隔を調べるための升目の一辺。
 * いちばん大きい建物の半分（約1.9）＋ いちばん大きい飾りの半分（約1.2）より大きくとる。
 * そうしておけば、隣接9マスを見るだけで重なりを見落とさない（mapObjects.ts と同じ考え方）。
 */
const CELL = 4;

/** 置いてある物のまわりに空ける間隔。 */
const GAP = 0.15;

/**
 * 避ける相手の、XZ平面上の半分の大きさを返す。
 *
 * **当たり判定を持つ物と道のタイルだけを避ける。** 建物や木の根元に雪だまりが
 * めり込むと不自然で、道の上に落ち葉が積もると道が見えなくなるため。
 * 草むらやNPC（歩き回る）は避けない。薄い飾りなので重なっても困らない。
 * @param object - マップオブジェクト
 * @returns 半分の大きさ。避けなくてよい物は null
 */
function obstacleHalf(object: MapObject): { x: number; z: number } | null {
  if (object.type === "npc") return null;
  const scale = object.scale ?? 1;
  if (object.collisionSize) {
    return {
      x: (object.collisionSize.width * scale) / 2,
      z: (object.collisionSize.depth * scale) / 2,
    };
  }
  if (object.model === RPG_HUB_ASSETS.path) {
    const size = getDecorationPlacement(RPG_HUB_ASSETS.path)?.size ?? 0;
    return { x: (size * scale) / 2, z: (size * scale) / 2 };
  }
  return null;
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

  /** 升目 → そこに中心がある、避ける相手（中心と半分の大きさ）。 */
  const grid = new Map<string, { half: { x: number; z: number }; x: number; z: number }[]>();
  const cellOf = (x: number, z: number) => `${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`;
  const remember = (x: number, z: number, half: { x: number; z: number }) => {
    const key = cellOf(x, z);
    const cell = grid.get(key);
    const entry = { half, x, z };
    if (cell) cell.push(entry);
    else grid.set(key, [entry]);
  };
  const overlaps = (x: number, z: number, half: number): boolean => {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const cell = grid.get(cellOf(x + dx * CELL, z + dz * CELL));
        if (!cell) continue;
        for (const other of cell) {
          if (
            Math.abs(x - other.x) < other.half.x + half + GAP &&
            Math.abs(z - other.z) < other.half.z + half + GAP
          ) {
            return true;
          }
        }
      }
    }
    return false;
  };

  objects.forEach((object) => {
    const half = obstacleHalf(object);
    if (half) remember(object.position.x, object.position.z, half);
  });

  let remaining = scatter.count;
  // 置ける場所が見つからないまま回り続けないよう、試行回数に上限を置く
  let attempts = scatter.count * 40;
  while (remaining > 0 && attempts > 0) {
    attempts -= 1;
    const x = (random() * 2 - 1) * SEASONAL_SCATTER_HALF;
    const z = (random() * 2 - 1) * SEASONAL_SCATTER_HALF;
    const scale = 0.8 + random() * 0.5;
    const rotationY = random() * Math.PI * 2;
    const half = (placement.size * scale) / 2;
    if (overlaps(x, z, half)) continue;

    placed.push({
      collidable: false,
      id: `season-${season}-${remaining}`,
      interactive: false,
      model: scatter.model,
      position: { x, y: groundedY(placement.halfHeight, scale), z },
      rotationY,
      scale,
      type: "decoration",
    });
    remember(x, z, { x: half, z: half });
    remaining -= 1;
  }

  return placed;
}
