import { ASSET_DEFINITIONS, getPlaceableDecorations } from "./rpg-hub/catalog.ts";

export type StoreAssetKind = "wearable" | "decoration";

/** 見た目・表示名は既存のカタログ、販売価格は家庭ごとの商品行が持つ。 */
const PLACEABLE_IDS = new Set<string>(getPlaceableDecorations());
export const STORE_ASSETS = ASSET_DEFINITIONS.filter(
  (asset) => asset.category === "wearable" || PLACEABLE_IDS.has(asset.id),
).map((asset) => ({ id: asset.id, kind: asset.category as StoreAssetKind, label: asset.label ?? asset.id }));

export function getStoreAssetKind(assetId?: string | null): StoreAssetKind | null {
  return STORE_ASSETS.find((asset) => asset.id === assetId)?.kind ?? null;
}

export type OwnedStoreAsset = { asset_id: string; quantity: number };

/** 配置済みの分も所有数に含め、しまうと未配置数が戻る。 */
export function availableDecorationCount(
  assetId: string,
  owned: readonly OwnedStoreAsset[],
  placed: readonly { model: string }[],
): number {
  const quantity = owned.find((item) => item.asset_id === assetId)?.quantity ?? 0;
  return Math.max(0, quantity - placed.filter((item) => item.model === assetId).length);
}
