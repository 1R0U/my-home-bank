import type { BankAccount } from "../types";

export function findBankAccount(
  accounts: BankAccount[],
  userId: string,
): BankAccount | undefined {
  return accounts.find((account) => account.user_id === userId);
}

export function formatYen(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}
