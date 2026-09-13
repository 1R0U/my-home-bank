import assert from "node:assert/strict";
import test from "node:test";
import {
  CASH_FLOW_CLASS_BY_TYPE,
  classifyCashFlow,
} from "../lib/transactionClassification.ts";

// types/index.ts の TransactionType と同じ一覧。
// 型定義に種別を足してこの一覧を更新し忘れた場合は、下の網羅テストで気づける。
const ALL_TRANSACTION_TYPES = [
  "quest_reward",
  "store_purchase",
  "bank_interest",
  "bank_loan",
  "bank_deposit",
  "bank_withdraw",
  "bank_repay",
];

test("すべての取引種別に収支分類がある（分類の追加漏れを検出する）", () => {
  for (const type of ALL_TRANSACTION_TYPES) {
    assert.notEqual(
      classifyCashFlow(type),
      null,
      `${type} に収支分類が設定されていない`,
    );
  }

  // 分類表に、TransactionType に存在しない種別が紛れ込んでいないことも確認する
  assert.deepEqual(
    Object.keys(CASH_FLOW_CLASS_BY_TYPE).sort(),
    [...ALL_TRANSACTION_TYPES].sort(),
  );
});

test("クエスト報酬と預金利息は収入に分類する（通貨が新しく手に入る）", () => {
  assert.equal(classifyCashFlow("quest_reward"), "income");
  assert.equal(classifyCashFlow("bank_interest"), "income");
});

test("ストア購入は支出に分類する（通貨を使ってなくなる）", () => {
  assert.equal(classifyCashFlow("store_purchase"), "expense");
});

test("預入・引き出し・借り入れ・返済は振替に分類する（保有する通貨の総量が変わらない）", () => {
  assert.equal(classifyCashFlow("bank_deposit"), "transfer");
  assert.equal(classifyCashFlow("bank_withdraw"), "transfer");
  assert.equal(classifyCashFlow("bank_loan"), "transfer");
  assert.equal(classifyCashFlow("bank_repay"), "transfer");
});

test("未知の取引種別は、収入や支出へ勝手に分類せずnullを返す", () => {
  assert.equal(classifyCashFlow("unknown_future_type"), null);
  assert.equal(classifyCashFlow(""), null);
});

test("プロトタイプ由来のプロパティ名を、分類済みの種別として扱わない", () => {
  // Object.hasOwn での絞り込みが外れると、"toString" などが関数を返してしまう
  assert.equal(classifyCashFlow("toString"), null);
  assert.equal(classifyCashFlow("constructor"), null);
  assert.equal(classifyCashFlow("__proto__"), null);
});
