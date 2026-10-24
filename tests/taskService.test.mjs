import assert from "node:assert/strict";
import test from "node:test";
import { createQuest, fetchQuests, submitQuestCompletion, updateQuestDeadline } from "../lib/taskService.ts";

test("fetchQuestsは同じ家庭の現在の期間を同期してから、現在の実施と過去の承認待ちを取得する", async () => {
  const quests = [{ id: "quest-1", family_id: "family-1" }];
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push(name);
      assert.deepEqual(args, { p_family_id: "family-1" });
      return { data: name === "get_quests" ? quests : null, error: null };
    },
  };

  assert.deepEqual(await fetchQuests("family-1", client), quests);
  assert.deepEqual(calls, ["sync_quest_periods", "get_quests"]);
});

test("期間の同期に失敗したら古いデータを成功として返さず、取得の失敗も保持する", async () => {
  const calls = [];
  const error = new Error("通信失敗");
  await assert.rejects(() => fetchQuests("family", { async rpc(name) { calls.push(name); return { error }; } }), error);
  assert.deepEqual(calls, ["sync_quest_periods"]);
  await assert.rejects(() => fetchQuests("family", { async rpc(name) { return { error: name === "get_quests" ? error : null }; } }), error);
});

test("全員のクエストは1回のRPCで作り、曜日と1人あたりの報酬を渡す", async () => {
  const calls = [];
  const input = { family_id: "family", created_by: "parent", title: "掃除", description: "説明", reward_amount: 30,
    category: "weekly", is_required: true, audience: "all", week_start_day: 6 };
  const result = { id: "first-instance" };
  assert.equal(await createQuest(input, { async rpc(name, args) { calls.push({ name, args }); return { data: result, error: null }; } }), result);
  assert.deepEqual(calls, [{ name: "create_quest", args: { p_family_id: "family", p_title: "掃除", p_description: "説明",
    p_reward_amount: 30, p_category: "weekly", p_is_required: true, p_audience: "all", p_target_child_id: null,
    p_week_start_day: 6, p_expires_at: null, p_daily_end_minutes: 0 } }]);
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
