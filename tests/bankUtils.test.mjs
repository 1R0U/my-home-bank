import assert from "node:assert/strict";
import test from "node:test";
import { canDeposit, canWithdraw, isValidBankOperationAmount, MAX_BANK_OPERATION_AMOUNT,
  parseAmountInput } from "../lib/bankUtils.ts";

test("銀行操作の金額は、DB上限以内の正の安全な整数だけを受け付ける", () => {
  assert.equal(MAX_BANK_OPERATION_AMOUNT, 2147483647);
  for (const amount of [1, MAX_BANK_OPERATION_AMOUNT]) {
    assert.equal(isValidBankOperationAmount(amount), true);
  }
  for (const amount of [null, 0, -1, 1.5, NaN, Infinity, MAX_BANK_OPERATION_AMOUNT + 1, Number.MAX_SAFE_INTEGER]) {
    assert.equal(isValidBankOperationAmount(amount), false);
  }
});

for (const [name, canOperate] of [["canDeposit", canDeposit], ["canWithdraw", canWithdraw]]) {
  test(`${name}: 残高が十分でもDB上限を超える金額は拒否し、上限ちょうどは許可する`, () => {
    const balance = MAX_BANK_OPERATION_AMOUNT + 100;
    assert.equal(canOperate(MAX_BANK_OPERATION_AMOUNT, balance, true), true);
    assert.equal(canOperate(MAX_BANK_OPERATION_AMOUNT + 1, balance, true), false);
    assert.equal(canOperate(1.5, balance, true), false);
  });
}

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
