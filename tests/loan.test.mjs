import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateLoanInterest,
  calculateLoanTotal,
  formatMonthlyRate,
  getLoanRemaining,
  isLoanOverdue,
  normalizeLoanRatePercentInput,
} from "../lib/loan.ts";

const loan = {
  id: "loan-1",
  family_id: "family-1",
  borrower_id: "child-1",
  requested_amount: 100,
  purpose: "本",
  status: "active",
  monthly_interest_rate: 0.05,
  term_days: 30,
  principal_amount: 100,
  interest_amount: 5,
  principal_repaid: 20,
  interest_repaid: 5,
  request_idempotency_key: "request-1",
  approved_by: "parent-1",
  requested_at: "2026-09-01T00:00:00Z",
  approved_at: "2026-09-01T00:00:00Z",
  rejected_at: null,
  due_at: "2026-10-01T00:00:00Z",
  completed_at: null,
  updated_at: "2026-09-01T00:00:00Z",
};

test("月利5%・30日の単利を計算する", () => {
  assert.equal(calculateLoanInterest(100, 0.05, 30), 5);
  assert.equal(calculateLoanTotal(100, 0.05, 30), 105);
});

test("浮動小数点誤差で利息を過大に切り上げない", () => {
  assert.equal(calculateLoanInterest(100, 0.07, 30), 7);
  assert.equal(calculateLoanInterest(100, 0.29, 30), 29);
});

test("単利の端数はHMC単位で切り上げる", () => {
  assert.equal(calculateLoanInterest(101, 0.05, 30), 6);
  assert.equal(calculateLoanInterest(100, 0.05, 15), 3);
});

test("未返済の元本と利息から残額を求める", () => {
  assert.equal(getLoanRemaining(loan), 80);
});

test("契約中で期限を過ぎたローンだけを延滞とする", () => {
  assert.equal(isLoanOverdue(loan, new Date("2026-10-02T00:00:00Z")), true);
  assert.equal(isLoanOverdue({ ...loan, status: "paid" }, new Date("2026-10-02T00:00:00Z")), false);
  assert.equal(isLoanOverdue(loan, new Date("2026-09-30T00:00:00Z")), false);
});

test("月利をパーセント表記にする", () => {
  assert.equal(formatMonthlyRate(0.05), "5%");
  assert.equal(formatMonthlyRate(0.0125), "1.25%");
});

test("月利のパーセント入力を小数4桁までに整える", () => {
  assert.equal(normalizeLoanRatePercentInput("5.123456"), "5.1234");
  assert.equal(normalizeLoanRatePercentInput("5..1a2"), "5.12");
  assert.equal(normalizeLoanRatePercentInput("100"), "100");
});
