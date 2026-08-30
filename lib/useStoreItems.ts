import { useCallback, useEffect, useRef, useState } from "react";
import { MOCK_STORE_ITEMS } from "../constants/mockData";
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
  const requestIdRef = useRef(0);

  const reload = useCallback(() => {
    const requestId = ++requestIdRef.current;

    if (!isLive) {
      setItems(MOCK_STORE_ITEMS);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    fetchStoreItems()
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        setItems(result);
      })
      .catch((e: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setError(e instanceof Error ? e.message : "アイテムの取得に失敗しました");
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setLoading(false);
      });
  }, [isLive]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { items, loading, error, isLive, reload };
}
