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

  const reload = useCallback(() => {
    const requestId = guardRef.current.start();

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

  useEffect(() => {
    reload();
  }, [reload]);

  return { items, loading, error, isLive, reload };
}
