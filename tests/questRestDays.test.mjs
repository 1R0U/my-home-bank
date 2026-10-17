import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  buildMonthGrid,
  describeSelection,
  formatRestDay,
  groupRestDaysByDate,
  isSelectableRestDay,
  REST_DAY_MAX_FUTURE_DAYS,
  REST_DAY_MAX_PAST_DAYS,
  REST_DAY_MAX_SELECTED_DAYS,
  restDayRange,
  shiftMonth,
} from "../lib/questRestDays.ts";
import { fetchQuestRestDays, setQuestRestDays } from "../lib/questRestDayService.ts";
import { addDaysToDate, jstDate } from "../lib/jstDate.ts";

/**
 * 家事をしなくていい日（Issue #396）。
 */

test("今日は日本時間で区切る", () => {
  // UTC 15:00 は日本時間の翌日 0:00
  assert.equal(jstDate(new Date("2026-05-19T14:59:59Z")), "2026-05-19");
  assert.equal(jstDate(new Date("2026-05-19T15:00:00Z")), "2026-05-20");
});

test("日付の足し引き（lib/jstDate.ts）は月・年・うるう年をまたぐ", () => {
  assert.equal(addDaysToDate("2026-05-31", 1), "2026-06-01");
  assert.equal(addDaysToDate("2026-01-03", -7), "2025-12-27");
  assert.equal(addDaysToDate("2028-02-28", 1), "2028-02-29");
});

test("選べるのは1週間前から1年先まで（境目を含む）", () => {
  const today = "2026-05-20";
  assert.deepEqual(restDayRange(today), { max: "2027-05-20", min: "2026-05-13" });
  assert.equal(isSelectableRestDay("2026-05-13", today), true);
  assert.equal(isSelectableRestDay("2026-05-12", today), false);
  assert.equal(isSelectableRestDay("2027-05-20", today), true);
  assert.equal(isSelectableRestDay("2027-05-21", today), false);
});

test("画面の範囲・上限は、DBの set_quest_rest_days と同じ", () => {
  // ずれると、画面で選べるのに保存で断られる
  const file = readdirSync("supabase/migrations").find((name) => name.endsWith("_create_quest_rest_days.sql"));
  const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
  const constant = (name) => Number(new RegExp(`${name} constant integer := (\\d+);`).exec(sql)?.[1]);
  assert.equal(constant("c_max_past_days"), REST_DAY_MAX_PAST_DAYS);
  assert.equal(constant("c_max_future_days"), REST_DAY_MAX_FUTURE_DAYS);
  assert.equal(constant("c_max_days"), REST_DAY_MAX_SELECTED_DAYS);
});

test("月のカレンダーは日曜はじまりで、月の外は空ける", () => {
  // 2026年5月1日は金曜
  const weeks = buildMonthGrid(2026, 5);
  assert.deepEqual(weeks[0], [null, null, null, null, null, "2026-05-01", "2026-05-02"]);
  assert.equal(weeks.at(-1).filter(Boolean).at(-1), "2026-05-31");
  assert.ok(weeks.every((week) => week.length === 7));
  assert.equal(buildMonthGrid(2028, 2).flat().filter(Boolean).length, 29);
});

test("月は年をまたいで動かせる", () => {
  assert.deepEqual(shiftMonth({ month: 12, year: 2026 }, 1), { month: 1, year: 2027 });
  assert.deepEqual(shiftMonth({ month: 1, year: 2026 }, -1), { month: 12, year: 2025 });
});

test("選んだ組み合わせに、お休みとそうでないものがあるかを見分ける", () => {
  const byDate = groupRestDaysByDate([
    { rest_on: "2026-05-20", user_id: "a" },
    { rest_on: "2026-05-20", user_id: "b" },
    { rest_on: "2026-05-21", user_id: "a" },
  ]);
  assert.deepEqual(describeSelection(byDate, ["a", "b"], ["2026-05-20"]), { hasRest: true, hasWorkday: false });
  assert.deepEqual(describeSelection(byDate, ["a", "b"], ["2026-05-21"]), { hasRest: true, hasWorkday: true });
  assert.deepEqual(describeSelection(byDate, ["b"], ["2026-05-22"]), { hasRest: false, hasWorkday: true });
  assert.deepEqual(describeSelection(byDate, [], ["2026-05-20"]), { hasRest: false, hasWorkday: false });
});

test("日付は「5月20日（水）」の形で出す", () => {
  assert.equal(formatRestDay("2026-05-20"), "5月20日（水）");
});

test("お休みの日は、家族と範囲を指定して日付の順に取る", async () => {
  const calls = [];
  const query = {
    eq: (...args) => (calls.push(["eq", ...args]), query),
    gte: (...args) => (calls.push(["gte", ...args]), query),
    lte: (...args) => (calls.push(["lte", ...args]), query),
    order: async (...args) => (calls.push(["order", ...args]), { data: [{ rest_on: "2026-05-20", user_id: "a" }], error: null }),
    select: (...args) => (calls.push(["select", ...args]), query),
  };
  const rows = await fetchQuestRestDays("family-1", "2026-05-13", "2027-05-20", { from: () => query });
  assert.deepEqual(rows, [{ rest_on: "2026-05-20", user_id: "a" }]);
  assert.deepEqual(calls, [
    ["select", "user_id, rest_on"],
    ["eq", "family_id", "family-1"],
    ["gte", "rest_on", "2026-05-13"],
    ["lte", "rest_on", "2027-05-20"],
    ["order", "rest_on", { ascending: true }],
  ]);
});

test("まとめて設定するときは、子供・日付・お休みにするかをRPCへ渡す", async () => {
  let called;
  const client = {
    async rpc(fn, args) {
      called = { args, fn };
      return { data: 4, error: null };
    },
  };
  assert.equal(await setQuestRestDays(["a", "b"], ["2026-05-20", "2026-05-21"], true, client), 4);
  assert.deepEqual(called, {
    args: { p_days: ["2026-05-20", "2026-05-21"], p_is_rest: true, p_user_ids: ["a", "b"] },
    fn: "set_quest_rest_days",
  });
  await assert.rejects(() => setQuestRestDays([], ["2026-05-20"], true, client), /子供/);
  await assert.rejects(() => setQuestRestDays(["a"], [], false, client), /日付/);
});
