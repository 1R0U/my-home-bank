import assert from "node:assert/strict";
import test from "node:test";
import { fetchFamilyUsers, fetchStoreItems, purchaseStoreItem } from "../lib/storeService.ts";

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

function makeItemsClient({ data, error }) {
  return {
    from(table) {
      assert.equal(table, "store_items");
      return {
        select(columns) {
          assert.equal(columns, "*");
          return {
            eq(column, value) {
              assert.equal(column, "family_id");
              assert.equal(value, "family-1");
              return {
                async order(orderColumn, options) {
                  assert.equal(orderColumn, "created_at");
                  assert.deepEqual(options, { ascending: false });
                  return { data, error };
                },
              };
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

  const result = await fetchStoreItems("family-1", client);

  assert.deepEqual(result, items);
});

test("fetchStoreItemsはdataがnullの場合は空配列を返す", async () => {
  const client = makeItemsClient({ data: null, error: null });

  const result = await fetchStoreItems("family-1", client);

  assert.deepEqual(result, []);
});

test("fetchStoreItemsは取得に失敗したらエラーを投げる", async () => {
  const client = makeItemsClient({ data: null, error: new Error("db error") });

  await assert.rejects(() => fetchStoreItems("family-1", client), /db error/);
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
