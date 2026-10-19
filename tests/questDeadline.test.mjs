import assert from "node:assert/strict";
import test from "node:test";
import { changeQuestDeadlinePart, formatQuestDeadline, formatQuestDeadlineParts, isQuestExpired, parseQuestDeadlineInput, questDeadlineDaysInMonth, questDeadlineLabel, questDeadlineParts } from "../lib/questDeadline.ts";
import { canAcceptQuest, canReportQuestCompletion } from "../components/tasks/taskUtils.ts";

const deadline = "2026-10-20T09:00:00.000Z";
const limited = { category: "limited", expires_at: deadline, status: "open", assigned_to: "child" };
const end = Date.parse(deadline);

test("日本時間の日時をUTCで保存し、端末のタイムゾーンによらず日本時間で戻す", () => {
  assert.equal(parseQuestDeadlineInput("2026/10/20 18:00"), deadline);
  assert.equal(parseQuestDeadlineInput(" 2026-10-20 18:00 "), deadline);
  assert.equal(formatQuestDeadline(deadline), "2026/10/20 18:00");
  assert.equal(parseQuestDeadlineInput("2026/01/01 00:00"), "2025-12-31T15:00:00.000Z");
  assert.equal(formatQuestDeadline("2026-10-20T18:00:00+09:00"), "2026/10/20 18:00");
});

test("空欄は任意の期限なし。存在しない日付・時刻は保存しない", () => {
  assert.equal(parseQuestDeadlineInput("  "), null);
  assert.equal(parseQuestDeadlineInput("2028/02/29 23:59"), "2028-02-29T14:59:00.000Z");
  for (const input of ["2026/02/29 18:00", "2026/04/31 18:00", "2026/13/01 18:00", "2026/10/20 24:00", "2026/10/20 12:60", "2026/10/20", "abc", "2026/10/00 12:00", "0000/01/01 12:00"]) {
    assert.throws(() => parseQuestDeadlineInput(input), /実在する日時/);
  }
});

test("期限の1ms前まで有効、設定日時ちょうどから受注と完了申請を止める", () => {
  assert.equal(isQuestExpired(limited, end - 1), false);
  assert.equal(isQuestExpired(limited, end), true);
  assert.equal(isQuestExpired(limited, end + 1), true);
  assert.equal(canAcceptQuest(limited, true, end - 1), true);
  assert.equal(canAcceptQuest(limited, true, end), false);
  const accepted = { ...limited, status: "accepted" };
  assert.equal(canReportQuestCompletion(accepted, "child", true, end - 1), true);
  assert.equal(canReportQuestCompletion(accepted, "child", true, end), false);
  assert.equal(canReportQuestCompletion(accepted, "other", true, end - 1), false);
});

test("期限なし・旧データ・デイリー・ウィークリーの受付を変えない", () => {
  for (const quest of [{ ...limited, expires_at: null }, { category: "limited", status: "open" }, { ...limited, category: "daily" }, { ...limited, category: "weekly" }]) {
    assert.equal(isQuestExpired(quest, end + 1), false);
    assert.equal(canAcceptQuest(quest, true, end + 1), true);
  }
  assert.equal(canAcceptQuest(limited, false, end - 1), false);
});

test("残り日数・時間・分・期限切れの境界を表示する", () => {
  const label = (remaining) => questDeadlineLabel(limited, end - remaining);
  assert.equal(label(2 * 86400000), "あと2日");
  assert.equal(label(86400000), "あと1日");
  assert.equal(label(3600000), "あと1時間");
  assert.equal(label(60000), "あと1分");
  assert.equal(label(59999), "あと1分未満");
  assert.equal(label(0), "期限切れ");
  assert.equal(label(-1), "期限切れ");
  assert.equal(questDeadlineLabel({ category: "limited" }, end), "期限なし");
  assert.equal(questDeadlineLabel({ category: "daily" }, end), null);
});

test("期限の延長・解除で再び進められ、承認待ち・完了済みを受注可能にはしない", () => {
  assert.equal(canAcceptQuest({ ...limited, expires_at: new Date(end + 1000).toISOString() }, true, end), true);
  assert.equal(canAcceptQuest({ ...limited, expires_at: null }, true, end), true);
  for (const status of ["pending", "completed"]) {
    const quest = { ...limited, status, expires_at: null };
    assert.equal(canAcceptQuest(quest, true, end), false);
    assert.equal(canReportQuestCompletion(quest, "child", true, end), false);
  }
});

test("日時選択の候補は保存済みの日本時間、未設定なら日本時間の翌日18時になる", () => {
  assert.deepEqual(questDeadlineParts("2026/10/20 18:00"), { year: 2026, month: 10, day: 20, hour: 18, minute: 0 });
  assert.deepEqual(questDeadlineParts("", Date.parse("2026-12-31T16:00:00Z")), { year: 2027, month: 1, day: 2, hour: 18, minute: 0 });
  assert.equal(formatQuestDeadlineParts({ year: 2026, month: 1, day: 2, hour: 3, minute: 4 }), "2026/01/02 03:04");
});

test("月・年の選択で日をその月の末日へ収め、うるう年と年1〜99も正しく扱う", () => {
  const parts = { year: 2028, month: 1, day: 31, hour: 23, minute: 59 };
  const february = changeQuestDeadlinePart(parts, "month", 2);
  assert.deepEqual(february, { ...parts, month: 2, day: 29 });
  assert.deepEqual(changeQuestDeadlinePart(february, "year", 2029), { ...parts, year: 2029, month: 2, day: 28 });
  assert.equal(changeQuestDeadlinePart(parts, "month", 4).day, 30);
  assert.equal(questDeadlineDaysInMonth(2000, 2), 29);
  assert.equal(questDeadlineDaysInMonth(2100, 2), 28);
  assert.equal(questDeadlineDaysInMonth(4, 2), 29);
  assert.equal(questDeadlineDaysInMonth(99, 2), 28);
});
