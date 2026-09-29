import assert from "node:assert/strict";
import test from "node:test";
import { fetchFamilyUsers, fetchStoreCatalog, purchaseStoreItem } from "../lib/storeService.ts";

test("purchaseStoreItemは正しい関数名・引数でRPCを呼び出す", async () => {
  let called;
  const client = {
    async rpc(fn, args) {
      called = { fn, args };
      return { data: null, error: null };
    },
  };

  await purchaseStoreItem("item-1", "user-1", " purchase-1 ", client);

  assert.deepEqual(called, {
    fn: "purchase_store_item",
    args: {
      p_idempotency_key: "purchase-1",
      p_store_item_id: "item-1",
      p_user_id: "user-1",
    },
  });
});

test("purchaseStoreItemはRPCのエラーをそのまま投げる", async () => {
  const client = {
    async rpc() {
      return { data: null, error: new Error("out of stock") };
    },
  };

  await assert.rejects(
    () => purchaseStoreItem("item-1", "user-1", "purchase-2", client),
    /out of stock/,
  );
});

test("purchaseStoreItemは空の冪等キーをRPC前に拒否する", async () => {
  await assert.rejects(
    () => purchaseStoreItem("item-1", "user-1", "   ", { rpc: () => Promise.reject() }),
    /idempotencyKey/,
  );
});

function makeCatalogClient({ data, error }) {
  return { async rpc(name) { assert.equal(name, "get_current_store_catalog"); return { data, error }; } };
}

test("fetchStoreCatalogはDB計算済みの物価指数と販売価格を数値で返す", async () => {
  const item = {
    id: "item-1", title: "テスト商品", price: "120", stock: "2",
    base_price: "120", price_index: 105, sale_price: "130",
  };
  const client = makeCatalogClient({ data: { price_index: 105, items: [item] }, error: null });

  const result = await fetchStoreCatalog(client);

  assert.equal(result.priceIndex, 105);
  assert.deepEqual(result.items[0], {
    ...item, price: 120, stock: 2, base_price: 120, price_index: 105, sale_price: 130,
  });
});

test("fetchStoreCatalogは商品0件でも物価指数を返す", async () => {
  const client = makeCatalogClient({ data: { price_index: 95, items: [] }, error: null });

  const result = await fetchStoreCatalog(client);

  assert.deepEqual(result, { priceIndex: 95, items: [] });
});

test("fetchStoreCatalogは取得失敗と不正な価格を拒否する", async () => {
  const failed = makeCatalogClient({ data: null, error: new Error("db error") });
  await assert.rejects(() => fetchStoreCatalog(failed), /db error/);

  const invalid = makeCatalogClient({
    data: { price_index: 105, items: [{ price: 100, stock: 1, base_price: 100, price_index: 95, sale_price: 100 }] },
    error: null,
  });
  await assert.rejects(() => fetchStoreCatalog(invalid), /商品価格が不正/);
});

test("fetchFamilyUsersはログイン中の家庭IDで絞り込む", async () => {
  const users = [{ id: "user-1", name: "親" }];
  const client = {
    from(table) {
      assert.equal(table, "users");
      return {
        select(columns) {
          assert.equal(columns, "id, name");
          return {
            async eq(column, value) {
              assert.equal(column, "family_id");
              assert.equal(value, "family-1");
              return { data: users, error: null };
            },
          };
        },
      };
    },
  };

  assert.deepEqual(await fetchFamilyUsers("family-1", client), users);
});
