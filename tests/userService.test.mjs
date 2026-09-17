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
  id: "00000000-0000-4000-8000-000000000001",
  name: "ゲスト（大人）",
  role: "parent",
  balance: 1000,
};

test("ensureDbUserはモックの親を固定UUIDのゲストユーザーへ解決する", async () => {
  const client = {
    from(table) {
      assert.equal(table, "users");
      return {
        select(columns) {
          assert.equal(columns, "*");
          return {
            eq(column, id) {
              assert.equal(column, "id");
              assert.equal(id, dbParent.id);
              return { maybeSingle: async () => ({ data: dbParent, error: null }) };
            },
          };
        },
      };
    },
  };

  assert.deepEqual(await ensureDbUser(mockParent, client), dbParent);
});

test("ensureDbUserはすでにDBのUUIDを持つユーザーを変更しない", async () => {
  assert.equal(await ensureDbUser(dbParent), dbParent);
});

test("ensureDbUserは同時に呼ばれてもusers行を追加しない", async () => {
  let selectCount = 0;
  const client = {
    from(table) {
      assert.equal(table, "users");
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => {
          selectCount++;
          return { data: dbParent, error: null };
        } }) }),
      };
    },
  };

  const results = await Promise.all([
    ensureDbUser(mockParent, client),
    ensureDbUser(mockParent, client),
  ]);

  assert.deepEqual(results, [dbParent, dbParent]);
  assert.equal(selectCount, 2);
});

test("ensureDbUserは固定ゲスト行が存在しなければエラーにする", async () => {
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  };

  await assert.rejects(() => ensureDbUser(mockParent, client), /ゲストユーザーがDBに存在しません/);
});
