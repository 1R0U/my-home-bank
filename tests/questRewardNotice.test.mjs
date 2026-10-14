import assert from "node:assert/strict";
import test from "node:test";
import {
  formatQuestRewardCount,
  questRewardsKey,
  summarizeQuestRewards,
  toQuestReward,
} from "../lib/questRewardNotice.ts";
import { fetchUnseenQuestRewards, markQuestRewardsSeen } from "../lib/questRewardService.ts";

/**
 * RPC を呼ぶ Supabase クライアントの代役を作る。
 * 呼ばれた関数名と引数を記録し、指定した戻り値をそのまま返す。
 */
function makeRpcClient(returnValue) {
  let called;
  const client = {
    async rpc(fn, args) {
      called = { fn, args };
      return returnValue;
    },
  };
  return { client, getCalled: () => called };
}

function reward(questLogId, title, amount) {
  return { amount, approvedAt: "2026-10-14T00:00:00Z", questLogId, title };
}

test("1件なら、タスクの名前と入ったゴルを出す", () => {
  assert.deepEqual(summarizeQuestRewards([reward("a", "おさらあらい", 100)]), {
    count: 1,
    headline: "「おさらあらい」の タスクが",
    totalAmount: 100,
  });
});

test("複数件なら、件数と合計を出す", () => {
  assert.deepEqual(
    summarizeQuestRewards([reward("a", "おさらあらい", 100), reward("b", "おふろそうじ", 50), reward("c", "せんたく", 30)]),
    { count: 3, headline: "3つの タスクが", totalAmount: 180 },
  );
});

test("承認が無ければ何も出さない", () => {
  assert.equal(summarizeQuestRewards([]), null);
});

test("件数は9つまでは「つ」、10以上は「こ」で数える", () => {
  assert.equal(formatQuestRewardCount(2), "2つ");
  assert.equal(formatQuestRewardCount(9), "9つ");
  assert.equal(formatQuestRewardCount(10), "10こ");
  assert.equal(formatQuestRewardCount(12), "12こ");
});

test("見せた承認の組のキーは、並び順によらず同じになる", () => {
  assert.equal(questRewardsKey([reward("b", "x", 1), reward("a", "y", 1)]), "a,b");
  assert.equal(questRewardsKey([reward("a", "y", 1), reward("b", "x", 1)]), "a,b");
  assert.equal(questRewardsKey([]), null);
});

test("承認が増えたら、見せた承認の組のキーが変わる（閉じた後でも、もう一度出す）", () => {
  const before = questRewardsKey([reward("a", "x", 1)]);
  const after = questRewardsKey([reward("a", "x", 1), reward("b", "y", 1)]);
  assert.notEqual(before, after);
});

test("DBの行を承認1件へ変換する", () => {
  assert.deepEqual(
    toQuestReward({ amount: "80", approved_at: "2026-10-14T01:00:00+00:00", quest_log_id: "log-1", title: "おさらあらい" }),
    { amount: 80, approvedAt: "2026-10-14T01:00:00+00:00", questLogId: "log-1", title: "おさらあらい" },
  );
});

test("名前が空・金額が数でない行も、表示が壊れないようにする", () => {
  assert.deepEqual(toQuestReward({ amount: null, approved_at: null, quest_log_id: "log-2", title: "  " }), {
    amount: 0,
    approvedAt: null,
    questLogId: "log-2",
    title: "タスク",
  });
  assert.equal(toQuestReward({ amount: "abc", quest_log_id: "log-3", title: "x" }).amount, 0);
});

test("fetchUnseenQuestRewardsはまだ見せていない承認を取得する", async () => {
  const { client, getCalled } = makeRpcClient({
    data: [{ amount: 50, approved_at: "2026-10-14T00:00:00Z", quest_log_id: "log-1", title: "おふろそうじ" }],
    error: null,
  });
  const rewards = await fetchUnseenQuestRewards(client);
  assert.deepEqual(getCalled(), { fn: "get_unseen_quest_rewards", args: undefined });
  assert.deepEqual(rewards, [{ amount: 50, approvedAt: "2026-10-14T00:00:00Z", questLogId: "log-1", title: "おふろそうじ" }]);
});

test("fetchUnseenQuestRewardsはDBのエラーをそのまま投げる", async () => {
  const dbError = new Error("ログインしていません");
  const { client } = makeRpcClient({ data: null, error: dbError });
  await assert.rejects(fetchUnseenQuestRewards(client), dbError);
});

test("markQuestRewardsSeenは見せた承認を記録し、記録した件数を返す", async () => {
  const { client, getCalled } = makeRpcClient({ data: 2, error: null });
  assert.equal(await markQuestRewardsSeen(["log-1", "log-2"], client), 2);
  assert.deepEqual(getCalled(), { fn: "mark_quest_rewards_seen", args: { p_quest_log_ids: ["log-1", "log-2"] } });
});

test("markQuestRewardsSeenは空なら通信しない", async () => {
  const { client, getCalled } = makeRpcClient({ data: 0, error: null });
  assert.equal(await markQuestRewardsSeen([], client), 0);
  assert.equal(getCalled(), undefined);
});
