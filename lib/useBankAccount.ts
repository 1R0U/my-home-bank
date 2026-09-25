import { useCallback, useEffect, useRef, useState } from "react";
import { MOCK_BANK_ACCOUNTS } from "../constants/mockData";
import { findBankAccount } from "./bank";
import { fetchBankAccount } from "./bankService";
import { createStaleGuard } from "./staleGuard";
import { useCurrentUser, useDataAccess } from "../store";
import type { BankAccount } from "../types";

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
  const { canUseRealData: isLive } = useDataAccess();

  const [account, setAccount] = useState<BankAccount | null>(
    isLive || !currentUser ? null : (findBankAccount(MOCK_BANK_ACCOUNTS, currentUser.id) ?? null),
  );
  const [loading, setLoading] = useState(isLive);
  const [error, setError] = useState<string | null>(null);
  const guardRef = useRef(createStaleGuard());

  const reload = useCallback((): Promise<void> => {
    const requestId = guardRef.current.start();

    if (!isLive || !currentUser) {
      if (guardRef.current.isCurrent(requestId)) {
        setAccount(currentUser ? (findBankAccount(MOCK_BANK_ACCOUNTS, currentUser.id) ?? null) : null);
        setLoading(false);
        setError(null);
      }
      return Promise.resolve();
    }

    setLoading(true);
    setError(null);
    return fetchBankAccount(currentUser.id)
      .then((result) => {
        if (!guardRef.current.isCurrent(requestId)) return;
        setAccount(result);
      })
      .catch((e: unknown) => {
        // 画面には固定の文言しか出さないため、原因はここに残す。
        console.warn("銀行口座の取得に失敗しました", e);
        if (!guardRef.current.isCurrent(requestId)) return;
        setError(e instanceof Error ? e.message : "銀行口座の取得に失敗しました");
      })
      .finally(() => {
        if (!guardRef.current.isCurrent(requestId)) return;
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, currentUser?.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { account, loading, error, isLive, reload };
}
