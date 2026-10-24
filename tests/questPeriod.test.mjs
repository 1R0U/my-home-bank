import assert from "node:assert/strict";
import test from "node:test";
import { currentQuestPeriod, parseQuestDailyEndTime } from "../lib/questPeriod.ts";
import { canAcceptQuest, canReportQuestCompletion } from "../components/tasks/taskUtils.ts";

test("デイリーは日本時間の0時に切り替わり、境界直前は前日に含まれる", () => {
  const boundary = Date.parse("2026-10-24T00:00:00+09:00");
  assert.deepEqual(currentQuestPeriod("daily", null, boundary - 1), {
    startsAt: "2026-10-22T15:00:00.000Z", endsAt: "2026-10-23T15:00:00.000Z",
  });
  assert.deepEqual(currentQuestPeriod("daily", null, boundary), {
    startsAt: "2026-10-23T15:00:00.000Z", endsAt: "2026-10-24T15:00:00.000Z",
  });
});

test("デイリーは終了時刻の24時間前から始まり、その時刻ちょうどで次の回になる", () => {
  for (const minutes of [0, 1, 8 * 60 + 30, 18 * 60, 23 * 60 + 59]) {
    const boundary = Date.parse("2026-01-01T00:00:00+09:00") + minutes * 60_000;
    assert.deepEqual(currentQuestPeriod("daily", null, boundary - 1, minutes), {
      startsAt: new Date(boundary - 86_400_000).toISOString(), endsAt: new Date(boundary).toISOString(),
    });
    assert.deepEqual(currentQuestPeriod("daily", null, boundary, minutes), {
      startsAt: new Date(boundary).toISOString(), endsAt: new Date(boundary + 86_400_000).toISOString(),
    });
  }
  for (const minutes of [-1, 1440, 1.5, NaN, null]) {
    assert.throws(() => currentQuestPeriod("daily", null, Date.now(), minutes), /終了時刻/);
  }
});

test("終了時刻は00:00から23:59までの時刻だけ保存できる", () => {
  assert.equal(parseQuestDailyEndTime("00:00"), 0);
  assert.equal(parseQuestDailyEndTime(" 18:30 "), 1110);
  assert.equal(parseQuestDailyEndTime("23:59"), 1439);
  for (const input of ["", "24:00", "18:60", "-1:00", "9:00", "09:0", "abc"]) assert.equal(parseQuestDailyEndTime(input), null);
});

test("対象の子以外は受注できず、対象の子でも期間終了後は受注・申請できない", () => {
  const end = Date.parse("2026-10-24T09:00:00Z");
  const quest = { category: "daily", period_ends_at: new Date(end).toISOString(), audience: "all", target_child_id: "child", status: "open" };
  assert.equal(canAcceptQuest(quest, true, end - 1, "child"), true);
  assert.equal(canAcceptQuest(quest, true, end - 1, "other"), false);
  assert.equal(canAcceptQuest(quest, true, end, "child"), false);
  assert.equal(canReportQuestCompletion({ ...quest, status: "accepted", assigned_to: "child" }, "child", true, end), false);
});

test("ウィークリーは親が指定した7通りの曜日からちょうど1週間とする", () => {
  const sunday = Date.parse("2026-10-18T00:00:00+09:00");
  for (let day = 0; day < 7; day++) {
    const start = sunday + day * 86_400_000;
    const expected = { startsAt: new Date(start).toISOString(), endsAt: new Date(start + 7 * 86_400_000).toISOString() };
    assert.deepEqual(currentQuestPeriod("weekly", day, start), expected);
    assert.deepEqual(currentQuestPeriod("weekly", day, start + 7 * 86_400_000 - 1), expected);
    assert.equal(currentQuestPeriod("weekly", day, start - 1).endsAt, expected.startsAt);
    assert.equal(currentQuestPeriod("weekly", day, start + 7 * 86_400_000).startsAt, expected.endsAt);
  }
});

test("年越し・うるう日を含む期間も、日本時間の暦に従う", () => {
  assert.deepEqual(currentQuestPeriod("weekly", 3, Date.parse("2026-01-01T12:00:00+09:00")), {
    startsAt: "2025-12-30T15:00:00.000Z", endsAt: "2026-01-06T15:00:00.000Z",
  });
  assert.deepEqual(currentQuestPeriod("daily", null, Date.parse("2028-02-29T23:59:59+09:00")), {
    startsAt: "2028-02-28T15:00:00.000Z", endsAt: "2028-02-29T15:00:00.000Z",
  });
});

test("同じ瞬間なら入力のタイムゾーンによらず同じ期間になる", () => {
  const expected = currentQuestPeriod("weekly", 6, Date.parse("2026-10-24T08:00:00+09:00"));
  for (const input of ["2026-10-23T23:00:00Z", "2026-10-23T16:00:00-07:00"]) {
    assert.deepEqual(currentQuestPeriod("weekly", 6, Date.parse(input)), expected);
  }
});

test("限定は繰り返さず、ウィークリーの開始曜日や日時の不正値は拒否する", () => {
  assert.equal(currentQuestPeriod("limited", null), null);
  for (const day of [null, undefined, -1, 7, 1.5, NaN, "1"]) {
    assert.throws(() => currentQuestPeriod("weekly", day), /開始曜日/);
  }
  for (const now of [NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
    assert.throws(() => currentQuestPeriod("daily", null, now), /日時が不正/);
  }
});
