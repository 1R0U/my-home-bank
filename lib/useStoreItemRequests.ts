import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentUser } from "../store";
import type { StoreItemRequest } from "../types";
import { DEV_ROLE_OVERRIDE } from "./devRole";
import { createStaleGuard } from "./staleGuard";
import { fetchStoreItemRequests } from "./storeItemRequestService";

/**
 * 商品追加申請一覧を取得するフック。
 * 開発用ロールプレビュー中（DEV_ROLE_OVERRIDE）は空のまま、
 * 実際にログインしているときだけ Supabase の実データを取得する
 * （Issue #64/#130 と同じ方針）。
 */
export function useStoreItemRequests() {
  const currentUser = useCurrentUser();
  const isLive = !DEV_ROLE_OVERRIDE && currentUser !== null;

  const [requests, setRequests] = useState<StoreItemRequest[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [error, setError] = useState<string | null>(null);
  // 連続して再取得した場合に、先に開始したリクエストが後から完了して新しい
  // 状態を古い値で上書きしないよう、staleGuard で最新のリクエストのみ反映する。
  const guardRef = useRef(createStaleGuard());

  const reload = useCallback(() => {
    const requestId = guardRef.current.start();

    if (!isLive) {
      if (guardRef.current.isCurrent(requestId)) {
        setRequests([]);
        setLoading(false);
        setError(null);
      }
      return;
    }

    setLoading(true);
    setError(null);
    fetchStoreItemRequests()
      .then((result) => {
        if (!guardRef.current.isCurrent(requestId)) return;
        setRequests(result);
      })
      .catch((e: unknown) => {
        if (!guardRef.current.isCurrent(requestId)) return;
        setError(e instanceof Error ? e.message : "申請の取得に失敗しました");
      })
      .finally(() => {
        if (!guardRef.current.isCurrent(requestId)) return;
        setLoading(false);
      });
  }, [isLive]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { requests, loading, error, isLive, reload };
}
