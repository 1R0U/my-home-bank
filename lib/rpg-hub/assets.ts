import { ASSET_CATALOG, ASSET_DEFINITIONS } from "./catalog.ts";
import type { AssetId } from "../../types/map";

/**
 * RPGハブで使うアセットID。
 *
 * **ここに直接足さない。** 中身は `lib/rpg-hub/catalog.ts` から導出している。
 * アセットを増やすときはカタログへ1エントリ足せば、この表にも自動で載る（Issue #220）。
 */
export const RPG_HUB_ASSETS = Object.fromEntries(
  Object.entries(ASSET_CATALOG).map(([key, definition]) => [key, definition.id as AssetId]),
) as { [K in keyof typeof ASSET_CATALOG]: AssetId };

/**
 * 影を落とさないアセット。
 *
 * **ここに直接足さない。** カタログで `castsShadow: false` を指定したものが自動で入る。
 * 以前は別の集合として手で管理しており、足し忘れると静かに影だけが重くなるため
 * 「草むらのパターンを増やしたらここにも足すこと」という注意書きとテストが必要だった。
 * カタログ化したことで書き忘れようがなくなったが、テストはそのまま残してある。
 */
export const NO_SHADOW_ASSETS: ReadonlySet<AssetId> = new Set<AssetId>(
  ASSET_DEFINITIONS.filter((definition) => definition.castsShadow === false).map(
    (definition) => definition.id as AssetId,
  ),
);

/** 許可されたアセットIDの検証用 Map */
const assetIds = new Map<string, AssetId>(
  ASSET_DEFINITIONS.map((definition) => [definition.id, definition.id as AssetId]),
);

/**
 * 外部入力を検証し、許可されたアセットIDに変換する。
 * @param value - 検証する値
 * @returns 許可されたアセットID。不正な場合は null
 */
export function resolveAssetId(value: unknown): AssetId | null {
  return typeof value === "string" ? (assetIds.get(value) ?? null) : null;
}
