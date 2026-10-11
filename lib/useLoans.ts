import type { Loan, LoanOffer } from "../types";
import { fetchLoanOffer, fetchLoans } from "./loanService";
import { useCurrentUser, useDataAccess } from "../store";
import { useResource } from "./useResource";

type LoansData = { loans: Loan[]; offer: LoanOffer | null };

const EMPTY_LOANS: LoansData = { loans: [], offer: null };

/** ローンの一覧と、子供なら借りられる条件（オファー）を取得する。 */
export function useLoans() {
  const user = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const userId = user?.id;
  const role = user?.role;

  const { data, error, isLive, loading, reload } = useResource<LoansData>({
    errorMessage: "ローン情報を取得できませんでした",
    fetcher: async () => {
      const [loans, offer] = await Promise.all([
        fetchLoans(),
        role === "child" ? fetchLoanOffer(userId) : Promise.resolve(null),
      ]);
      return { loans, offer };
    },
    initialData: EMPTY_LOANS,
    key: canUseRealData && userId ? ["loans", userId, role] : null,
  });

  return { loans: data.loans, offer: data.offer, loading, error, isLive, reload };
}
