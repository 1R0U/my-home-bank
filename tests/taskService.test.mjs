import assert from "node:assert/strict";
import test from "node:test";
import { fetchQuests, submitQuestCompletion, updateQuestDeadline } from "../lib/taskService.ts";

test("fetchQuestsはログイン中の家庭IDで絞り込む", async () => {
  const quests = [{ id: "quest-1", family_id: "family-1" }];
  const client = {
    from(table) {
      assert.equal(table, "quests");
      return {
        select(columns) {
          assert.equal(columns, "*");
          return {
            eq(column, value) {
              assert.equal(column, "family_id");
              assert.equal(value, "family-1");
              return {
                async order(orderColumn, options) {
                  assert.equal(orderColumn, "created_at");
                  assert.deepEqual(options, { ascending: false });
                  return { data: quests, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  assert.deepEqual(await fetchQuests("family-1", client), quests);
});

test("submitQuestCompletionは正しい関数名・引数でRPCを呼び出す", async () => {
  let called;
  const client = {
    async rpc(fn, args) {
      called = { fn, args };
      return { data: null, error: null };
    },
  };

  await submitQuestCompletion("quest-1", "user-1", client);

  assert.deepEqual(called, {
    fn: "submit_quest_completion",
    args: { p_quest_id: "quest-1", p_user_id: "user-1" },
  });
});

test("submitQuestCompletionはRPCのエラーをそのまま投げる", async () => {
  const client = {
    async rpc() {
      return { data: null, error: new Error("rpc failed") };
    },
  };

  await assert.rejects(() => submitQuestCompletion("quest-1", "user-1", client), /rpc failed/);
});

test("期限の設定と解除は専用RPCへ渡し、認可・期限のエラーを保持する", async () => {
  const calls = [];
  const client = { async rpc(fn, args) { calls.push({ fn, args }); return { error: null }; } };
  await updateQuestDeadline("quest-1", "2026-10-20T09:00:00Z", client);
  await updateQuestDeadline("quest-1", null, client);
  assert.deepEqual(calls, [
    { fn: "update_quest_deadline", args: { p_quest_id: "quest-1", p_expires_at: "2026-10-20T09:00:00Z" } },
    { fn: "update_quest_deadline", args: { p_quest_id: "quest-1", p_expires_at: null } },
  ]);
  const error = new Error("期限を変更できるのは親だけです");
  await assert.rejects(() => updateQuestDeadline("quest-1", null, { rpc: async () => ({ error }) }), error);
});
