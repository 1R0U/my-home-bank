import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_FAMILY_SUPPLY,
  restoreAuthSession,
  signInWithEmail,
  signOutCurrentUser,
  signUpWithEmail,
} from "../lib/auth.ts";

const userId = "00000000-0000-4000-8000-000000000024";
const familyId = "10000000-0000-4000-8000-000000000024";
const authUser = { id: userId, created_at: "2026-09-22T00:00:00Z" };
const profile = {
  balance: 0,
  created_at: authUser.created_at,
  family_id: familyId,
  id: userId,
  name: "山田 太郎",
  role: "parent",
};

function createClient({ auth = {}, profiles = [profile], rpcError = null } = {}) {
  let profileIndex = 0;
  const rpcCalls = [];
  const client = {
    auth,
    from(table) {
      assert.equal(table, "users");
      return {
        select(columns) {
          assert.equal(columns, "id, family_id, name, role, balance, created_at");
          return {
            eq(column, id) {
              assert.equal(column, "id");
              assert.equal(id, userId);
              return {
                single: async () => {
                  const response = profiles[Math.min(profileIndex, profiles.length - 1)];
                  profileIndex += 1;
                  return response?.error
                    ? { data: null, error: response.error }
                    : { data: response, error: null };
                },
              };
            },
          };
        },
      };
    },
    async rpc(name, args) {
      rpcCalls.push({ args, name });
      return rpcError ? { data: null, error: rpcError } : { data: familyId, error: null };
    },
  };
  return { client, rpcCalls };
}

test("signUpWithEmailは親プロフィール用メタデータを付けてAuthへ登録する", async () => {
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
    { email: " family@example.com ", name: " 山田 太郎 ", password: "password123" },
    client,
  );

  assert.deepEqual(signUpInput, {
    email: "family@example.com",
    options: { data: { name: "山田 太郎", role: "parent" } },
    password: "password123",
  });
  assert.equal(fromCalled, false);
  assert.deepEqual(result, {
    data: { emailConfirmationRequired: true, user: null },
    error: null,
  });
});

test("即時セッションがある登録はDBプロフィールを取得して家族を初期化する", async () => {
  const { client, rpcCalls } = createClient({
    auth: {
      async signUp() {
        return { data: { session: { access_token: "token" }, user: authUser }, error: null };
      },
    },
    profiles: [{ ...profile, family_id: null }, profile],
  });

  const result = await signUpWithEmail(
    { email: "family@example.com", name: "山田 太郎", password: "password123" },
    client,
  );

  assert.deepEqual(result, {
    data: { emailConfirmationRequired: false, user: profile },
    error: null,
  });
  assert.deepEqual(rpcCalls, [
    {
      args: {
        p_family_name: "山田 太郎の家族",
        p_idempotency_key: `auth-registration:${userId}`,
        p_initial_supply: INITIAL_FAMILY_SUPPLY,
      },
      name: "create_family_with_treasury",
    },
  ]);
});

test("signUpWithEmailは登録済みメールでも登録有無を明かさない", async () => {
  const client = {
    auth: {
      async signUp() {
        return { data: { user: null }, error: { code: "user_already_exists" } };
      },
    },
    from() {
      throw new Error("プロフィール取得は呼ばれない");
    },
  };

  const result = await signUpWithEmail(
    { email: "family@example.com", name: "山田", password: "password123" },
    client,
  );
  assert.deepEqual(result, {
    data: { emailConfirmationRequired: true, user: null },
    error: null,
  });
});

test("signInWithEmailはDBの家族設定済みプロフィールを返す", async () => {
  const { client, rpcCalls } = createClient({
    auth: {
      async signInWithPassword(input) {
        assert.deepEqual(input, { email: "family@example.com", password: "password123" });
        return { data: { user: authUser }, error: null };
      },
    },
  });

  const result = await signInWithEmail(" family@example.com ", "password123", client);
  assert.deepEqual(result, { data: profile, error: null });
  assert.deepEqual(rpcCalls, []);
});

test("初回ログイン時に家族未設定なら家族を初期化して再取得する", async () => {
  const { client, rpcCalls } = createClient({
    auth: {
      async signInWithPassword() {
        return { data: { user: authUser }, error: null };
      },
    },
    profiles: [{ ...profile, family_id: null }, profile],
  });

  const result = await signInWithEmail("family@example.com", "password123", client);
  assert.deepEqual(result, { data: profile, error: null });
  assert.equal(rpcCalls.length, 1);
});

test("signInWithEmailは誤った認証情報を日本語エラーで返す", async () => {
  const client = {
    auth: {
      async signInWithPassword() {
        return { data: { user: null }, error: { code: "invalid_credentials" } };
      },
    },
  };

  const result = await signInWithEmail("family@example.com", "wrong-password", client);
  assert.deepEqual(result, {
    data: null,
    error: "メールアドレスまたはパスワードが違います。",
  });
});

test("プロフィール取得失敗時はローカルセッションを破棄する", async () => {
  let signOutInput;
  const { client } = createClient({
    auth: {
      async signInWithPassword() {
        return { data: { user: authUser }, error: null };
      },
      async signOut(input) {
        signOutInput = input;
        return { error: null };
      },
    },
    profiles: [{ error: new Error("not found") }],
  });

  const result = await signInWithEmail("family@example.com", "password123", client);
  assert.deepEqual(signOutInput, { scope: "local" });
  assert.deepEqual(result, { data: null, error: "ユーザー情報の取得に失敗しました。" });
});

test("保存済みセッションがなければ未ログインとして復元する", async () => {
  const { client } = createClient({
    auth: {
      async getSession() {
        return { data: { session: null }, error: null };
      },
    },
  });
  assert.deepEqual(await restoreAuthSession(client), { error: null, user: null });
});

test("保存済みセッションからDBプロフィールを復元する", async () => {
  const { client } = createClient({
    auth: {
      async getSession() {
        return { data: { session: { user: authUser } }, error: null };
      },
    },
  });
  assert.deepEqual(await restoreAuthSession(client), { error: null, user: profile });
});

test("signOutCurrentUserはSupabaseセッションを破棄する", async () => {
  let called = false;
  const client = {
    auth: {
      async signOut() {
        called = true;
        return { error: null };
      },
    },
  };
  assert.equal(await signOutCurrentUser(client), null);
  assert.equal(called, true);
});

test("signOutCurrentUserは失敗を日本語エラーで返す", async () => {
  const client = {
    auth: {
      async signOut() {
        return { error: new Error("network") };
      },
    },
  };
  assert.equal(
    await signOutCurrentUser(client),
    "ログアウトに失敗しました。時間をおいて再度お試しください。",
  );
});
