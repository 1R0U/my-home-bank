import { MOCK_STORE_ITEMS } from "../constants/mockData";
import { useCurrentUser, useDataAccess } from "../store";
import type { PricedStoreItem, StoreItem } from "../types";
import { fetchStoreCatalog, fetchStoreItems } from "./storeService";
import { useResource } from "./useResource";

/**
 * ストアアイテム一覧を取得するフック。
 * ログインしているときだけ Supabase の実データを取得する。
 *
 * 子ども画面は indexed オプションで物価反映済みRPCを使う。親画面は物価指数に
 * 左右されず非公開商品も管理できるよう、従来どおりfamily_id指定で直接取得する。
 * ユーザーのIDを使う残高取得・購入は、呼び出し側（画面）で useDataAccess の
 * canUseRealData を別途使って判定する（lib/useQuests.ts, ChildTasksScreen.tsx と同じ形）。
 */
const PREVIEW_STORE_ITEMS: PricedStoreItem[] = MOCK_STORE_ITEMS.map((item) => ({
  ...item,
  base_price: item.price,
  price_index: 100,
  sale_price: item.price,
}));

type StoreItemsResult<T extends StoreItem> = {
  items: T[];
  priceIndex: PricedStoreItem["price_index"];
  loading: boolean;
  error: string | null;
  isLive: boolean;
  reload: () => Promise<void>;
};

type Catalog = { items: StoreItem[]; priceIndex: PricedStoreItem["price_index"] };

const EMPTY_CATALOG: Catalog = { items: [], priceIndex: 100 };
const PREVIEW_CATALOG: Catalog = { items: MOCK_STORE_ITEMS, priceIndex: 100 };
const PREVIEW_INDEXED_CATALOG: Catalog = { items: PREVIEW_STORE_ITEMS, priceIndex: 100 };

export function useStoreItems(options: { indexed: true }): StoreItemsResult<PricedStoreItem>;
export function useStoreItems(options?: { indexed?: false }): StoreItemsResult<StoreItem>;
export function useStoreItems(options: { indexed?: boolean } = {}) {
  const indexed = options.indexed === true;
  const { isLoggedIn } = useDataAccess();
  const currentUser = useCurrentUser();
  const familyId = currentUser?.family_id;

  const { data, error, isLive, loading, reload } = useResource<Catalog>({
    blockedReason: familyId ? null : "所属する家族が設定されていません",
    errorMessage: "アイテムの取得に失敗しました",
    fetcher: () =>
      indexed
        ? fetchStoreCatalog()
        : fetchStoreItems(familyId).then((items) => ({ items, priceIndex: 100 as const })),
    initialData: EMPTY_CATALOG,
    // 物価反映済みの一覧はRPCがログイン中の利用者から家族を決めるため、利用者IDもキーに入れる
    key: isLoggedIn ? ["storeItems", indexed ? "indexed" : "base", familyId ?? null, currentUser?.id ?? null] : null,
    preview: indexed ? PREVIEW_INDEXED_CATALOG : PREVIEW_CATALOG,
  });

  return { items: data.items, priceIndex: data.priceIndex, loading, error, isLive, reload } as StoreItemsResult<StoreItem>;
}
