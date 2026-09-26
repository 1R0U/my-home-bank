import type { BankAccount } from "../types";

/**
 * 指定したユーザーIDに対応する銀行口座を検索する。
 * @param accounts - 検索対象の銀行口座配列
 * @param userId - 検索するユーザーのID
 * @returns 該当する銀行口座。見つからない場合は undefined
 */
export function findBankAccount(
  accounts: BankAccount[],
  userId: string,
): BankAccount | undefined {
  return accounts.find((account) => account.user_id === userId);
}
