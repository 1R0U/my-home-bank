import { MOCK_BANK_ACCOUNTS } from "../constants/mockData";
import { findBankAccount } from "./bank";
import { fetchBankAccount } from "./bankService";
import { useCurrentUser, useDataAccess } from "../store";
import type { BankAccount } from "../types";
import { useResource } from "./useResource";

/**
 * 銀行口座を取得するフック。
 * ログイン中で、かつIDがUUID形式のときだけ Supabase の実データを取得する。
 *
 * `currentUser.id` が "user-child-1" のような非UUIDのモックIDのときは
 * ライブ扱いにしない（#174）。`bank_accounts.user_id` は uuid 型なので、
 * このIDで問い合わせても実データは存在せず uuid のパースに失敗するため。
 * ここで弾いておくと、返り値の `isLive` を使っている銀行画面
 * （残高表示・預入・引き出し・借り入れ・返済）がまとめてプレビュー扱いになる。
 *
 * 開発用ロール指定（`start:parent` / `start:child`）中はAuthセッションがないため、
 * ゲストユーザーの固定UUIDがDBに存在していてもプレビュー扱いにする。
 */
export function useBankAccount() {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const userId = currentUser?.id;

  const { data, error, isLive, loading, reload } = useResource<BankAccount | null>({
    errorMessage: "銀行口座の取得に失敗しました",
    fetcher: () => fetchBankAccount(userId),
    initialData: null,
    key: canUseRealData && userId ? ["bankAccount", userId] : null,
    preview: userId ? (findBankAccount(MOCK_BANK_ACCOUNTS, userId) ?? null) : null,
  });

  return { account: data, loading, error, isLive, reload };
}
