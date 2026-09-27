import { useCallback, useEffect, useRef, useState } from "react";
import type { Loan, LoanOffer } from "../types";
import { createStaleGuard } from "./staleGuard";
import { fetchLoanOffer, fetchLoans } from "./loanService";
import { useCurrentUser, useDataAccess } from "../store";
import { useRefetchOnFocus } from "./useRefetchOnFocus";

export function useLoans() {
  const user = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [offer, setOffer] = useState<LoanOffer | null>(null);
  const [loading, setLoading] = useState(canUseRealData);
  const [error, setError] = useState<string | null>(null);
  const guardRef = useRef(createStaleGuard());

  const reload = useCallback(async () => {
    const requestId = guardRef.current.start();
    if (!canUseRealData || !user) {
      setLoans([]);
      setOffer(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [nextLoans, nextOffer] = await Promise.all([
        fetchLoans(),
        user.role === "child" ? fetchLoanOffer(user.id) : Promise.resolve(null),
      ]);
      if (!guardRef.current.isCurrent(requestId)) return;
      setLoans(nextLoans);
      setOffer(nextOffer);
    } catch (e) {
      if (!guardRef.current.isCurrent(requestId)) return;
      console.warn("ローン情報の取得に失敗しました", e);
      setError("ローン情報を取得できませんでした");
    } finally {
      if (guardRef.current.isCurrent(requestId)) setLoading(false);
    }
  }, [canUseRealData, user?.id, user?.role]);

  useEffect(() => {
    void reload();
  }, [reload]);
  useRefetchOnFocus(reload);

  return { loans, offer, loading, error, isLive: canUseRealData, reload };
}
