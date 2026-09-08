import assert from "node:assert/strict";
import test from "node:test";
import { fetchStoreItems, purchaseStoreItem } from "../lib/storeService.ts";

test("purchaseStoreItemは正しい関数名・引数でRPCを呼び出す", async () => {
  let called;
  const client = {
    async rpc(fn, args) {
      called = { fn, args };
      return { data: null, error: null };
    },
  };

  await purchaseStoreItem("item-1", "user-1", client);

  assert.deepEqual(called, {
    fn: "purchase_store_item",
    args: { p_item_id: "item-1", p_user_id: "user-1" },
  });
});

test("purchaseStoreItemはRPCのエラーをそのまま投げる", async () => {
  const client = {
    async rpc() {
      return { data: null, error: new Error("out of stock") };
    },
  };

  await assert.rejects(() => purchaseStoreItem("item-1", "user-1", client), /out of stock/);
});

function makeItemsClient({ data, error }) {
  return {
    from(table) {
      assert.equal(table, "store_items");
      return {
        select(columns) {
          assert.equal(columns, "*");
          return {
            async order(column, options) {
              assert.equal(column, "created_at");
              assert.deepEqual(options, { ascending: false });
              return { data, error };
            },
          };
        },
      };
    },
  };
}

test("fetchStoreItemsは取得に成功したらアイテム一覧を返す", async () => {
  const items = [{ id: "item-1", title: "テスト商品" }];
  const client = makeItemsClient({ data: items, error: null });

  const result = await fetchStoreItems(client);

  assert.deepEqual(result, items);
});

test("fetchStoreItemsはdataがnullの場合は空配列を返す", async () => {
  const client = makeItemsClient({ data: null, error: null });

  const result = await fetchStoreItems(client);

  assert.deepEqual(result, []);
});

test("fetchStoreItemsは取得に失敗したらエラーを投げる", async () => {
  const client = makeItemsClient({ data: null, error: new Error("db error") });

  await assert.rejects(() => fetchStoreItems(client), /db error/);
});
