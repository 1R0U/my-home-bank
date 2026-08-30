import assert from "node:assert/strict";
import test from "node:test";
import {
  canPurchaseItem,
  hasInsufficientBalance,
  isOutOfStock,
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
