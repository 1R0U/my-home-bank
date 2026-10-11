import { useCurrentUser, useDataAccess } from "../store";
import type { ShopCatalogItem } from "../types";
import { fetchShopCatalog, type ShopCatalog } from "./shopService";
import { useResource } from "./useResource";

/**
 * 子供用ストアの「きせかえ・かざり」の棚に並べる品書きを取得する（Issue #225）。
 *
 * 「もう持っているか」は利用者ごとに違い、物価指数は家庭ごとに違うため、
 * 利用者IDと家族IDをキーに入れる。RPCがログイン中の利用者を使うため、
 * 実際のアカウント（`canUseRealData`）のときだけ取得する。
 */
const PREVIEW_ITEMS: ShopCatalogItem[] = [
  { asset_id: "wearable-straw-hat", base_price: 200, kind: "wearable", title: "むぎわらぼうし" },
  { asset_id: "wearable-mustache", base_price: 150, kind: "wearable", title: "つけひげ" },
  { asset_id: "decoration-flowerbed", base_price: 150, kind: "decoration", title: "かだん" },
  { asset_id: "decoration-lamp", base_price: 200, kind: "decoration", title: "ランプ" },
].map((item) => ({
  ...item,
  id: `preview-${item.asset_id}`,
  kind: item.kind as ShopCatalogItem["kind"],
  owned: false,
  price_index: 100,
  sale_price: item.base_price,
}));

const EMPTY_CATALOG: ShopCatalog = { items: [], priceIndex: 100 };
const PREVIEW_CATALOG: ShopCatalog = { items: PREVIEW_ITEMS, priceIndex: 100 };

export function useShopCatalog(): {
  items: ShopCatalogItem[];
  priceIndex: ShopCatalog["priceIndex"];
  loading: boolean;
  error: string | null;
  isLive: boolean;
  reload: () => Promise<void>;
} {
  const { canUseRealData } = useDataAccess();
  const currentUser = useCurrentUser();
  const familyId = currentUser?.family_id;

  const { data, error, isLive, loading, reload } = useResource<ShopCatalog>({
    blockedReason: familyId ? null : "所属する家族が設定されていません",
    errorMessage: "きせかえ・かざりの取得に失敗しました",
    fetcher: () => fetchShopCatalog(),
    initialData: EMPTY_CATALOG,
    key: canUseRealData ? ["shopCatalog", currentUser?.id ?? null, familyId ?? null] : null,
    preview: PREVIEW_CATALOG,
  });

  return { items: data.items, priceIndex: data.priceIndex, loading, error, isLive, reload };
}
