import type { Quest, QuestCategory, QuestStatus } from "../../types";

/** クエストカテゴリの日本語ラベル */
export const QUEST_CATEGORY_LABELS: Record<QuestCategory, string> = {
  daily: "デイリー",
  weekly: "ウィークリー",
  limited: "限定",
};

/** クエストステータスの日本語ラベル */
export const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  open: "未受注",
  accepted: "受注中",
  pending: "承認待",
  completed: "完了済",
};

/**
 * クエストをカテゴリでフィルタリングする。
 * @param quests - フィルタリング対象のクエスト配列
 * @param category - フィルタするカテゴリ
 * @returns 指定カテゴリのクエストのみの配列
 */
export function filterQuestsByCategory(quests: Quest[], category: QuestCategory) {
  return quests.filter((quest) => quest.category === category);
}

/**
 * 「受注する」ボタンを押せる状態か（未受注のクエストのみ受注できる）。
 * @param quest - 対象のクエスト
 * @param isLive - 本番接続中かどうか（モックデータ表示中は false）
 * @returns 受注可能な場合は true
 */
export function canAcceptQuest(quest: Pick<Quest, "status">, isLive: boolean): boolean {
  return isLive && quest.status === "open";
}

/**
 * 「完了報告」ボタンを押せる状態か（自分が受注中のクエストのみ報告できる）。
 * @param quest - 対象のクエスト
 * @param userId - 現在のユーザーID
 * @param isLive - 本番接続中かどうか
 * @returns 完了報告可能な場合は true
 */
export function canReportQuestCompletion(
  quest: Pick<Quest, "status" | "assigned_to">,
  userId: string,
  isLive: boolean,
): boolean {
  return isLive && quest.status === "accepted" && quest.assigned_to === userId;
}
