import assert from "node:assert/strict";
import test from "node:test";
import {
  canAcceptQuest,
  canReportQuestCompletion,
  filterQuestsByCategory,
  QUEST_CATEGORY_LABELS,
  QUEST_STATUS_LABELS,
} from "../components/tasks/taskUtils.ts";

const quests = [
  { id: "daily-1", category: "daily" },
  { id: "weekly-1", category: "weekly" },
  { id: "daily-2", category: "daily" },
  { id: "limited-1", category: "limited" },
];

test("指定した分類のタスクだけを取得する", () => {
  assert.deepEqual(
    filterQuestsByCategory(quests, "daily").map((quest) => quest.id),
    ["daily-1", "daily-2"],
  );
  assert.deepEqual(
    filterQuestsByCategory(quests, "weekly").map((quest) => quest.id),
    ["weekly-1"],
  );
  assert.deepEqual(
    filterQuestsByCategory(quests, "limited").map((quest) => quest.id),
    ["limited-1"],
  );
});

test("分類名を日本語で取得できる", () => {
  assert.deepEqual(QUEST_CATEGORY_LABELS, {
    daily: "デイリー",
    weekly: "ウィークリー",
    limited: "限定",
  });
});

test("タスク状態を日本語で取得できる", () => {
  assert.deepEqual(QUEST_STATUS_LABELS, {
    open: "未受注",
    accepted: "受注中",
    pending: "承認待",
    completed: "完了済",
  });
});

test("未受注（open）かつライブ接続中のみ受注できる", () => {
  assert.equal(canAcceptQuest({ status: "open" }, true), true);
  assert.equal(canAcceptQuest({ status: "accepted" }, true), false);
  assert.equal(canAcceptQuest({ status: "pending" }, true), false);
  assert.equal(canAcceptQuest({ status: "completed" }, true), false);
});

test("プレビュー中（モックデータ表示中）は受注できない", () => {
  assert.equal(canAcceptQuest({ status: "open" }, false), false);
});

test("自分が受注中（accepted）のクエストのみ完了報告できる", () => {
  const quest = { status: "accepted", assigned_to: "user-child-1" };
  assert.equal(canReportQuestCompletion(quest, "user-child-1", true), true);
  assert.equal(canReportQuestCompletion(quest, "user-child-2", true), false);
});

test("他人が受注中のクエストは完了報告できない", () => {
  const quest = { status: "accepted", assigned_to: "user-child-2" };
  assert.equal(canReportQuestCompletion(quest, "user-child-1", true), false);
});

test("受注中でないクエストは完了報告できない", () => {
  assert.equal(
    canReportQuestCompletion({ status: "open", assigned_to: null }, "user-child-1", true),
    false,
  );
  assert.equal(
    canReportQuestCompletion({ status: "pending", assigned_to: "user-child-1" }, "user-child-1", true),
    false,
  );
});

test("プレビュー中（モックデータ表示中）は完了報告できない", () => {
  const quest = { status: "accepted", assigned_to: "user-child-1" };
  assert.equal(canReportQuestCompletion(quest, "user-child-1", false), false);
});
