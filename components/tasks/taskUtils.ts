import type { Quest, QuestCategory, QuestStatus } from "../../types";

export const QUEST_CATEGORY_LABELS: Record<QuestCategory, string> = {
  daily: "デイリー",
  weekly: "ウィークリー",
  limited: "限定",
};

export const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  open: "未受注",
  accepted: "受注中",
  pending: "承認待",
  completed: "完了済",
};

export function filterQuestsByCategory(quests: Quest[], category: QuestCategory) {
  return quests.filter((quest) => quest.category === category);
}
