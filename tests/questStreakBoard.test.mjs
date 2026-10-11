import assert from "node:assert/strict";
import test from "node:test";
import { msUntilNextJstMidnight, notifyAppOpenRecorded, onAppOpenRecorded, recordAppOpen } from "../lib/appOpenService.ts";
import { buildQuestStreakBoard } from "../lib/questStreakBoard.ts";

// 家族に加わった順（大人と子供が混ざっている）
const MEMBERS = [
  { id: "p1", name: "お父さん", role: "parent" },
  { id: "c1", name: "たろう", role: "child" },
  { id: "p2", name: "お母さん", role: "parent" },
  { id: "c2", name: "はなこ", role: "child" },
];

function streak(currentDays) {
  return { currentDays, lastActiveOn: null, pendingMilestone: null, startedOn: null };
}

const ALL_ONE_DAY = { c1: streak(1), c2: streak(1), p1: streak(1), p2: streak(1) };

test("次のキリのいい日数と、そこまでの残り日数を出す", () => {
  const entries = buildQuestStreakBoard(
    MEMBERS,
    { c1: streak(5), c2: streak(0), p1: streak(30), p2: streak(364) },
    "someone",
  );

  assert.deepEqual(
    entries.map((e) => [e.userId, e.nextMilestone, e.daysToNextMilestone]),
    [
      ["c1", 7, 2],
      ["c2", 3, 3],
      // ちょうどキリのいい日数に届いた日は、その次を目指す
      ["p1", 60, 30],
      ["p2", 365, 1],
    ],
  );
});

test("子供 → 大人の順に並べ、同じ立場どうしは家族に加わった順のまま", () => {
  const entries = buildQuestStreakBoard(MEMBERS, ALL_ONE_DAY, "someone");

  assert.deepEqual(entries.map((e) => e.userId), ["c1", "c2", "p1", "p2"]);
  assert.equal(entries.some((e) => e.isSelf), false);
});

test("子供が見たときは、本人を先頭にする", () => {
  const entries = buildQuestStreakBoard(MEMBERS, ALL_ONE_DAY, "c2");

  assert.deepEqual(entries.map((e) => e.userId), ["c2", "c1", "p1", "p2"]);
  assert.equal(entries[0].isSelf, true);
});

test("大人が見たときも、本人を先頭にする", () => {
  const entries = buildQuestStreakBoard(MEMBERS, ALL_ONE_DAY, "p2");

  assert.deepEqual(entries.map((e) => e.userId), ["p2", "c1", "c2", "p1"]);
  assert.equal(entries[0].role, "parent");
});

test("記録が取れなかった人は、0日ではなく記録なし（null）にする", () => {
  const entries = buildQuestStreakBoard(MEMBERS, { c1: streak(4), c2: null }, "someone");
  const byId = Object.fromEntries(entries.map((e) => [e.userId, e]));

  assert.equal(byId.c2.streak, null);
  assert.equal(byId.c2.nextMilestone, null);
  assert.equal(byId.c2.daysToNextMilestone, null);
  // キーが無い人も同じ扱い
  assert.equal(byId.p1.streak, null);
  assert.equal(byId.c1.daysToNextMilestone, 3);
});

test("アプリを開いたことを record_app_open で記録する", async () => {
  let called;
  const client = {
    async rpc(fn, args) {
      called = { args, fn };
      return { data: true, error: null };
    },
  };

  assert.equal(await recordAppOpen(client), true);
  assert.deepEqual(called, { args: undefined, fn: "record_app_open" });
});

test("同じ日の2回目など、記録が増えなかったときは false", async () => {
  const client = { rpc: async () => ({ data: false, error: null }) };
  assert.equal(await recordAppOpen(client), false);
});

test("記録に失敗したときはエラーを投げる", async () => {
  const failure = new Error("network");
  const client = { rpc: async () => ({ data: null, error: failure }) };
  await assert.rejects(recordAppOpen(client), failure);
});

test("開いた日が記録されたことを、登録した関数へ知らせ、登録を外したら知らせない", () => {
  let count = 0;
  const unsubscribe = onAppOpenRecorded(() => {
    count += 1;
  });

  notifyAppOpenRecorded();
  assert.equal(count, 1);

  unsubscribe();
  notifyAppOpenRecorded();
  assert.equal(count, 1);
});

test("次の日本時間 0:00 までの時間を求める", () => {
  // 日本時間 23:59:50 → 10秒
  assert.equal(msUntilNextJstMidnight(Date.parse("2026-10-10T14:59:50Z")), 10_000);
  // 日本時間 9:00（UTC の 0:00）→ 15時間
  assert.equal(msUntilNextJstMidnight(Date.parse("2026-10-10T00:00:00Z")), 15 * 60 * 60 * 1000);
  // ちょうど 0:00 なら、翌日の 0:00 まで
  assert.equal(msUntilNextJstMidnight(Date.parse("2026-10-10T15:00:00Z")), 24 * 60 * 60 * 1000);
});
