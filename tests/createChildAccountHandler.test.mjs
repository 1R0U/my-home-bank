import assert from "node:assert/strict";
import test from "node:test";
import { handleCreateChildAccount } from "../supabase/functions/create-child-account/handler.ts";

function makeRequest({ method = "POST", authorization = "Bearer parent-jwt", body = { name: "たろう" } } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) headers.set("Authorization", authorization);
  return new Request("http://localhost/create-child-account", {
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    headers,
    method,
  });
}

function makeDeps(overrides = {}) {
  const calls = { createAuthUser: [], prepareChildAccount: [] };
  return {
    calls,
    deps: {
      async createAuthUser(email) {
        calls.createAuthUser.push(email);
        return "child-user-id";
      },
      async prepareChildAccount(authorization, name) {
        calls.prepareChildAccount.push({ authorization, name });
        return "child-abc@children.my-home-bank.invalid";
      },
      ...overrides,
    },
  };
}

test("親のJWTで予約し、返ったメールでAuthアカウントを作る", async () => {
  const { calls, deps } = makeDeps();
  const response = await handleCreateChildAccount(makeRequest(), deps);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId: "child-user-id" });
  assert.deepEqual(calls.prepareChildAccount, [{ authorization: "Bearer parent-jwt", name: "たろう" }]);
  assert.deepEqual(calls.createAuthUser, ["child-abc@children.my-home-bank.invalid"]);
});

test("DBが予約を拒否したら、Authアカウントを作らずに理由を返す", async () => {
  const { calls, deps } = makeDeps({
    async prepareChildAccount() {
      throw new Error("子供アカウントを追加できるのは親だけです");
    },
  });
  const response = await handleCreateChildAccount(makeRequest(), deps);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "子供アカウントを追加できるのは親だけです" });
  assert.equal(calls.createAuthUser.length, 0);
});

test("Authアカウントの作成に失敗したら500を返す", async () => {
  const { deps } = makeDeps({
    async createAuthUser() {
      throw new Error("Database error creating new user");
    },
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await handleCreateChildAccount(makeRequest(), deps);
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /作成できませんでした/);
  } finally {
    console.error = originalError;
  }
});

test("Authorizationがなければ、DBを呼ばずに401を返す", async () => {
  const { calls, deps } = makeDeps();
  const response = await handleCreateChildAccount(makeRequest({ authorization: null }), deps);

  assert.equal(response.status, 401);
  assert.equal(calls.prepareChildAccount.length, 0);
});

test("名前が文字列でなければ400を返す", async () => {
  for (const body of [{}, { name: 1 }, null]) {
    const { calls, deps } = makeDeps();
    const response = await handleCreateChildAccount(makeRequest({ body }), deps);
    assert.equal(response.status, 400);
    assert.equal(calls.prepareChildAccount.length, 0);
  }
});

test("本文がJSONでなければ400を返す", async () => {
  const { deps } = makeDeps();
  const response = await handleCreateChildAccount(makeRequest({ body: "not json" }), deps);
  assert.equal(response.status, 400);
});

test("OPTIONSにはCORSのヘッダーだけを返し、POST以外は405を返す", async () => {
  const { calls, deps } = makeDeps();
  const preflight = await handleCreateChildAccount(makeRequest({ method: "OPTIONS" }), deps);
  assert.equal(preflight.status, 200);
  assert.match(preflight.headers.get("Access-Control-Allow-Headers"), /authorization/);

  const get = await handleCreateChildAccount(makeRequest({ method: "GET" }), deps);
  assert.equal(get.status, 405);
  assert.equal(calls.prepareChildAccount.length, 0);
});
