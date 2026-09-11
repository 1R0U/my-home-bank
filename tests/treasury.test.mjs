import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAvailableTreasuryBalance,
  calculateMinimumReserve,
} from "../lib/treasury.ts";

test("家庭総HMCと準備金率から最低準備金を計算する", () => {
  assert.equal(calculateMinimumReserve(10_000, 0.2), 2_000);
  assert.equal(calculateMinimumReserve(9_999, 0.2), 1_999);
});

test("最低準備金を除いた利用可能な金庫残高を計算する", () => {
  assert.equal(
    calculateAvailableTreasuryBalance({
      balance: 6_000,
      totalSupply: 10_000,
      minimumReserveRate: 0.2,
    }),
    4_000,
  );
});

test("金庫残高が最低準備金以下なら利用可能額は0になる", () => {
  assert.equal(
    calculateAvailableTreasuryBalance({
      balance: 1_500,
      totalSupply: 10_000,
      minimumReserveRate: 0.2,
    }),
    0,
  );
});

test("不正なHMCと準備金率を拒否する", () => {
  assert.throws(() => calculateMinimumReserve(-1, 0.2), /0以上/);
  assert.throws(() => calculateMinimumReserve(100, 1.1), /0〜1/);
  assert.throws(
    () => calculateAvailableTreasuryBalance({ balance: 1.5, totalSupply: 100, minimumReserveRate: 0.2 }),
    /安全な整数/,
  );
  assert.throws(
    () => calculateAvailableTreasuryBalance({ balance: 101, totalSupply: 100, minimumReserveRate: 0.2 }),
    /家庭総HMC以下/,
  );
});
