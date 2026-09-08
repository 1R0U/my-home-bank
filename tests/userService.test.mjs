import assert from "node:assert/strict";
import test from "node:test";
import { createUserProfile, fetchUserBalance } from "../lib/userService.ts";

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

function makeCreateClient({ data, error }) {
  return {
    from(table) {
      assert.equal(table, "users");
      return {
        insert(payload) {
          assert.deepEqual(payload, { name: "たろう", role: "child", balance: 0 });
          return {
            select(columns) {
              assert.equal(columns, "*");
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

test("createUserProfileは成功したら作成されたユーザーを返す", async () => {
  const created = { id: "real-uuid", name: "たろう", role: "child", balance: 0, created_at: "2026-01-01T00:00:00Z" };
  const client = makeCreateClient({ data: created, error: null });

  const result = await createUserProfile({ name: "たろう", role: "child" }, client);

  assert.deepEqual(result, created);
});

test("createUserProfileは失敗したらエラーを投げる", async () => {
  const client = makeCreateClient({ data: null, error: new Error("insert failed") });
  await assert.rejects(
    () => createUserProfile({ name: "たろう", role: "child" }, client),
    /insert failed/,
  );
});
