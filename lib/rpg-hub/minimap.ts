import type { MapObject, MapRouteId } from "../../types/map.ts";
import { RPG_HUB_ASSETS } from "./assets.ts";
import { ASSET_CATALOG } from "./catalog.ts";
import { HOUSE_ZONE_BOUNDS } from "./mapObjects.ts";

export type MinimapLocation = "ground" | "town" | "upstairs";

export type MinimapBounds = { maxX: number; maxZ: number; minX: number; minZ: number };

/**
 * 町の表示範囲。`mapObjects.ts` の `SCATTER_HALF`（自然物を散らす範囲の半分、34）に
 * 少し余白を足した正方形。建物・NPC・置いた装飾はこの内側に収まる。
 */
const TOWN_BOUNDS: MinimapBounds = { maxX: 36, maxZ: 36, minX: -36, minZ: -36 };

/** 家の中（1階・2階）は壁の外周（`HOUSE_ZONE_BOUNDS`）そのままだと壁際が見切れるため、少し広げる。 */
const HOUSE_PADDING = 2;

function withPadding(bounds: MinimapBounds, padding: number): MinimapBounds {
  return {
    maxX: bounds.maxX + padding,
    maxZ: bounds.maxZ + padding,
    minX: bounds.minX - padding,
    minZ: bounds.minZ - padding,
  };
}

/**
 * 今いる区画（`getHouseLocation` の戻り値）から、マップに映す範囲を決める。
 *
 * `TOWN_BOUNDS`（±36）は自然物を散らす範囲に余白を足した「町の基準範囲」で、
 * 移動できる範囲そのものではない。プレイヤーや置いた装飾がこれより外に出ると、
 * `projectToMinimap` が位置をマップの端に固定してしまい、実際の位置が分からなくなる
 * （CodeRabbitレビュー指摘）。町では、表示したい座標（プレイヤー・置いた装飾など）を
 * 渡すと、それを含むように範囲を広げる。
 * @param location - 今いる区画
 * @param points - 町のときに表示範囲へ必ず収める座標（省略時は基準範囲のまま）
 * @returns ワールド座標の表示範囲
 */
export function getMinimapBounds(
  location: MinimapLocation,
  points: readonly { x: number; z: number }[] = [],
): MinimapBounds {
  if (location === "ground") return withPadding(HOUSE_ZONE_BOUNDS.ground, HOUSE_PADDING);
  if (location === "upstairs") return withPadding(HOUSE_ZONE_BOUNDS.upstairs, HOUSE_PADDING);

  return points.reduce(
    (bounds, point) => ({
      maxX: Math.max(bounds.maxX, point.x),
      maxZ: Math.max(bounds.maxZ, point.z),
      minX: Math.min(bounds.minX, point.x),
      minZ: Math.min(bounds.minZ, point.z),
    }),
    TOWN_BOUNDS,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * ワールド座標（x, z）を、正方形マップ（`size` ピクセル四方）上の位置へ変換する。
 * 範囲の外に出ていても、縁にはみ出さずマップの端に留める。
 * @param x - ワールドX座標
 * @param z - ワールドZ座標
 * @param bounds - 表示範囲
 * @param size - マップの一辺（ピクセル）
 * @returns マップ上の位置（左上原点、ピクセル）
 */
export function projectToMinimap(
  x: number,
  z: number,
  bounds: MinimapBounds,
  size: number,
): { left: number; top: number } {
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const left = clamp(((x - bounds.minX) / spanX) * size, 0, size);
  const top = clamp(((z - bounds.minZ) / spanZ) * size, 0, size);
  return { left, top };
}

/**
 * プレイヤーの向き（`facingY`、ラジアン）を、矢印アイコン（デフォルトで上向き）を
 * 回すための角度（度、CSSの `rotate` にそのまま渡す）に直す。
 *
 * `facingY` は `movement.ts` の `atan2(dirX, dirZ)` という決め方（0が+Z）。
 * マップ上は x→右、z→下にそのまま対応させているため、+Z は画面の下向きになる。
 * 上向きの矢印を180°回すと下を向くので、`facingY = 0` のとき180°、
 * そこから `facingY` が増えるぶん戻す式になる（`180 - facingY度`）。
 * @param facingY - 向き（ラジアン）
 * @returns 矢印の回転角（度）
 */
export function facingYToRotationDeg(facingY: number): number {
  return 180 - (facingY * 180) / Math.PI;
}

/** 建物（route）ごとのマップアイコン。新しいルートを増やすと型エラーで気づける。 */
export const BUILDING_MAP_ICONS: Record<MapRouteId, string> = {
  bank: "🏦",
  downstairs: "🪜",
  history: "📜",
  house: "🏠",
  store: "🏪",
  tasks: "📋",
  upstairs: "🪜",
  wardrobe: "🪞",
};

export const NPC_MAP_ICON = "🙂";
export const DECORATION_MAP_ICON = "✨";

/** 道タイル1枚のワールド座標上の一辺（`catalog.ts` の道の `placement.size` と同じ）。 */
export const PATH_TILE_WORLD_SIZE = ASSET_CATALOG.path.placement.size;

/**
 * 道のタイルかどうかを判定する（マップに地面の目印として描くため）。
 * @param object - マップオブジェクト
 * @returns 道のタイルなら true
 */
export function isPathTile(object: MapObject): boolean {
  return object.type === "decoration" && object.model === RPG_HUB_ASSETS.path;
}

/**
 * ワールド座標上の長さ（例: 道タイルの一辺）を、マップ（`size` ピクセル四方）上の
 * ピクセル幅・高さに直す。表示範囲がX/Zで同じ比率でない場合に備え、軸ごとに計算する。
 * @param worldSize - ワールド座標上の長さ
 * @param bounds - 表示範囲
 * @param size - マップの一辺（ピクセル）
 * @returns マップ上の幅・高さ（ピクセル）
 */
export function worldSizeToMinimapPixels(
  worldSize: number,
  bounds: MinimapBounds,
  size: number,
): { height: number; width: number } {
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  return { height: (worldSize / spanZ) * size, width: (worldSize / spanX) * size };
}
