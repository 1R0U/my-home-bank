import { MOCK_TRANSACTIONS } from "../constants/mockData";
import { useCurrentUser, useDataAccess } from "../store";
import type { Transaction } from "../types";
import { fetchTransactions } from "./transactions";
import { useResource } from "./useResource";

/**
 * ログイン中の利用者の取引履歴を取得するフック。
 *
 * 利用者のIDで引く取得なので、IDがUUIDでないときは呼びに行かず
 * モックデータを返す（#174。判定の理由は useDataAccess の説明を参照）。
 */
export function useTransactions() {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const userId = currentUser?.id;

  const { data, error, loading, reload } = useResource<Transaction[]>({
    errorMessage: "取引履歴の取得に失敗しました。時間をおいて再度お試しください。",
    fetcher: () => fetchTransactions(userId),
    initialData: [],
    key: canUseRealData && userId ? ["transactions", userId] : null,
    preview: MOCK_TRANSACTIONS.filter((transaction) => transaction.user_id === userId),
  });

  return { error, loading, reload, transactions: data };
}
