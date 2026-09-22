import assert from "node:assert/strict";
import test from "node:test";
import { signInWithEmail, signUpWithEmail } from "../lib/auth.ts";

const authUser = {
  id: "00000000-0000-4000-8000-000000000024",
  created_at: "2026-09-22T00:00:00Z",
};

test("signUpWithEmailはusersプロフィール用のメタデータを付けてAuthへ登録する", async () => {
  let signUpInput;
  let fromCalled = false;
  const client = {
    auth: {
      async signUp(input) {
        signUpInput = input;
        return { data: { session: null, user: authUser }, error: null };
      },
    },
    from() {
      fromCalled = true;
    },
  };

  const result = await signUpWithEmail(
    { email: " family@example.com ", name: " 山田 太郎 ", password: "password123", role: "parent" },
    client,
  );

  assert.deepEqual(signUpInput, {
    email: "family@example.com",
    options: {
      data: { name: "山田 太郎", role: "parent" },
    },
    password: "password123",
  });
  assert.equal(fromCalled, false);
  assert.equal(result.error, null);
  assert.equal(result.data.emailConfirmationRequired, true);
  assert.equal(result.data.user, null);
});

test("signUpWithEmailは即時セッションがあればプロフィールを返す", async () => {
  const client = {
    auth: {
      async signUp() {
        return { data: { session: { access_token: "token" }, user: authUser }, error: null };
      },
    },
  };

  const result = await signUpWithEmail(
    { email: "family@example.com", name: " 山田 太郎 ", password: "password123", role: "parent" },
    client,
  );

  assert.equal(result.error, null);
  assert.equal(result.data.emailConfirmationRequired, false);
  assert.deepEqual(result.data.user, {
    balance: 0,
    created_at: authUser.created_at,
    family_id: null,
    id: authUser.id,
    name: "山田 太郎",
    role: "parent",
  });
});

test("signUpWithEmailは登録済みメールでも登録有無を明かさない", async () => {
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

  assert.deepEqual(result, {
    data: { emailConfirmationRequired: true, user: null },
    error: null,
  });
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

test("signInWithEmailはプロフィール取得失敗時にローカルセッションを破棄する", async () => {
  let signOutInput;
  const client = {
    auth: {
      async signInWithPassword() {
        return { data: { user: authUser }, error: null };
      },
      async signOut(input) {
        signOutInput = input;
        return { error: null };
      },
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return { single: async () => ({ data: null, error: new Error("not found") }) };
            },
          };
        },
      };
    },
  };

  const result = await signInWithEmail("family@example.com", "password123", client);

  assert.deepEqual(signOutInput, { scope: "local" });
  assert.deepEqual(result, { data: null, error: "ユーザー情報の取得に失敗しました。" });
});
