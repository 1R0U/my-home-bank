import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  QUEST_STREAK_MILESTONES,
  formatQuestStreakMilestone,
  getNextQuestStreakMilestone,
  isQuestStreakMilestone,
  toQuestStreak,
} from "../lib/questStreak.ts";
import { fetchQuestStreak, recordQuestStreakCelebration } from "../lib/questStreakService.ts";

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

test("3・7・10・100・365・1000日と、30日ごとはキリのいい日数", () => {
  for (const days of [3, 7, 10, 30, 60, 90, 100, 120, 365, 1000, 1020]) {
    assert.equal(isQuestStreakMilestone(days), true, `${days}日`);
  }
});

test("それ以外・0以下・整数でない日数はキリのいい日数ではない", () => {
  for (const days of [0, -3, 1, 2, 4, 29, 31, 99, 364, 999, 3.5, Number.NaN]) {
    assert.equal(isQuestStreakMilestone(days), false, `${days}日`);
  }
});

test("キリのいい日数はDBの private.is_quest_streak_milestone と同じ", () => {
  // ずれるとDBがお祝いの記録を拒否するので、マイグレーションの日数と突き合わせる
  const sql = readFileSync(
    new URL("../supabase/migrations/20261010024954_create_quest_streak_celebrations.sql", import.meta.url),
    "utf8",
  );
  const match = sql.match(/select p_days in \(([\d,\s]+)\) or \(p_days > 0 and p_days % (\d+) = 0\);/);
  assert.ok(match, "マイグレーションにキリのいい日数の定義が見つからない");
  assert.deepEqual(
    match[1].split(",").map((value) => Number(value.trim())),
    [...QUEST_STREAK_MILESTONES],
  );
  assert.equal(Number(match[2]), 30);
});

test("次のキリのいい日数は、今の日数より大きい一番近いもの", () => {
  assert.equal(getNextQuestStreakMilestone(0), 3);
  assert.equal(getNextQuestStreakMilestone(2), 3);
  assert.equal(getNextQuestStreakMilestone(3), 7);
  assert.equal(getNextQuestStreakMilestone(7), 10);
  assert.equal(getNextQuestStreakMilestone(10), 30);
  assert.equal(getNextQuestStreakMilestone(90), 100);
  assert.equal(getNextQuestStreakMilestone(100), 120);
  assert.equal(getNextQuestStreakMilestone(360), 365);
  assert.equal(getNextQuestStreakMilestone(365), 390);
  assert.equal(getNextQuestStreakMilestone(990), 1000);
  assert.equal(getNextQuestStreakMilestone(1000), 1020);
  assert.equal(getNextQuestStreakMilestone(-1), 3);
});

test("お祝いの日数の呼び方", () => {
  assert.equal(formatQuestStreakMilestone(3), "3日");
  assert.equal(formatQuestStreakMilestone(7), "1しゅうかん");
  assert.equal(formatQuestStreakMilestone(10), "10日");
  assert.equal(formatQuestStreakMilestone(30), "1かげつ");
  assert.equal(formatQuestStreakMilestone(90), "3かげつ");
  assert.equal(formatQuestStreakMilestone(100), "100日");
  assert.equal(formatQuestStreakMilestone(365), "1ねん");
  assert.equal(formatQuestStreakMilestone(1000), "1000日");
});

test("RPCの1行を連続記録へ変換する", () => {
  assert.deepEqual(
    toQuestStreak({ current_days: 7, last_active_on: "2026-10-10", pending_milestone: 7, started_on: "2026-10-04" }),
    { currentDays: 7, lastActiveOn: "2026-10-10", pendingMilestone: 7, startedOn: "2026-10-04" },
  );
});

test("想定外の値は記録なしとして扱う", () => {
  const empty = { currentDays: 0, lastActiveOn: null, pendingMilestone: null, startedOn: null };
  assert.deepEqual(toQuestStreak(undefined), empty);
  assert.deepEqual(
    toQuestStreak({ current_days: "7", last_active_on: 1, pending_milestone: 4, started_on: null }),
    empty,
  );
});

test("fetchQuestStreakは自分の記録を get_quest_streak で取得する", async () => {
  const { client, getCalled } = makeRpcClient({
    data: [{ current_days: 3, last_active_on: "2026-10-10", pending_milestone: 3, started_on: "2026-10-08" }],
    error: null,
  });
  const streak = await fetchQuestStreak(undefined, client);
  assert.deepEqual(getCalled(), { fn: "get_quest_streak", args: { p_user_id: null } });
  assert.deepEqual(streak, { currentDays: 3, lastActiveOn: "2026-10-10", pendingMilestone: 3, startedOn: "2026-10-08" });
});

test("fetchQuestStreakは家族の記録も取得できる", async () => {
  const { client, getCalled } = makeRpcClient({ data: [], error: null });
  const streak = await fetchQuestStreak("user-2", client);
  assert.deepEqual(getCalled(), { fn: "get_quest_streak", args: { p_user_id: "user-2" } });
  assert.equal(streak.currentDays, 0);
});

test("fetchQuestStreakはDBのエラーをそのまま投げる", async () => {
  const dbError = new Error("同じ家族の人の記録しか見られません");
  const { client } = makeRpcClient({ data: null, error: dbError });
  await assert.rejects(fetchQuestStreak("user-x", client), dbError);
});

test("recordQuestStreakCelebrationはお祝いした日数を記録する", async () => {
  const { client, getCalled } = makeRpcClient({ data: true, error: null });
  assert.equal(await recordQuestStreakCelebration(7, client), true);
  assert.deepEqual(getCalled(), { fn: "record_quest_streak_celebration", args: { p_milestone_days: 7 } });
});

test("recordQuestStreakCelebrationは記録済みなら false を返す", async () => {
  const { client } = makeRpcClient({ data: false, error: null });
  assert.equal(await recordQuestStreakCelebration(3, client), false);
});

test("recordQuestStreakCelebrationはキリのよくない日数ではRPCを呼ばない", async () => {
  const { client, getCalled } = makeRpcClient({ data: true, error: null });
  await assert.rejects(recordQuestStreakCelebration(4, client), /キリのいい日数ではありません/);
  assert.equal(getCalled(), undefined);
});
