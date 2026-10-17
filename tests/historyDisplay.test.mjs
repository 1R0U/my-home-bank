import assert from "node:assert/strict";
import test from "node:test";
import {
  amountSign,
  amountSuffixLabel,
  amountTone,
  nextGranularity,
  sortTransactionsNewestFirst,
} from "../components/history/historyDisplay.ts";

test("粒度は日→週→月→年→日の順に切り替わる", () => {
  assert.equal(nextGranularity("day"), "week");
  assert.equal(nextGranularity("week"), "month");
  assert.equal(nextGranularity("month"), "year");
  assert.equal(nextGranularity("year"), "day");
});

test("金額の色分けは、振替と未知の種別を中立にする（Issue #143）", () => {
  assert.equal(amountTone("quest_reward"), "income");
  assert.equal(amountTone("store_purchase"), "expense");
  assert.equal(amountTone("bank_deposit"), "neutral");
  assert.equal(amountTone("unknown_type"), "neutral");
});

test("読み上げでは振替だけに補足を付ける", () => {
  assert.equal(amountSuffixLabel("bank_deposit"), "（振替）");
  assert.equal(amountSuffixLabel("quest_reward"), "");
  assert.equal(amountSuffixLabel("unknown_type"), "");
});

test("プラスと0には + を付け、マイナスには付けない", () => {
  assert.equal(amountSign(10), "+");
  assert.equal(amountSign(0), "+");
  assert.equal(amountSign(-10), "");
});

test("取引を新しい順に並べ、元の配列は変えない", () => {
  const original = [
    { created_at: "2026-07-01T00:00:00Z", id: "a" },
    { created_at: "2026-07-03T00:00:00Z", id: "b" },
    { created_at: "2026-07-02T00:00:00Z", id: "c" },
  ];
  assert.deepEqual(sortTransactionsNewestFirst(original).map((t) => t.id), ["b", "c", "a"]);
  assert.deepEqual(original.map((t) => t.id), ["a", "b", "c"]);
});
