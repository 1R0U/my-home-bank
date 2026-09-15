import { useCallback, useEffect, useRef, useState } from "react";
import { MOCK_BANK_ACCOUNTS } from "../constants/mockData";
import { findBankAccount } from "./bank";
import { fetchBankAccount } from "./bankService";
import { createStaleGuard } from "./staleGuard";
import { useCurrentUser } from "../store";
import type { BankAccount } from "../types";
import { DEV_ROLE_OVERRIDE } from "./devRole";
import { isUuid } from "./uuid";

/**
 * 銀行口座を取得するフック。
 * 開発用ロールプレビュー中（DEV_ROLE_OVERRIDE）はモックデータのまま、
 * 実際にログインしているときだけ Supabase の実データを取得する
 * （Issue #60/#63/#64 と同じ方針）。
 *
 * 開発用クイックログインで入った場合、`currentUser.id` は "user-child-1" のような
 * 非UUIDのモックIDになる。`bank_accounts.user_id` は uuid 型なので、このIDで問い合わせても
 * 実データは存在せず uuid のパースに失敗する。**この場合もライブ扱いにしない**（#174）。
 *
 * ここで弾いておくと、返り値の `isLive` を使っている銀行画面
 * （残高表示・預入・引き出し・借り入れ・返済）がまとめてプレビュー扱いになる。
 */
export function useBankAccount() {
  const currentUser = useCurrentUser();
  const isLive = !DEV_ROLE_OVERRIDE && currentUser !== null && isUuid(currentUser.id);

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
