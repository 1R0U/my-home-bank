import assert from "node:assert/strict";
import test from "node:test";
import {
  canPurchaseItem,
  hasInsufficientBalance,
  isOutOfStock,
  parseStorePriceInput,
  resolvePurchaseErrorMessage,
} from "../lib/storeUtils.ts";

test("在庫が0以下なら在庫切れと判定する", () => {
  assert.equal(isOutOfStock({ stock: 0 }), true);
  assert.equal(isOutOfStock({ stock: -1 }), true);
  assert.equal(isOutOfStock({ stock: 1 }), false);
});

test("残高が価格未満なら残高不足と判定する", () => {
  assert.equal(hasInsufficientBalance({ price: 100 }, 50), true);
  assert.equal(hasInsufficientBalance({ price: 100 }, 100), false);
  assert.equal(hasInsufficientBalance({ price: 100 }, 150), false);
});

test("ライブ接続中・在庫あり・残高十分な場合のみ購入できる", () => {
  const item = { stock: 5, price: 100 };
  assert.equal(canPurchaseItem(item, 100, true), true);
  assert.equal(canPurchaseItem(item, 99, true), false);
  assert.equal(canPurchaseItem(item, 100, false), false);
});

test("在庫切れの場合は残高が足りていても購入できない", () => {
  const item = { stock: 0, price: 100 };
  assert.equal(canPurchaseItem(item, 999, true), false);
});

test("ignoreInsufficientBalanceがtrueの場合、残高不足でも購入できる（在庫切れは変わらず不可）", () => {
  const item = { stock: 5, price: 100 };
  assert.equal(canPurchaseItem(item, 10, true, { ignoreInsufficientBalance: true }), true);
  assert.equal(canPurchaseItem(item, 10, true, { ignoreInsufficientBalance: false }), false);
  assert.equal(canPurchaseItem(item, 10, true), false);

  const outOfStockItem = { stock: 0, price: 100 };
  assert.equal(
    canPurchaseItem(outOfStockItem, 999, true, { ignoreInsufficientBalance: true }),
    false,
  );
});

test("resolvePurchaseErrorMessage はDBの在庫切れエラーを日本語にする", () => {
  const error = new Error("store item out of stock: 11111111-1111-1111-1111-111111111111");
  assert.equal(resolvePurchaseErrorMessage(error), "在庫がありません");
});

test("resolvePurchaseErrorMessage はDBの残高不足エラーを日本語にする", () => {
  const error = new Error("insufficient balance for user abc (has 10, needs 100)");
  assert.equal(resolvePurchaseErrorMessage(error), "所持ポイントが足りません");
});

test("resolvePurchaseErrorMessage は原因不明のエラーを汎用メッセージにする", () => {
  assert.equal(resolvePurchaseErrorMessage(new Error("network error")), "購入に失敗しました");
  assert.equal(resolvePurchaseErrorMessage(undefined), "購入に失敗しました");
});

test("resolvePurchaseErrorMessage はクライアント側フラグからも判定できる", () => {
  assert.equal(resolvePurchaseErrorMessage(new Error("x"), { outOfStock: true }), "在庫がありません");
  assert.equal(
    resolvePurchaseErrorMessage(new Error("x"), { insufficientBalance: true }),
    "所持ポイントが足りません",
  );
});

test("parseStorePriceInputは1以上の整数のみを受け付ける", () => {
  assert.equal(parseStorePriceInput("100"), 100);
  assert.equal(parseStorePriceInput("1"), 1);
  assert.equal(parseStorePriceInput("  50  "), 50);
});

test("parseStorePriceInputは0円を拒否する", () => {
  assert.equal(parseStorePriceInput("0"), null);
  assert.equal(parseStorePriceInput("00"), null);
});

test("parseStorePriceInputは小数を拒否する", () => {
  assert.equal(parseStorePriceInput("10.5"), null);
  assert.equal(parseStorePriceInput("0.5"), null);
});

test("parseStorePriceInputは指数表記を拒否する", () => {
  assert.equal(parseStorePriceInput("1e3"), null);
  assert.equal(parseStorePriceInput("1E3"), null);
});

test("parseStorePriceInputは負数・空文字・数字以外を拒否する", () => {
  assert.equal(parseStorePriceInput("-1"), null);
  assert.equal(parseStorePriceInput(""), null);
  assert.equal(parseStorePriceInput("   "), null);
  assert.equal(parseStorePriceInput("abc"), null);
  assert.equal(parseStorePriceInput("100円"), null);
  assert.equal(parseStorePriceInput("1 00"), null);
});
