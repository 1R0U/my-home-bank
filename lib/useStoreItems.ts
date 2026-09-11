import { useCallback, useEffect, useRef, useState } from "react";
import { MOCK_STORE_ITEMS } from "../constants/mockData";
import { createStaleGuard } from "./staleGuard";
import { useCurrentUser } from "../store";
import type { StoreItem } from "../types";
import { DEV_ROLE_OVERRIDE } from "./devRole";
import { fetchStoreItems } from "./storeService";

/**
 * ストアアイテム一覧を取得するフック。
 * 開発用ロールプレビュー中（DEV_ROLE_OVERRIDE）はモックデータのまま、
 * 実際にログインしているときだけ Supabase の実データを取得する
 * （Issue #60/#63 と同じ方針）。
 */
export function useStoreItems() {
  const currentUser = useCurrentUser();
  const isLive = !DEV_ROLE_OVERRIDE && currentUser !== null;

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
    // currentUser?.id の変化でも再取得する（ログアウトを挟まないユーザー切替に対応するため）。
  }, [isLive, currentUser?.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { items, loading, error, isLive, reload };
}
