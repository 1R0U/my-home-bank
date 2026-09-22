import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCumulativeSeries,
  filterTransactionsByUser,
  formatPeriodLabel,
  formatShortPeriodLabel,
  getPeriodKey,
  groupTransactionsByPeriod,
} from "../components/history/historyUtils.ts";

const transactions = [
  { id: "t1", type: "quest_reward", amount: 50, created_at: "2026-07-10T21:00:00Z" },
  { id: "t2", type: "store_purchase", amount: -20, created_at: "2026-07-12T20:00:00Z" },
  { id: "t3", type: "quest_reward", amount: 30, created_at: "2026-08-02T08:30:00Z" },
];

test("指定したユーザーIDの取引だけを抽出できる（親・子で表示対象を切り替える用途）", () => {
  const mixedTransactions = [
    { id: "p1", user_id: "user-parent-1", amount: 50, created_at: "2026-07-10T21:00:00Z" },
    { id: "c1", user_id: "user-child-1", amount: 30, created_at: "2026-07-11T21:00:00Z" },
    { id: "c2", user_id: "user-child-1", amount: -20, created_at: "2026-07-12T21:00:00Z" },
  ];

  assert.deepEqual(
    filterTransactionsByUser(mixedTransactions, "user-child-1").map((transaction) => transaction.id),
    ["c1", "c2"],
  );
  assert.deepEqual(
    filterTransactionsByUser(mixedTransactions, "user-parent-1").map((transaction) => transaction.id),
    ["p1"],
  );
  assert.deepEqual(filterTransactionsByUser(mixedTransactions, "user-child-2"), []);
});

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
    { id: "w1", type: "quest_reward", amount: 100, created_at: "2026-12-31T12:00:00Z" },
    { id: "w2", type: "store_purchase", amount: -40, created_at: "2027-01-01T12:00:00Z" },
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

test("複数年にまたがる場合、短縮ラベルに西暦下2桁を補って重複を避ける", () => {
  const multiYearTransactions = [
    { id: "m1", type: "quest_reward", amount: 10, created_at: "2026-07-05T00:00:00Z" },
    { id: "m2", type: "quest_reward", amount: 20, created_at: "2027-07-05T00:00:00Z" },
  ];

  const summaries = groupTransactionsByPeriod(multiYearTransactions, "month");
  assert.deepEqual(
    summaries.map((summary) => summary.shortLabel),
    ["'26/7月", "'27/7月"],
  );

  // 日単位でも同じ規則で重複を避けられる（狭いグラフ列幅でも収まる短さを保つ）
  const multiYearDayTransactions = [
    { id: "d1", type: "quest_reward", amount: 10, created_at: "2026-08-02T00:00:00Z" },
    { id: "d2", type: "quest_reward", amount: 20, created_at: "2027-08-02T00:00:00Z" },
  ];
  const daySummaries = groupTransactionsByPeriod(multiYearDayTransactions, "day");
  assert.deepEqual(
    daySummaries.map((summary) => summary.shortLabel),
    ["'26/8/2", "'27/8/2"],
  );

  // 単年内であれば従来どおり年を含まない短いラベルのまま
  const singleYearSummaries = groupTransactionsByPeriod(transactions, "month");
  assert.deepEqual(
    singleYearSummaries.map((summary) => summary.shortLabel),
    ["7月", "8月"],
  );
});

// --- Issue #143: 振替（預入・引き出し・借り入れ・返済）を収支として数えない ---

test("預入は収支に数えない（100P稼いで100P預けた月が「収入100/支出100」にならない）", () => {
  const depositTransactions = [
    { id: "r1", type: "quest_reward", amount: 100, created_at: "2026-07-10T00:00:00Z" },
    { id: "d1", type: "bank_deposit", amount: -100, created_at: "2026-07-11T00:00:00Z" },
  ];

  const summaries = groupTransactionsByPeriod(depositTransactions, "month");

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].income, 100, "稼いだ100Pだけが収入になる");
  assert.equal(summaries[0].expense, 0, "預入は支出ではない");
});

