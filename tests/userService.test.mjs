import assert from "node:assert/strict";
import test from "node:test";
import { fetchUserBalance } from "../lib/userService.ts";

function makeClient({ data, error }) {
  return {
    from(table) {
      assert.equal(table, "users");
      return {
        select(columns) {
          assert.equal(columns, "balance");
          return {
            eq(column, value) {
              assert.equal(column, "id");
              assert.equal(value, "user-1");
              return {
                async single() {
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

test("残高取得に成功したらbalanceを返す", async () => {
  const client = makeClient({ data: { balance: 1234 }, error: null });
  const balance = await fetchUserBalance("user-1", client);
  assert.equal(balance, 1234);
});

test("残高取得に失敗したらエラーを投げる", async () => {
  const client = makeClient({ data: null, error: new Error("boom") });
  await assert.rejects(() => fetchUserBalance("user-1", client), /boom/);
});
