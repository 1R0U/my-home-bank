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

/** 「受注する」ボタンを押せる状態か（未受注のクエストのみ受注できる）。 */
export function canAcceptQuest(quest: Pick<Quest, "status">, isLive: boolean): boolean {
  return isLive && quest.status === "open";
}

/** 「完了報告」ボタンを押せる状態か（自分が受注中のクエストのみ報告できる）。 */
export function canReportQuestCompletion(
  quest: Pick<Quest, "status" | "assigned_to">,
  userId: string,
  isLive: boolean,
): boolean {
  return isLive && quest.status === "accepted" && quest.assigned_to === userId;
}