test("引き出しは収支に数えない（預金を戻しただけで収入が増えない）", () => {
  const summaries = groupTransactionsByPeriod(
    [{ id: "w1", type: "bank_withdraw", amount: 30, created_at: "2026-07-11T00:00:00Z" }],
    "month",
  );

  assert.deepEqual(
    summaries.map((summary) => ({ income: summary.income, expense: summary.expense })),
    [{ income: 0, expense: 0 }],
  );
});

test("借り入れ・返済は収支に数えない（借りた額が稼ぎとして表示されない）", () => {
  const loanTransactions = [
    { id: "l1", type: "bank_loan", amount: 100, created_at: "2026-07-10T00:00:00Z" },
    { id: "p1", type: "bank_repay", amount: -100, created_at: "2026-07-20T00:00:00Z" },
  ];

  const summaries = groupTransactionsByPeriod(loanTransactions, "month");

  assert.deepEqual(
    summaries.map((summary) => ({ income: summary.income, expense: summary.expense })),
    [{ income: 0, expense: 0 }],
  );
});

test("借りた通貨を使った分は、支出として1回だけ数える（二重計上しない）", () => {
  const borrowAndSpend = [
    { id: "l1", type: "bank_loan", amount: 100, created_at: "2026-07-10T00:00:00Z" },
    { id: "s1", type: "store_purchase", amount: -100, created_at: "2026-07-11T00:00:00Z" },
    { id: "p1", type: "bank_repay", amount: -100, created_at: "2026-07-20T00:00:00Z" },
  ];

  const summaries = groupTransactionsByPeriod(borrowAndSpend, "month");

  assert.equal(summaries[0].income, 0);
  assert.equal(summaries[0].expense, 100, "使った100Pだけが支出になる");
});

test("預金利息は収入に数える", () => {
  const summaries = groupTransactionsByPeriod(
    [{ id: "i1", type: "bank_interest", amount: 2, created_at: "2026-07-11T00:00:00Z" }],
    "month",
  );

  assert.equal(summaries[0].income, 2);
  assert.equal(summaries[0].expense, 0);
});

test("未知の取引種別は、収入にも支出にも数えない", () => {
  const summaries = groupTransactionsByPeriod(
    [{ id: "x1", type: "unknown_future_type", amount: 999, created_at: "2026-07-11T00:00:00Z" }],
    "month",
  );

  assert.deepEqual(
    summaries.map((summary) => ({ key: summary.key, income: summary.income, expense: summary.expense })),
    [{ key: "2026-07", income: 0, expense: 0 }],
    "分類できない取引でも、期間自体はグラフから消さない",
  );
});

test("累積残高が「財布＋預金−借金」の推移になる（振替では上下しない）", () => {
  // 7月: 報酬100を稼ぎ、うち60を預金する → 保有総量は100のまま
  // 8月: 100借りて、80をストアで使い、100返す     → 保有総量は80減る
  const mixedTransactions = [
    { id: "a1", type: "quest_reward", amount: 100, created_at: "2026-07-05T00:00:00Z" },
    { id: "a2", type: "bank_deposit", amount: -60, created_at: "2026-07-06T00:00:00Z" },
    { id: "a3", type: "bank_loan", amount: 100, created_at: "2026-08-05T00:00:00Z" },
    { id: "a4", type: "store_purchase", amount: -80, created_at: "2026-08-06T00:00:00Z" },
    { id: "a5", type: "bank_repay", amount: -100, created_at: "2026-08-07T00:00:00Z" },
  ];

  const summaries = groupTransactionsByPeriod(mixedTransactions, "month");
  const cumulative = buildCumulativeSeries(summaries);

  assert.deepEqual(
    cumulative.map((point) => point.balance),
    [100, 20],
  );
});
