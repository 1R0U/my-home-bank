import assert from "node:assert/strict";
import test from "node:test";
import {
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
