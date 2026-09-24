import type { Loan } from "../types";

/** 月利の単利。HMCは整数なので端数は切り上げる。 */
export function calculateLoanInterest(principal: number, monthlyRate: number, termDays: number) {
  if (!Number.isSafeInteger(principal) || principal <= 0) return 0;
  if (!Number.isFinite(monthlyRate) || monthlyRate < 0) return 0;
  if (!Number.isInteger(termDays) || termDays <= 0) return 0;
  return Math.ceil(principal * monthlyRate * (termDays / 30));
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
