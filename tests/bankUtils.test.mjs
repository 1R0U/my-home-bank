import assert from "node:assert/strict";
import test from "node:test";
import { canDeposit, canWithdraw, parseAmountInput } from "../lib/bankUtils.ts";

test("parseAmountInput: 正しい整数文字列を数値に変換する", () => {
  assert.equal(parseAmountInput("100"), 100);
  assert.equal(parseAmountInput("1"), 1);
});

test("parseAmountInput: 空文字・0・負数・小数・数値以外はnullを返す", () => {
  assert.equal(parseAmountInput(""), null);
  assert.equal(parseAmountInput("  "), null);
  assert.equal(parseAmountInput("0"), null);
  assert.equal(parseAmountInput("-5"), null);
  assert.equal(parseAmountInput("1.5"), null);
  assert.equal(parseAmountInput("abc"), null);
});

test("parseAmountInput: 安全な整数範囲外の入力はnullを返す", () => {
  assert.equal(parseAmountInput("9007199254740993"), null);
  assert.equal(parseAmountInput("99999999999999999"), null);
});

test("canDeposit: ライブ接続中・所持金以内の金額のみ預入できる", () => {
  assert.equal(canDeposit(100, 500, true), true);
  assert.equal(canDeposit(500, 500, true), true);
  assert.equal(canDeposit(501, 500, true), false);
  assert.equal(canDeposit(100, 500, false), false);
  assert.equal(canDeposit(null, 500, true), false);
});

test("canWithdraw: ライブ接続中・預金残高以内の金額のみ引き出せる", () => {
  assert.equal(canWithdraw(100, 200, true), true);
  assert.equal(canWithdraw(200, 200, true), true);
  assert.equal(canWithdraw(201, 200, true), false);
  assert.equal(canWithdraw(100, 200, false), false);
});
