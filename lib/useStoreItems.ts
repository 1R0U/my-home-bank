import { useCallback, useRef, useState } from "react";
import { MOCK_STORE_ITEMS } from "../constants/mockData";
import { createStaleGuard } from "./staleGuard";
import { useDataAccess } from "../store";
import type { StoreItem } from "../types";
import { fetchStoreItems } from "./storeService";
import { useRefetchOnFocus } from "./useRefetchOnFocus";

/**
 * ストアアイテム一覧を取得するフック。
 * ログインしているときだけ Supabase の実データを取得する。
 *
 * 一覧取得はユーザーのIDを使わない（fetchStoreItems はアイテム全件を取る問い合わせ）ため、
 * 他画面のような isUuid によるガード（#174）は要らない。UUIDかどうかは問わず、
 * ログインしているかどうかだけで判定する（useDataAccess の説明を参照）。
 * ユーザーのIDを使う残高取得・購入は、呼び出し側（画面）で useDataAccess の
 * canUseRealData を別途使って判定する（lib/useQuests.ts, ChildTasksScreen.tsx と同じ形）。
 */
export function useStoreItems() {
  const { isLoggedIn: isLive } = useDataAccess();

  const [items, setItems] = useState<StoreItem[]>(isLive ? [] : MOCK_STORE_ITEMS);
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
        setItems(MOCK_STORE_ITEMS);
        setLoading(false);
        setError(null);
      }
      return;
    }

    setLoading(true);
    setError(null);
    if (isFirstLiveFetch) {
      // ライブ接続に切り替わった直後は、取得完了までモック商品が表示され続けないよう即座にクリアする。
      setItems([]);
    }
    fetchStoreItems()
      .then((result) => {
        if (!guardRef.current.isCurrent(requestId)) return;
        setItems(result);
      })
      .catch((e: unknown) => {
        if (!guardRef.current.isCurrent(requestId)) return;
        setError(e instanceof Error ? e.message : "アイテムの取得に失敗しました");
      })
      .finally(() => {
        if (!guardRef.current.isCurrent(requestId)) return;
        setLoading(false);
      });
  }, [isLive]);

  // 他タブでの購入・アイテム追加等による変化を反映するため、フォーカスが戻るたびに再取得する。
  // タブを持たない画面（このアプリのストア画面）では、従来どおりマウント時の1回だけ実行される。
  useRefetchOnFocus(reload);

  return { items, loading, error, isLive, reload };
}
