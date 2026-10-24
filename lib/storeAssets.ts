import { ASSET_DEFINITIONS, getPlaceableDecorations } from "./rpg-hub/catalog.ts";

/** 販売するアセットの種類。DBの `store_assets.kind` と同じ値。壁紙・床板は Issue #480 */
export type StoreAssetKind = "wearable" | "decoration" | "wallpaper" | "flooring";

/**
 * 見た目・表示名は既存のカタログ、販売価格は家庭ごとの商品行が持つ。
 * 家に付いている最初の壁紙・床板（`starter`）は、はじめから持っている扱いなので売らない。
 */
const PLACEABLE_IDS = new Set<string>(getPlaceableDecorations());
export const STORE_ASSETS = ASSET_DEFINITIONS.filter(
  (asset) =>
    asset.category === "wearable" ||
    PLACEABLE_IDS.has(asset.id) ||
    ((asset.category === "wallpaper" || asset.category === "flooring") && !asset.starter),
).map((asset) => ({ id: asset.id, kind: asset.category as StoreAssetKind, label: asset.label ?? asset.id }));

/**
 * 1人1つまでしか持てない種類か。着せ替え品・壁紙・床板は一度買えば足りる（装飾は置く数だけ買える）。
 * @param kind - 販売するアセットの種類
 * @returns 1つまでなら true
 */
export function isSingleOwnershipKind(kind: StoreAssetKind | null): boolean {
  return kind === "wearable" || kind === "wallpaper" || kind === "flooring";
}

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
