import { useCurrentUser, useDataAccess } from "../store";
import type { StoreItemRequest } from "../types";
import { fetchStoreItemRequests } from "./storeItemRequestService";
import { useResource } from "./useResource";

/**
 * 商品追加申請一覧を取得するフック。
 * ログインしているときだけ Supabase の実データを取得する。
 *
 * 一覧取得はログイン中ユーザーのfamily_idで絞り込む。RLSも同じ境界を強制するが、
 * 不要な行を取得しないようクライアント側でも明示する（lib/useStoreItems.ts と
 * 同じ方針、Issue #208）。
 */
export function useStoreItemRequests() {
  const { isLoggedIn } = useDataAccess();
  const currentUser = useCurrentUser();
  const familyId = currentUser?.family_id;

  const { data, error, isLive, loading, reload } = useResource<StoreItemRequest[]>({
    blockedReason: familyId ? null : "所属する家族が設定されていません",
    errorMessage: "申請の取得に失敗しました",
    fetcher: () => fetchStoreItemRequests(familyId),
    initialData: [],
    key: isLoggedIn ? ["storeItemRequests", familyId ?? null, currentUser?.id ?? null] : null,
  });

  return { requests: data, loading, error, isLive, reload };
}
