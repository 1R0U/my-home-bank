import type { SupabaseClient } from "@supabase/supabase-js";
import type { EconomyTransaction, GuildTreasury, Loan, LoanOffer } from "../types";
import { fetchFamilyBorrowers, fetchLoanOffer, fetchLoans, type FamilyBorrower } from "./loanService.ts";
import { fetchSavingsSummary, type SavingsSummary } from "./savingsService.ts";
import { resolveClient } from "./supabaseClient.ts";
import { fetchEconomyTransactions, fetchGuildTreasury } from "./treasuryService.ts";

export type PriceSnapshot = {
  snapshot_month: string;
  avg_circulating_gol: number;
  target_gol: number;
  price_index: number;
  calculation_basis: Record<string, unknown>;
};

export type EconomyPriceOverview = {
  current: PriceSnapshot;
  previous: PriceSnapshot | null;
  next_update_date: string;
};

export type BorrowerLoanSettings = FamilyBorrower & { offer: LoanOffer | null };

export type EconomyDashboardData = {
  treasury: GuildTreasury;
  transactions: EconomyTransaction[];
  loans: Loan[];
  borrowers: BorrowerLoanSettings[];
  savings: SavingsSummary;
  price: EconomyPriceOverview;
  pendingRewardTotal: number;
};

type DashboardClient = Pick<SupabaseClient, "from" | "rpc">;

export async function fetchEconomyPriceOverview(
  client?: Pick<SupabaseClient, "rpc">,
): Promise<EconomyPriceOverview> {
  const resolved = await resolveClient(client);
  const { data, error } = await resolved.rpc("get_economy_price_overview");
  if (error) throw error;
  if (!data?.current || !data.next_update_date) {
    throw new Error("物価情報を取得できませんでした");
  }
  return data as EconomyPriceOverview;
}

export async function fetchPendingRewardTotal(
  familyId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<number> {
  const resolved = await resolveClient(client);
  const { data, error } = await resolved
    .from("quests")
    .select("reward_amount")
    .eq("family_id", familyId)
    .eq("status", "pending");
  if (error) throw error;
  return (data ?? []).reduce((total, quest) => total + Number(quest.reward_amount), 0);
}

export async function fetchEconomyDashboard(
  familyId: string,
  client?: DashboardClient,
): Promise<EconomyDashboardData> {
  const [treasury, transactions, loans, borrowers, savings, price, pendingRewardTotal] =
    await Promise.all([
      fetchGuildTreasury(familyId, client),
      fetchEconomyTransactions(familyId, client),
      fetchLoans(client),
      fetchFamilyBorrowers(familyId, client),
      fetchSavingsSummary(client),
      fetchEconomyPriceOverview(client),
      fetchPendingRewardTotal(familyId, client),
    ]);

  if (!treasury) throw new Error("ギルド金庫が見つかりませんでした");

  const offerResults = await Promise.allSettled(
    borrowers.map((borrower) => fetchLoanOffer(borrower.id, client)),
  );
  const borrowerSettings = borrowers.map((borrower, index) => ({
    ...borrower,
    offer: offerResults[index].status === "fulfilled" ? offerResults[index].value : null,
  }));

  return {
    treasury,
    transactions,
    loans,
    borrowers: borrowerSettings,
    savings,
    price,
    pendingRewardTotal,
  };
}
