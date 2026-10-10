import assert from "node:assert/strict";
import test from "node:test";
import { handleChildCodeLogin } from "../supabase/functions/child-code-login/handler.ts";

const claim = { childId: "child", email: "internal@children.my-home-bank.invalid", attemptId: "attempt" };
const session = { userId: "child", sessionId: "new-session", access_token: "access", refresh_token: "refresh" };
function fixture(overrides = {}) {
  const calls = [];
  const deps = {
    consumeCode: async (...args) => { calls.push(["consume", ...args]); return claim; },
    createSession: async (...args) => { calls.push(["session", ...args]); return session; },
    revokeOtherSessions: async (...args) => { calls.push(["revoke", ...args]); },
    finishLogin: async (...args) => { calls.push(["finish", ...args]); return true; },
    discardSession: async (...args) => { calls.push(["discard", ...args]); },
    ...overrides,
  };
  const request = (code = "abcdefgh") => new Request("https://example.test", {
    method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "192.0.2.1" },
    body: JSON.stringify({ code }),
  });
  return { deps, calls, request };
}
test("ログイン前に呼べて、コード消費→認証→旧端末失効→有効セッション切替の順で実行する", async () => {
  const { deps, calls, request } = fixture();
  const response = await handleChildCodeLogin(request(" abcdefgh "), deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { access_token: "access", refresh_token: "refresh", userId: "child" });
  assert.deepEqual(calls, [["consume", "ABCDEFGH", "192.0.2.1"], ["session", claim.email],
    ["revoke", "access"], ["finish", claim, "new-session"]]);
});
test("無効・期限切れ・使用済みは同じエラーで、Authを呼ばない", async () => {
  const { deps, calls, request } = fixture({ consumeCode: async () => "invalid_code" });
  const response = await handleChildCodeLogin(request(), deps);
  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
});
test("試行制限は429を返してAuthを呼ばない", async () => {
  const { deps, calls, request } = fixture({ consumeCode: async () => "rate_limited" });
  assert.equal((await handleChildCodeLogin(request(), deps)).status, 429);
  assert.deepEqual(calls, []);
});
test("形式不正・JSON不正はDBを呼ばない", async () => {
  for (const code of [null, {}, "", "ABCDEFG", "ABCDEFGH2", "ABCD01IO"]) {
    const { deps, calls, request } = fixture();
    assert.equal((await handleChildCodeLogin(request(code), deps)).status, 400);
    assert.deepEqual(calls, []);
  }
  const { deps, calls } = fixture();
  assert.equal((await handleChildCodeLogin(new Request("https://example.test", { method: "POST", body: "{" }), deps)).status, 400);
  assert.deepEqual(calls, []);
});
test("CORSの事前確認とPOST以外はAuthもDBも呼ばない", async () => {
  for (const [method, status] of [["OPTIONS", 200], ["GET", 405]]) {
    const { deps, calls } = fixture();
    assert.equal((await handleChildCodeLogin(new Request("https://example.test", { method }), deps)).status, status);
    assert.deepEqual(calls, []);
  }
});
test("Auth失敗でも予約を解除し、内部メールや例外を返さない", async () => {
  const { deps, calls, request } = fixture({ createSession: async () => { throw new Error(claim.email); } });
  const response = await handleChildCodeLogin(request(), deps);
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes(claim.email));
  assert.deepEqual(calls.at(-1), ["finish", claim, null]);
});
for (const scenario of ["別ユーザー", "失効失敗", "予約失効"]) {
  test(`${scenario}ではトークンを返さず、新セッションと予約を片付ける`, async () => {
    const overrides = scenario === "別ユーザー" ? { createSession: async () => ({ ...session, userId: "parent" }) }
      : scenario === "失効失敗" ? { revokeOtherSessions: async () => { throw new Error("failure"); } }
      : { finishLogin: async (_claim, id) => id === null };
    const { deps, calls, request } = fixture(overrides);
    const response = await handleChildCodeLogin(request(), deps);
    assert.equal(response.status, 500);
    assert.ok(!(await response.text()).includes("access"));
    assert.ok(calls.some(([name]) => name === "discard"));
  });
}
