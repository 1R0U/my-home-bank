import type { Quest, QuestCategory, QuestStatus } from "../../types";
import { isQuestClosedByDeadline, isQuestExpired, type DeadlineQuest } from "../../lib/questDeadline.ts";

/** クエストカテゴリの日本語ラベル */
export const QUEST_CATEGORY_LABELS: Record<QuestCategory, string> = {
  daily: "デイリー",
  weekly: "ウィークリー",
  limited: "限定",
};

/** 子供用の画面に出すカテゴリのラベル。ふりがな付き（`components/Furigana.tsx`、Issue #347） */
export const QUEST_CATEGORY_LABELS_FOR_CHILD: Record<QuestCategory, string> = {
  ...QUEST_CATEGORY_LABELS,
  limited: "{限定|げんてい}",
};

/** 必須/推奨の日本語ラベル（大人用画面） */
export function questRequirementLabel(isRequired: boolean): string {
  return isRequired ? "必須" : "推奨";
}

/** 必須/推奨のラベル（子供用画面。漢字を読めない子にも分かるようひらがなにする） */
export function questRequirementLabelForChild(isRequired: boolean): string {
  return isRequired ? "ひっす" : "おすすめ";
}

/** クエストステータスの日本語ラベル */
export const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  open: "未受注",
  accepted: "受注中",
  pending: "承認待",
  completed: "完了済",
};

/** 子供用の画面に出すクエストステータスのラベル。ふりがな付き（`components/Furigana.tsx`、Issue #347） */
export const QUEST_STATUS_LABELS_FOR_CHILD: Record<QuestStatus, string> = {
  open: "{未受注|みじゅちゅう}",
  accepted: "{受注中|じゅちゅうちゅう}",
  pending: "{承認|しょうにん}{待|まち}",
  completed: "{完了|かんりょう}{済|ずみ}",
};

type StatusQuest = Pick<Quest, "status"> & DeadlineQuest;

/** 期限切れは親子とも未受注と同じ落ち着いた色で表示する。 */
export function questStatusStyleKey(quest: StatusQuest, now = Date.now()): QuestStatus {
  return isQuestClosedByDeadline(quest, now) ? "open" : quest.status;
}

/** 大人の一覧・詳細で、受付が終わったタスクは「期限切れ」にそろえる。 */
export function questStatusLabel(quest: StatusQuest, now = Date.now()): string {
  return isQuestClosedByDeadline(quest, now) ? "期限切れ" : QUEST_STATUS_LABELS[quest.status];
}

/** 子供の一覧・詳細・読み上げで、受付が終わったタスクは「期限切れ」にそろえる。 */
export function questStatusLabelForChild(quest: StatusQuest, now = Date.now()): string {
  return isQuestClosedByDeadline(quest, now) ? "{期限切|きげんぎ}れ" : QUEST_STATUS_LABELS_FOR_CHILD[quest.status];
}

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
export function canAcceptQuest(
  quest: StatusQuest,
  isLive: boolean,
  now = Date.now(),
): boolean {
  return isLive && quest.status === "open" && !isQuestExpired(quest, now);
}

/**
 * 「完了報告」ボタンを押せる状態か（自分が受注中のクエストのみ報告できる）。
 * @param quest - 対象のクエスト
 * @param userId - 現在のユーザーID
 * @param isLive - 本番接続中かどうか
 * @returns 完了報告可能な場合は true
 */
export function canReportQuestCompletion(
  quest: StatusQuest & Pick<Quest, "assigned_to">,
  userId: string,
  isLive: boolean,
  now = Date.now(),
): boolean {
  return isLive && quest.status === "accepted" && quest.assigned_to === userId && !isQuestExpired(quest, now);
}
