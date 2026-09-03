import { useCallback, useEffect, useRef, useState } from "react";
import { MOCK_BANK_ACCOUNTS } from "../constants/mockData";
import { findBankAccount } from "./bank";
import { fetchBankAccount } from "./bankService";
import { createStaleGuard } from "./staleGuard";
import { useCurrentUser } from "../store";
import type { BankAccount } from "../types";
import { DEV_ROLE_OVERRIDE } from "./devRole";

/**
 * 銀行口座を取得するフック。
 * 開発用ロールプレビュー中（DEV_ROLE_OVERRIDE）はモックデータのまま、
 * 実際にログインしているときだけ Supabase の実データを取得する
 * （Issue #60/#63/#64 と同じ方針）。
 */
export function useBankAccount() {
  const currentUser = useCurrentUser();
  const isLive = !DEV_ROLE_OVERRIDE && currentUser !== null;

  const [account, setAccount] = useState<BankAccount | null>(
    isLive || !currentUser ? null : (findBankAccount(MOCK_BANK_ACCOUNTS, currentUser.id) ?? null),
  );
  const [loading, setLoading] = useState(isLive);
  const [error, setError] = useState<string | null>(null);
  const guardRef = useRef(createStaleGuard());

  const reload = useCallback(() => {
    const requestId = guardRef.current.start();

    if (!isLive || !currentUser) {
      if (guardRef.current.isCurrent(requestId)) {
        setAccount(currentUser ? (findBankAccount(MOCK_BANK_ACCOUNTS, currentUser.id) ?? null) : null);
        setLoading(false);
        setError(null);
      }
      return;
    }

    setLoading(true);
    setError(null);
    fetchBankAccount(currentUser.id)
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
