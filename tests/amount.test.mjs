import assert from "node:assert/strict";
import test from "node:test";
import { AMOUNT_UNITS, formatAmount, formatAmountWithUnit } from "../lib/amount.ts";

test("桁区切りを入れる", () => {
  assert.equal(formatAmount(1000), "1,000");
  assert.equal(formatAmount(1234567), "1,234,567");
});

test("4桁未満はそのまま", () => {
  assert.equal(formatAmount(0), "0");
  assert.equal(formatAmount(50), "50");
  assert.equal(formatAmount(999), "999");
});

test("負の額も扱える（履歴の支出など）", () => {
  assert.equal(formatAmount(-1500), "-1,500");
});

test("単位を付ける", () => {
  assert.equal(formatAmountWithUnit(1000, AMOUNT_UNITS.pt), "1,000pt");
  assert.equal(formatAmountWithUnit(1000, AMOUNT_UNITS.p), "1,000P");
  assert.equal(formatAmountWithUnit(1000, AMOUNT_UNITS.spoken), "1,000ポイント");
});

test("単位に前後の空白を含めない（空白はレイアウトなので呼び出し側が入れる）", () => {
  for (const [name, unit] of Object.entries(AMOUNT_UNITS)) {
    assert.equal(unit, unit.trim(), `${name} に空白が含まれている: ${JSON.stringify(unit)}`);
  }
});
