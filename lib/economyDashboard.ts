import type { EconomyTransaction, EconomyTransactionType, GuildTreasury, Loan } from "../types";
import { calculateAvailableTreasuryBalance, calculateMinimumReserve } from "./treasury.ts";

export type EconomyLogTypeFilter = "all" | "reward" | "purchase" | "loan" | "savings" | "issue";
export type EconomyLogPeriodFilter = "30d" | "90d" | "all";

export const ECONOMY_LOG_TYPE_LABELS: Record<EconomyLogTypeFilter, string> = {
  all: "すべて",
  reward: "報酬",
  purchase: "購入",
  loan: "ローン",
  savings: "積立",
  issue: "追加発行",
};

export const ECONOMY_TRANSACTION_LABELS: Record<EconomyTransactionType, string> = {
  treasury_initialization: "金庫開設",
  treasury_issue: "追加発行",
  quest_reward: "クエスト報酬",
  store_purchase: "ストア購入",
  loan_disburse: "ローン貸出",
  loan_repay_principal: "ローン元本返済",
  loan_interest: "ローン利息",
  savings_auto_transfer: "自動積立",
  savings_withdraw: "積立引き出し",
  savings_interest: "積立利息",
};

const TYPES_BY_FILTER: Record<Exclude<EconomyLogTypeFilter, "all">, EconomyTransactionType[]> = {
  reward: ["quest_reward"],
  purchase: ["store_purchase"],
  loan: ["loan_disburse", "loan_repay_principal", "loan_interest"],
  savings: ["savings_auto_transfer", "savings_withdraw", "savings_interest"],
  issue: ["treasury_initialization", "treasury_issue"],
};

export function calculateTreasuryMetrics(treasury: GuildTreasury) {
  const minimumReserve = calculateMinimumReserve(
    treasury.total_supply,
    treasury.minimum_reserve_rate,
  );
  return {
    minimumReserve,
    lendable: calculateAvailableTreasuryBalance({
      balance: treasury.balance,
      totalSupply: treasury.total_supply,
      minimumReserveRate: treasury.minimum_reserve_rate,
    }),
  };
}

export type ReserveStatus = "safe" | "warning" | "critical";

export function getReserveStatus(treasury: GuildTreasury): ReserveStatus {
  const { minimumReserve, lendable } = calculateTreasuryMetrics(treasury);
  if (treasury.balance <= minimumReserve) return "critical";
  const warningBuffer = Math.max(1, Math.ceil(minimumReserve * 0.1));
  return lendable <= warningBuffer ? "warning" : "safe";
}

export function filterEconomyTransactions(
  transactions: EconomyTransaction[],
  filters: {
    type: EconomyLogTypeFilter;
    childId: string | "all";
    period: EconomyLogPeriodFilter;
  },
  now = new Date(),
) {
  const oldest = filters.period === "all"
    ? null
    : new Date(now.getTime() - Number.parseInt(filters.period, 10) * 24 * 60 * 60 * 1000);

  return transactions.filter((transaction) => {
    if (filters.type !== "all" && !TYPES_BY_FILTER[filters.type].includes(transaction.type)) {
      return false;
    }
    if (filters.childId !== "all") {
      const relatedUsers = [
        transaction.actor_user_id,
        transaction.from_user_id,
        transaction.to_user_id,
      ];
      if (!relatedUsers.includes(filters.childId)) return false;
    }
    return oldest === null || new Date(transaction.created_at) >= oldest;
  });
}

export function findTransactionChildId(
  transaction: EconomyTransaction,
  childIds: ReadonlySet<string>,
) {
  return [transaction.to_user_id, transaction.from_user_id, transaction.actor_user_id]
    .find((id): id is string => Boolean(id && childIds.has(id))) ?? null;
}

export function getPriceState(priceIndex: number) {
  if (priceIndex < 100) return "デフレ";
  if (priceIndex === 100) return "安定";
  if (priceIndex <= 105) return "軽いインフレ";
  return "強いインフレ";
}

export function countLoanStatuses(loans: Loan[], now = new Date()) {
  return loans.reduce(
    (summary, loan) => {
      if (loan.status === "pending") summary.pending += 1;
      if (loan.status === "active") {
        summary.active += 1;
        if (loan.due_at && new Date(loan.due_at) < now) summary.overdue += 1;
      }
      return summary;
    },
    { pending: 0, active: 0, overdue: 0 },
  );
}
