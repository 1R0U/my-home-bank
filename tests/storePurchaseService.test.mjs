import assert from "node:assert/strict";
import test from "node:test";
import { purchaseStoreItem } from "../lib/storePurchaseService.ts";

test("purchaseStoreItemは価格を送らず商品IDと冪等キーでRPCを呼ぶ", async () => {
  let called;
  const client = {
    async rpc(name, args) {
      called = { name, args };
      return { data: "transaction-1", error: null };
    },
  };

  const result = await purchaseStoreItem("user-1", "item-1", " purchase-1 ", client);

  assert.equal(result, "transaction-1");
  assert.deepEqual(called, {
    name: "purchase_store_item",
    args: {
      p_user_id: "user-1",
      p_store_item_id: "item-1",
      p_idempotency_key: "purchase-1",
    },
  });
  assert.equal("p_amount" in called.args, false);
});

test("purchaseStoreItemはRPCエラーをそのまま返す", async () => {
  const client = {
    async rpc() {
      return { data: null, error: new Error("Wallet残高が不足しています") };
    },
  };

  await assert.rejects(
    () => purchaseStoreItem("user-1", "item-1", "purchase-2", client),
    /Wallet残高が不足しています/,
  );
});

test("purchaseStoreItemは空または長すぎる冪等キーをRPC前に拒否する", async () => {
  let callCount = 0;
  const client = {
    async rpc() {
      callCount += 1;
      return { data: null, error: null };
    },
  };

  await assert.rejects(() => purchaseStoreItem("user-1", "item-1", "   ", client), /idempotencyKey/);
  await assert.rejects(
    () => purchaseStoreItem("user-1", "item-1", "x".repeat(201), client),
    /idempotencyKey/,
  );
  assert.equal(callCount, 0);
});
