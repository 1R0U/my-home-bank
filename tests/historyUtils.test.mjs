import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPeriodLabel,
  getPeriodKey,
  groupTransactionsByPeriod,
} from "../components/history/historyUtils.ts";

const transactions = [
  { id: "t1", amount: 50, created_at: "2026-07-10T21:00:00Z" },
  { id: "t2", amount: -20, created_at: "2026-07-12T20:00:00Z" },
  { id: "t3", amount: 30, created_at: "2026-08-02T08:30:00Z" },
];

test("月単位の期間キーを取得できる", () => {
  assert.equal(getPeriodKey("2026-07-10T21:00:00Z", "month"), "2026-07");
  assert.equal(getPeriodKey("2026-08-02T08:30:00Z", "month"), "2026-08");
});

test("年単位の期間キーを取得できる", () => {
  assert.equal(getPeriodKey("2026-07-10T21:00:00Z", "year"), "2026");
});

test("期間キーを日本語ラベルに変換できる", () => {
  assert.equal(formatPeriodLabel("2026-07", "month"), "2026年7月");
  assert.equal(formatPeriodLabel("2026", "year"), "2026年");
});

test("取引を期間ごとに集計し、古い順に並べる", () => {
  const summaries = groupTransactionsByPeriod(transactions, "month");

  assert.deepEqual(
    summaries.map((summary) => summary.key),
    ["2026-07", "2026-08"],
  );
  assert.deepEqual(summaries[0], {
    key: "2026-07",
    label: "2026年7月",
    income: 50,
    expense: 20,
  });
  assert.deepEqual(summaries[1], {
    key: "2026-08",
    label: "2026年8月",
    income: 30,
    expense: 0,
  });
});
