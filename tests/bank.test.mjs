import assert from "node:assert/strict";
import test from "node:test";
import { findBankAccount, formatYen } from "../lib/bank.ts";

const accounts = [
  {
    id: "bank-1",
    user_id: "user-child-1",
    deposit_balance: 200,
    interest_rate: 0.05,
    loan_balance: 0,
    loan_rate: 0.1,
    updated_at: "2026-07-13T00:00:00Z",
  },
  {
    id: "bank-2",
    user_id: "user-child-2",
    deposit_balance: 0,
    interest_rate: 0.05,
    loan_balance: 300,
    loan_rate: 0.1,
    updated_at: "2026-07-13T00:00:00Z",
  },
];

test("該当ユーザーの口座が見つかる", () => {
  const account = findBankAccount(accounts, "user-child-2");

  assert.equal(account?.id, "bank-2");
});

test("該当ユーザーの口座が無い場合はundefinedを返す", () => {
  const account = findBankAccount(accounts, "user-parent-1");

  assert.equal(account, undefined);
});

test("金額を日本円表記でフォーマットする", () => {
  assert.equal(formatYen(0), "￥0");
  assert.equal(formatYen(200), "￥200");
  assert.equal(formatYen(12345), "￥12,345");
});
