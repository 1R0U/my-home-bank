import { useCallback, useRef, useState } from "react";
import { MOCK_STORE_ITEMS } from "../constants/mockData";
import { createStaleGuard } from "./staleGuard";
import { useCurrentUser, useDataAccess } from "../store";
import type { PricedStoreItem, StoreItem } from "../types";
import { fetchStoreCatalog, fetchStoreItems } from "./storeService";
import { useRefetchOnFocus } from "./useRefetchOnFocus";

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
  reload: () => void;
};

export function useStoreItems(options: { indexed: true }): StoreItemsResult<PricedStoreItem>;
export function useStoreItems(options?: { indexed?: false }): StoreItemsResult<StoreItem>;
export function useStoreItems(options: { indexed?: boolean } = {}) {
  const indexed = options.indexed === true;
  const { isLoggedIn: isLive } = useDataAccess();
  const currentUser = useCurrentUser();
  const currentUserId = currentUser?.id;
  const familyId = currentUser?.family_id;

  const [items, setItems] = useState<StoreItem[]>(
    isLive ? [] : indexed ? PREVIEW_STORE_ITEMS : MOCK_STORE_ITEMS,
  );
  const [priceIndex, setPriceIndex] = useState<PricedStoreItem["price_index"]>(100);
  const [loading, setLoading] = useState(isLive);
  const [error, setError] = useState<string | null>(null);
  // 連続して再取得した場合に、先に開始したリクエストが後から完了して新しい
  // 状態を古い値で上書きしないよう、staleGuard で最新のリクエストのみ反映する。
  const guardRef = useRef(createStaleGuard());
  // 直前の reload 呼び出し時点の isLive。ライブ接続に切り替わった直後（false→true）
  // だけ items をクリアし、購入後・アイテム追加後・再試行などライブ接続中の
  // 通常の再取得では前回の一覧を表示し続けたまま裏で更新できるようにする。
  const wasLiveRef = useRef(false);

  const reload = useCallback(() => {
    const requestId = guardRef.current.start();
    const isFirstLiveFetch = isLive && !wasLiveRef.current;
    wasLiveRef.current = isLive;

    if (!isLive) {
      if (guardRef.current.isCurrent(requestId)) {
        setItems(indexed ? PREVIEW_STORE_ITEMS : MOCK_STORE_ITEMS);
        setPriceIndex(100);
        setLoading(false);
        setError(null);
      }
      return;
    }

    if (!familyId) {
      setItems([]);
      setLoading(false);
      setError("所属する家族が設定されていません");
      return;
    }

    setLoading(true);
    setError(null);
    if (isFirstLiveFetch) {
      // ライブ接続に切り替わった直後は、取得完了までモック商品が表示され続けないよう即座にクリアする。
      setItems([]);
    }
    const request = indexed
      ? fetchStoreCatalog()
      : fetchStoreItems(familyId).then((baseItems) => ({ items: baseItems, priceIndex: 100 as const }));

    request
      .then((result) => {
        if (!guardRef.current.isCurrent(requestId)) return;
        setItems(result.items);
        setPriceIndex(result.priceIndex);
      })
      .catch((e: unknown) => {
        if (!guardRef.current.isCurrent(requestId)) return;
        setError(e instanceof Error ? e.message : "アイテムの取得に失敗しました");
      })
      .finally(() => {
        if (!guardRef.current.isCurrent(requestId)) return;
        setLoading(false);
      });
  }, [familyId, indexed, isLive, currentUserId]);

  // 他タブでの購入・アイテム追加等による変化を反映するため、フォーカスが戻るたびに再取得する。
  // タブを持たない画面（このアプリのストア画面）では、従来どおりマウント時の1回だけ実行される。
  useRefetchOnFocus(reload);

  return { items, priceIndex, loading, error, isLive, reload } as StoreItemsResult<StoreItem>;
}
