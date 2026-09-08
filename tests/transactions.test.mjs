import assert from "node:assert/strict";
import test from "node:test";
import { fetchTransactions } from "../lib/transactions.ts";

function makeClient({ data, error }) {
  return {
    from(table) {
      assert.equal(table, "transactions");
      return {
        select(columns) {
          assert.equal(columns, "id, user_id, type, description, amount, created_at");
          return {
            eq(column, value) {
              assert.equal(column, "user_id");
              assert.equal(value, "user-1");
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
    },
  };
}

test("取得に成功したら取引一覧を返す", async () => {
  const transactions = [{ id: "t1", user_id: "user-1", type: "quest_reward" }];
  const client = makeClient({ data: transactions, error: null });

  const result = await fetchTransactions("user-1", client);

  assert.deepEqual(result, transactions);
});

test("dataがnullの場合は空配列を返す", async () => {
  const client = makeClient({ data: null, error: null });

  const result = await fetchTransactions("user-1", client);

  assert.deepEqual(result, []);
});

test("取得に失敗したら日本語メッセージのエラーを投げる", async () => {
  const client = makeClient({ data: null, error: new Error("db error") });

  await assert.rejects(
    () => fetchTransactions("user-1", client),
    /取引履歴の取得に失敗しました。時間をおいて再度お試しください。/,
  );
});
