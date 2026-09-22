import assert from "node:assert/strict";
import test from "node:test";
import { signInWithEmail, signUpWithEmail } from "../lib/auth.ts";

const authUser = {
  id: "00000000-0000-4000-8000-000000000024",
  created_at: "2026-09-22T00:00:00Z",
};

test("signUpWithEmailはAuth登録後に同じIDでusersへプロフィールを保存する", async () => {
  let signUpInput;
  let insertedProfile;
  const client = {
    auth: {
      async signUp(input) {
        signUpInput = input;
        return { data: { user: authUser }, error: null };
      },
    },
    from(table) {
      assert.equal(table, "users");
      return {
        async insert(profile) {
          insertedProfile = profile;
          return { error: null };
        },
      };
    },
  };

  const result = await signUpWithEmail(
    { email: " family@example.com ", name: " 山田 太郎 ", password: "password123", role: "parent" },
    client,
  );

  assert.deepEqual(signUpInput, { email: "family@example.com", password: "password123" });
  assert.deepEqual(insertedProfile, {
    balance: 0,
    id: authUser.id,
    name: "山田 太郎",
    role: "parent",
  });
  assert.equal(result.error, null);
  assert.equal(result.data.id, authUser.id);
});

test("signUpWithEmailはAuth登録失敗時にプロフィールを保存しない", async () => {
  let fromCalled = false;
  const client = {
    auth: {
      async signUp() {
        return { data: { user: null }, error: { code: "user_already_exists" } };
      },
    },
    from() {
      fromCalled = true;
    },
  };

  const result = await signUpWithEmail(
    { email: "family@example.com", name: "山田", password: "password123", role: "parent" },
    client,
  );

  assert.equal(result.error, "このメールアドレスは既に登録されています。");
  assert.equal(fromCalled, false);
});

test("signUpWithEmailはidentitiesが空の登録済みユーザーを重複として扱う", async () => {
  let fromCalled = false;
  const client = {
    auth: {
      async signUp() {
        return { data: { user: { ...authUser, identities: [] } }, error: null };
      },
    },
    from() {
      fromCalled = true;
    },
  };

  const result = await signUpWithEmail(
    { email: "family@example.com", name: "山田", password: "password123", role: "parent" },
    client,
  );

  assert.deepEqual(result, { data: null, error: "このメールアドレスは既に登録されています。" });
  assert.equal(fromCalled, false);
});

test("signInWithEmailは認証したIDのusersプロフィールを返す", async () => {
  const profile = {
    balance: 100,
    created_at: authUser.created_at,
    family_id: null,
    id: authUser.id,
    name: "山田 太郎",
    role: "parent",
  };
  const client = {
    auth: {
      async signInWithPassword(input) {
        assert.deepEqual(input, { email: "family@example.com", password: "password123" });
        return { data: { user: authUser }, error: null };
      },
    },
    from(table) {
      assert.equal(table, "users");
      return {
        select(columns) {
          assert.equal(columns, "id, family_id, name, role, balance, created_at");
          return {
            eq(column, id) {
              assert.equal(column, "id");
              assert.equal(id, authUser.id);
              return { single: async () => ({ data: profile, error: null }) };
            },
          };
        },
      };
    },
  };

  const result = await signInWithEmail(" family@example.com ", "password123", client);
  assert.deepEqual(result, { data: profile, error: null });
});

test("signInWithEmailは間違ったパスワードのエラーを日本語で返す", async () => {
  const client = {
    auth: {
      async signInWithPassword() {
        return { data: { user: null }, error: { code: "invalid_credentials" } };
      },
    },
    from() {
      throw new Error("プロフィール取得は呼ばれない");
    },
  };

  const result = await signInWithEmail("family@example.com", "wrong-password", client);
  assert.deepEqual(result, { data: null, error: "メールアドレスまたはパスワードが違います。" });
});
