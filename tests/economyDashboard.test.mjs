import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTreasuryMetrics,
  countLoanStatuses,
  filterEconomyTransactions,
  findTransactionChildId,
  getPriceState,
  getReserveStatus,
} from "../lib/economyDashboard.ts";

const treasury = (overrides = {}) => ({
  id: "treasury-1",
  family_id: "family-1",
  balance: 400,
  initial_supply: 1000,
  total_supply: 1000,
  minimum_reserve_rate: 0.1,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...overrides,
});

const transaction = (overrides = {}) => ({
  id: "transaction-1",
  family_id: "family-1",
  actor_user_id: "child-1",
  type: "quest_reward",
  from_account_type: "treasury",
  from_user_id: null,
  to_account_type: "wallet",
  to_user_id: "child-1",
  amount: 100,
  description: "報酬",
  related_type: null,
  related_id: null,
  idempotency_key: "key-1",
  created_at: "2026-09-10T00:00:00Z",
  ...overrides,
});

test("最低準備金と貸出可能額を計算し、近づいた状態を警告する", () => {
  assert.deepEqual(calculateTreasuryMetrics(treasury()), { minimumReserve: 100, lendable: 300 });
  assert.equal(getReserveStatus(treasury()), "safe");
  assert.equal(getReserveStatus(treasury({ balance: 110 })), "warning");
  assert.equal(getReserveStatus(treasury({ balance: 100 })), "critical");
});

test("経済ログを種別・子ども・期間で絞り込む", () => {
  const rows = [
    transaction(),
    transaction({ id: "transaction-2", actor_user_id: "child-2", to_user_id: "child-2", type: "savings_interest", created_at: "2026-09-15T00:00:00Z" }),
    transaction({ id: "transaction-3", type: "loan_disburse", created_at: "2026-05-01T00:00:00Z" }),
  ];
  assert.deepEqual(
    filterEconomyTransactions(rows, { type: "savings", childId: "child-2", period: "30d" }, new Date("2026-09-20T00:00:00Z")).map((row) => row.id),
    ["transaction-2"],
  );
  assert.deepEqual(
    filterEconomyTransactions(rows, { type: "all", childId: "child-1", period: "all" }, new Date("2026-09-20T00:00:00Z")).map((row) => row.id),
    ["transaction-1", "transaction-3"],
  );
});

test("物価指数の状態とローン件数を表示用にまとめる", () => {
  assert.equal(getPriceState(95), "デフレ");
  assert.equal(getPriceState(100), "安定");
  assert.equal(getPriceState(105), "軽いインフレ");
  assert.equal(getPriceState(110), "強いインフレ");

  const baseLoan = {
    id: "loan-1", family_id: "family-1", borrower_id: "child-1", requested_amount: 100,
    purpose: "本", monthly_interest_rate: 0.05, term_days: 30, principal_amount: 100,
    interest_amount: 5, principal_repaid: 0, interest_repaid: 0, request_idempotency_key: "key",
    approved_by: null, requested_at: "2026-09-01T00:00:00Z", approved_at: null,
    rejected_at: null, completed_at: null, updated_at: "2026-09-01T00:00:00Z",
  };
  assert.deepEqual(countLoanStatuses([
    { ...baseLoan, status: "pending", due_at: null },
    { ...baseLoan, id: "loan-2", status: "active", due_at: "2026-09-10T00:00:00Z" },
    { ...baseLoan, id: "loan-3", status: "active", due_at: "2026-10-10T00:00:00Z" },
  ], new Date("2026-09-20T00:00:00Z")), { pending: 1, active: 2, overdue: 1 });
});

test("取引の実行者が親でも入出金先の子どもを表示対象にする", () => {
  assert.equal(
    findTransactionChildId(
      transaction({ actor_user_id: "parent-1", to_user_id: "child-1" }),
      new Set(["child-1"]),
    ),
    "child-1",
  );
});
