import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCumulativeSeries,
  formatPeriodLabel,
  formatShortPeriodLabel,
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

test("日単位の期間キーを取得できる", () => {
  assert.equal(getPeriodKey("2026-08-02T08:30:00Z", "day"), "2026-08-02");
});

test("期間キーはローカルタイムゾーンに関係なくUTCの日付で決まる", () => {
  // 日本時間(UTC+9)ではローカル日付が翌日にずれてしまう時刻でも、UTCの日付で判定されることを
  // TZ=Asia/Tokyo を明示的に指定して検証する（CIがUTCで実行されても検知できるように）
  const originalTz = process.env.TZ;
  process.env.TZ = "Asia/Tokyo";

  try {
    assert.equal(getPeriodKey("2026-07-31T20:00:00Z", "day"), "2026-07-31");
    assert.equal(getPeriodKey("2026-07-31T20:00:00Z", "month"), "2026-07");
  } finally {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  }
});

test("週単位の期間キーは年またぎでも正しいISO週になる", () => {
  // 2026-12-31は木曜日で2026年第53週、2027-01-01は金曜日だが同じ第53週に属する
  assert.equal(getPeriodKey("2026-12-31T12:00:00Z", "week"), "2026-W53");
  assert.equal(getPeriodKey("2027-01-01T12:00:00Z", "week"), "2026-W53");
});

test("期間キーを日本語ラベルに変換できる", () => {
  assert.equal(formatPeriodLabel("2026-07", "month"), "2026年7月");
  assert.equal(formatPeriodLabel("2026", "year"), "2026年");
  assert.equal(formatPeriodLabel("2026-08-02", "day"), "2026年8月2日");
});

test("期間キーを短いラベルに変換できる（グラフの軸ラベル用）", () => {
  assert.equal(formatShortPeriodLabel("2026-07", "month"), "7月");
  assert.equal(formatShortPeriodLabel("2026", "year"), "2026");
  assert.equal(formatShortPeriodLabel("2026-08-02", "day"), "8/2");
  assert.equal(formatShortPeriodLabel("2026-W32", "week"), "W32");
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
    shortLabel: "7月",
    income: 50,
    expense: 20,
  });
  assert.deepEqual(summaries[1], {
    key: "2026-08",
    label: "2026年8月",
    shortLabel: "8月",
    income: 30,
    expense: 0,
  });
});

test("期間ごとの累計残高の推移を計算できる", () => {
  const summaries = groupTransactionsByPeriod(transactions, "month");
  const cumulative = buildCumulativeSeries(summaries);

  assert.deepEqual(
    cumulative.map((point) => point.balance),
    [30, 60],
  );
});

test("週単位・日単位でも取引を集計できる（年またぎを含む）", () => {
  const weekTransactions = [
    { id: "w1", amount: 100, created_at: "2026-12-31T12:00:00Z" },
    { id: "w2", amount: -40, created_at: "2027-01-01T12:00:00Z" },
  ];

  const weekSummaries = groupTransactionsByPeriod(weekTransactions, "week");
  assert.deepEqual(
    weekSummaries.map((summary) => summary.key),
    ["2026-W53"],
  );
  assert.deepEqual(
    weekSummaries.map((summary) => ({ income: summary.income, expense: summary.expense })),
    [{ income: 100, expense: 40 }],
  );

  const daySummaries = groupTransactionsByPeriod(transactions, "day");
  assert.deepEqual(
    daySummaries.map((summary) => summary.key),
    ["2026-07-10", "2026-07-12", "2026-08-02"],
  );

  const dayCumulative = buildCumulativeSeries(daySummaries);
  assert.deepEqual(
    dayCumulative.map((point) => point.balance),
    [50, 30, 60],
  );
});

test("複数年にまたがる場合、短縮ラベルに年を補って重複を避ける", () => {
  const multiYearTransactions = [
    { id: "m1", amount: 10, created_at: "2026-07-05T00:00:00Z" },
    { id: "m2", amount: 20, created_at: "2027-07-05T00:00:00Z" },
  ];

  const summaries = groupTransactionsByPeriod(multiYearTransactions, "month");
  assert.deepEqual(
    summaries.map((summary) => summary.shortLabel),
    ["2026/7月", "2027/7月"],
  );

  // 単年内であれば従来どおり年を含まない短いラベルのまま
  const singleYearSummaries = groupTransactionsByPeriod(transactions, "month");
  assert.deepEqual(
    singleYearSummaries.map((summary) => summary.shortLabel),
    ["7月", "8月"],
  );
});
