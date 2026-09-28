import test from "node:test";
import assert from "node:assert/strict";
import { savingsMonthlyRate, savingsDueDate, savingsCalendarMonth, parseSavingsAmount } from "../lib/savings.ts";

test("金庫比率20/30/50%の直前と境界を判定する", () => {
  for (const [balance, expected] of [[0, 0], [199, 0], [200, .0025], [299, .0025], [300, .005], [499, .005], [500, .01], [1000, .01]]) {
    assert.equal(savingsMonthlyRate(balance, 1000), expected);
  }
  assert.equal(savingsMonthlyRate(0, 0), 0);
  assert.equal(savingsMonthlyRate(4503599627370495, Number.MAX_SAFE_INTEGER), .005);
  assert.equal(savingsMonthlyRate(4503599627370496, Number.MAX_SAFE_INTEGER), .01);
  assert.throws(() => savingsMonthlyRate(1, 0));
  assert.throws(() => savingsMonthlyRate(-1, 100));
  assert.throws(() => savingsMonthlyRate(1.5, 100));
});

test("積立日は短い月・閏年・年末に対応する", () => {
  assert.equal(savingsDueDate("2026-02-01", 31), "2026-02-28");
  assert.equal(savingsDueDate("2028-02-01", 31), "2028-02-29");
  assert.equal(savingsDueDate("2026-04-01", 31), "2026-04-30");
  assert.equal(savingsDueDate("2026-12-01", 1), "2026-12-01");
  for (const day of [0, 32, 1.5, NaN]) assert.throws(() => savingsDueDate("2026-01-01", day));
  assert.throws(() => savingsDueDate("2026-13-01", 1));
});

test("家庭の月境界は日本時間で判定する", () => {
  assert.equal(savingsCalendarMonth("2026-12-31T14:59:59Z"), "2026-12-01");
  assert.equal(savingsCalendarMonth("2026-12-31T15:00:00Z"), "2027-01-01");
});

test("積立額は0で停止でき、小数・負数・安全整数超過は拒否する", () => {
  assert.equal(parseSavingsAmount("0"), 0);
  assert.equal(parseSavingsAmount(" 1000 "), 1000);
  for (const text of ["", "-1", "1.5", "1e3", "9007199254740992"]) assert.equal(parseSavingsAmount(text), null);
});
