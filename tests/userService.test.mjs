import assert from "node:assert/strict";
import test from "node:test";
import { createUserProfile, ensureDbUser, fetchUserBalance } from "../lib/userService.ts";

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

const mockParent = { id: "user-parent-1", name: "お父さん", role: "parent", balance: 500 };
const dbParent = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "お父さん",
  role: "parent",
  balance: 0,
};

test("ensureDbUserは作成した親のIDを保存し、次のセッションで同じ行を再利用する", async () => {
  const values = new Map();
  const storage = {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
  };
  let insertCount = 0;
  let lookupCount = 0;
  const client = {
    from(table) {
      assert.equal(table, "users");
      return {
        insert(payload) {
          insertCount++;
          assert.deepEqual(payload, { name: "お父さん", role: "parent", balance: 0 });
          return { select: () => ({ single: async () => ({ data: dbParent, error: null }) }) };
        },
        select(columns) {
          assert.equal(columns, "*");
          return {
            eq(column, id) {
              lookupCount++;
              assert.equal(column, "id");
              assert.equal(id, dbParent.id);
              return { maybeSingle: async () => ({ data: dbParent, error: null }) };
            },
          };
        },
      };
    },
  };

  assert.deepEqual(await ensureDbUser(mockParent, client, storage), dbParent);
  assert.deepEqual(await ensureDbUser(mockParent, client, storage), dbParent);
  assert.equal(insertCount, 1);
  assert.equal(lookupCount, 1);
  assert.equal(values.get("my-home-bank:db-user:user-parent-1"), dbParent.id);
});

test("ensureDbUserはすでにDBのUUIDを持つユーザーを変更しない", async () => {
  assert.equal(await ensureDbUser(dbParent), dbParent);
});

test("ensureDbUserは保存された親行が消えていたら作り直す", async () => {
  const storage = {
    async getItem() { return dbParent.id; },
    async setItem(_key, value) { assert.equal(value, dbParent.id); },
  };
  let inserted = false;
  const client = {
    from() {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: () => ({ select: () => ({ single: async () => {
          inserted = true;
          return { data: dbParent, error: null };
        } }) }),
      };
    },
  };

  assert.deepEqual(await ensureDbUser(mockParent, client, storage), dbParent);
  assert.equal(inserted, true);
});
