import assert from "node:assert/strict";
import test from "node:test";
import { submitQuestCompletion } from "../lib/taskService.ts";

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
