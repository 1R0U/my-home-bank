import type { Loan } from "../types";

/** 月利の単利。HMCは整数なので端数は切り上げる。 */
export function calculateLoanInterest(principal: number, monthlyRate: number, termDays: number) {
  if (!Number.isSafeInteger(principal) || principal <= 0) return 0;
  if (!Number.isFinite(monthlyRate) || monthlyRate < 0) return 0;
  if (!Number.isInteger(termDays) || termDays <= 0) return 0;
  // DBのnumeric(7, 6)と同じ100万分の1単位に丸め、整数演算で切り上げる。
  const rateMicros = BigInt(Math.round(monthlyRate * 1_000_000));
  const numerator = BigInt(principal) * rateMicros * BigInt(termDays);
  const denominator = BigInt(30_000_000);
  return Number((numerator + denominator - BigInt(1)) / denominator);
}

export function calculateLoanTotal(principal: number, monthlyRate: number, termDays: number) {
  return principal + calculateLoanInterest(principal, monthlyRate, termDays);
}

export function getLoanRemaining(loan: Loan) {
  return Math.max(
    0,
    (loan.principal_amount ?? 0) +
      (loan.interest_amount ?? 0) -
      loan.principal_repaid -
      loan.interest_repaid,
  );
}

export function isLoanOverdue(loan: Loan, now = new Date()) {
  return loan.status === "active" && Boolean(loan.due_at) && new Date(loan.due_at as string) < now;
}

export function formatMonthlyRate(rate: number) {
  return `${Math.round(rate * 10000) / 100}%`;
}

/** 月利のパーセント入力を数字1個、小数点1個、小数4桁までに整える。 */
export function normalizeLoanRatePercentInput(value: string) {
  const filtered = value.replace(/[^0-9.]/g, "");
  const dotIndex = filtered.indexOf(".");
  if (dotIndex < 0) return filtered;
  const integerPart = filtered.slice(0, dotIndex);
  const decimalPart = filtered.slice(dotIndex + 1).replace(/\./g, "").slice(0, 4);
  return `${integerPart}.${decimalPart}`;
}
