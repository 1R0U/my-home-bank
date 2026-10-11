import assert from "node:assert/strict";
import test from "node:test";
import { isChildLoginCode, normalizeChildLoginCode, issueChildLoginCode, signInWithChildCode, isChildSessionRevoked } from "../lib/childLoginService.ts";
const child = { id: "child", role: "child", family_id: "family" };
function fixture(overrides = {}) {
  const calls = [];
  const client = {
    functions: { invoke: async (...args) => { calls.push(["invoke", ...args]); return { data: { userId: "child", access_token: "access", refresh_token: "refresh" }, error: null }; } },
    auth: {
      setSession: async (...args) => { calls.push(["session", ...args]); return { data: { user: { id: "child" } }, error: null }; },
      signOut: async (...args) => { calls.push(["signout", ...args]); return { error: null }; },
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: child, error: null }) }) }) }),
    ...overrides,
  };
  return { client, calls };
}
test("8文字の見分けやすい英数字を受け付け、小文字と前後空白を正規化する", () => {
  assert.equal(normalizeChildLoginCode(" abcdefgh "), "ABCDEFGH");
  assert.equal(isChildLoginCode("abcdefgh"), true);
  for (const code of ["", "ABCDEFG", "ABCDEFGH2", "ABCD01IO"]) assert.equal(isChildLoginCode(code), false);
});
test("発行は対象IDのみ渡し、期限付きコードを返す", async () => {
  const value = { code: "ABCDEFGH", expiresAt: "2026-10-10T10:00:00Z" };
  const client = { rpc: async (name, body) => {
    assert.equal(name, "issue_child_login_code"); assert.deepEqual(body, { p_child_id: "child" });
    return { data: value, error: null };
  } };
  assert.deepEqual(await issueChildLoginCode("child", client), value);
  await assert.rejects(issueChildLoginCode("child", { rpc: async () => ({ error: { message: "親だけです" } }) }), /親だけです/);
});
test("認証成功時は子供のセッションを保存し、同じアカウントのプロフィールを返す", async () => {
  const { client, calls } = fixture();
  assert.deepEqual(await signInWithChildCode("abcdefgh", client), child);
  assert.deepEqual(calls, [["invoke", "child-code-login", { body: { code: "ABCDEFGH" } }],
    ["session", { access_token: "access", refresh_token: "refresh" }]]);
});
test("コード不正ならAPIを呼ばない", async () => {
  const { client, calls } = fixture();
  await assert.rejects(signInWithChildCode("abc", client), /8文字/);
  assert.deepEqual(calls, []);
});
test("期限切れや429の理由を表示し、セッションを設定しない", async () => {
  const { client, calls } = fixture({ functions: { invoke: async () => ({ error: { context: new Response(JSON.stringify({ error: "1分待ってください" })) } }) } });
  await assert.rejects(signInWithChildCode("ABCDEFGH", client), /1分待ってください/);
  assert.deepEqual(calls, []);
});
test("JSONでないエラー・壊れた成功応答ではセッションを保存しない", async () => {
  for (const result of [{ error: { context: new Response("bad gateway") } }, { data: { userId: "child" }, error: null }]) {
    const { client, calls } = fixture({ functions: { invoke: async () => result } });
    await assert.rejects(signInWithChildCode("ABCDEFGH", client), /ログインできませんでした/);
    assert.deepEqual(calls, []);
  }
});
test("別アカウントのセッションは破棄する", async () => {
  const { client, calls } = fixture();
  client.auth.setSession = async () => ({ data: { user: { id: "other" } }, error: null });
  await assert.rejects(signInWithChildCode("ABCDEFGH", client));
  assert.deepEqual(calls.at(-1), ["signout", { scope: "local" }]);
});
test("子供以外のプロフィール・取得失敗はセッションを破棄する", async () => {
  for (const result of [{ data: { ...child, role: "parent" }, error: null }, { data: null, error: { code: "network" } }]) {
    const { client, calls } = fixture({ from: () => ({ select: () => ({ eq: () => ({ single: async () => result }) }) }) });
    await assert.rejects(signInWithChildCode("ABCDEFGH", client));
    assert.deepEqual(calls.at(-1), ["signout", { scope: "local" }]);
  }
});
test("明示的失効だけを返し、通信断では失効にしない", async () => {
  for (const [result, expected] of [[{ data: false, error: null }, true], [{ data: null, error: { code: "PT401" } }, true],
    [{ data: true, error: null }, false], [{ data: null, error: { code: "network" } }, false]]) {
    assert.equal(await isChildSessionRevoked({ rpc: async () => result }), expected);
  }
});
