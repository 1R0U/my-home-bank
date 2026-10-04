import { useCallback, useRef, useState } from "react";
import { useCurrentUser, useDataAccess } from "../store";
import type { StoreItemRequest } from "../types";
import { createStaleGuard } from "./staleGuard";
import { fetchStoreItemRequests } from "./storeItemRequestService";
import { useRefetchOnFocus } from "./useRefetchOnFocus";

/**
 * 商品追加申請一覧を取得するフック。
 * ログインしているときだけ Supabase の実データを取得する。
 *
 * 一覧取得はログイン中ユーザーのfamily_idで絞り込む。RLSも同じ境界を強制するが、
 * 不要な行を取得しないようクライアント側でも明示する（lib/useStoreItems.ts と
 * 同じ方針、Issue #208）。
 */
export function useStoreItemRequests() {
  const { isLoggedIn: isLive } = useDataAccess();
  const currentUser = useCurrentUser();
  const currentUserId = currentUser?.id;
  const familyId = currentUser?.family_id;

  const [requests, setRequests] = useState<StoreItemRequest[]>([]);
  const [loading, setLoading] = useState(isLive);
  const [error, setError] = useState<string | null>(null);
  // 連続して再取得した場合に、先に開始したリクエストが後から完了して新しい
  // 状態を古い値で上書きしないよう、staleGuard で最新のリクエストのみ反映する。
  const guardRef = useRef(createStaleGuard());
  // 一覧を最後に取得した利用者と家族。これが変わったときだけ、取得前に一覧を空にする。
  // フォーカス復帰などの通常の再取得では、前回の一覧を表示し続けたまま裏で更新する
  // （lib/useStoreItems.ts と同じ方針、Issue #308）。
  const loadedForRef = useRef<string | null>(null);

  const reload = useCallback(() => {
    const requestId = guardRef.current.start();
    const owner = `${currentUserId ?? ""}:${familyId ?? ""}`;
    const isOwnerChanged = loadedForRef.current !== owner;
    loadedForRef.current = owner;

    if (!isLive) {
      if (guardRef.current.isCurrent(requestId)) {
        setRequests([]);
        setLoading(false);
        setError(null);
      }
      return;
    }

    if (!familyId) {
      setRequests([]);
      setLoading(false);
      setError("所属する家族が設定されていません");
      return;
    }

    setLoading(true);
    setError(null);
    if (isOwnerChanged) {
      // ユーザー切り替え直後は、取得完了まで前のユーザーの申請が表示され続けないよう即座にクリアする。
      setRequests([]);
    }
    fetchStoreItemRequests(familyId)
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
  }, [familyId, isLive, currentUserId]);

  // 大人用画面はタブの裏で生存し続けるため、マウント時の1回だけでは、
  // 申請タブを開いたままの間に子が出した新しい申請が反映されない。
  // フォーカスが戻るたびに再取得する（Issue #308）。
  useRefetchOnFocus(reload);

  return { requests, loading, error, isLive, reload };
}
