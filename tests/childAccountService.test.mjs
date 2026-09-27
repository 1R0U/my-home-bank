import assert from "node:assert/strict";
import test from "node:test";
import {
  createChildAccount,
  fetchFamilyChildren,
  getChildNameDraftState,
} from "../lib/childAccountService.ts";

test("名前の前後の空白を除き、空なら追加できない", () => {
  assert.deepEqual(getChildNameDraftState("  たろう "), { canSubmit: true, error: null, trimmed: "たろう" });
  assert.deepEqual(getChildNameDraftState("   "), { canSubmit: false, error: null, trimmed: "" });
});

test("50文字を超える名前はエラーにする", () => {
  assert.equal(getChildNameDraftState("あ".repeat(50)).canSubmit, true);
  const state = getChildNameDraftState("あ".repeat(51));
  assert.equal(state.canSubmit, false);
  assert.match(state.error, /50文字以内/);
});

function makeFunctionsClient(result) {
  const calls = [];
  return {
    calls,
    client: {
      functions: {
        async invoke(name, options) {
          calls.push({ name, options });
          return result;
        },
      },
    },
  };
}

test("空白を除いた名前でEdge Functionを呼び、作った子供のIDを返す", async () => {
  const { calls, client } = makeFunctionsClient({ data: { userId: "child-1" }, error: null });
  const userId = await createChildAccount("  たろう  ", client);

  assert.equal(userId, "child-1");
  assert.deepEqual(calls, [{ name: "create-child-account", options: { body: { name: "たろう" } } }]);
});

test("空の名前ではEdge Functionを呼ばない", async () => {
  const { calls, client } = makeFunctionsClient({ data: null, error: null });
  await assert.rejects(() => createChildAccount("  ", client), /名前を入力してください/);
  assert.equal(calls.length, 0);
});

test("Edge Functionが返した理由をそのままエラーにする", async () => {
  const context = new Response(JSON.stringify({ error: "子供アカウントを追加できるのは親だけです" }), { status: 400 });
  const { client } = makeFunctionsClient({ data: null, error: Object.assign(new Error("non-2xx"), { context }) });
  await assert.rejects(() => createChildAccount("たろう", client), /追加できるのは親だけです/);
});

test("理由が読めないエラーは既定の文言にする", async () => {
  const { client } = makeFunctionsClient({ data: null, error: new Error("Failed to send a request") });
  await assert.rejects(() => createChildAccount("たろう", client), /子供アカウントを追加できませんでした/);
});

test("家族の子供を追加した順に取得する", async () => {
  const calls = [];
  const query = {
    select(columns) {
      calls.push(["select", columns]);
      return query;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return query;
    },
    async order(column, options) {
      calls.push(["order", column, options]);
      return { data: [{ id: "c1", name: "たろう" }], error: null };
    },
  };
  const client = {
    from(table) {
      assert.equal(table, "users");
      return query;
    },
  };

  const children = await fetchFamilyChildren("family-1", client);
  assert.deepEqual(children, [{ id: "c1", name: "たろう" }]);
  assert.deepEqual(calls, [
    ["select", "id, name"],
    ["eq", "family_id", "family-1"],
    ["eq", "role", "child"],
    ["order", "created_at", { ascending: true }],
  ]);
});
