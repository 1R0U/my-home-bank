/**
 * 子供の連続記録（Issue #372）。
 *
 * 「1日続けた」は、承認されたタスクが1つ以上ある日（申請した日を日本時間で数える）。
 * 数えるのはDB（`get_quest_streak`）で、ここには表示とお祝いに使う決まりだけを置く。
 */

/**
 * 1か月ごとのお祝いの間隔（日）。月の長さは月ごとに違うので、30日ごとで区切る。
 */
export const QUEST_STREAK_MONTH_DAYS = 30;

/**
 * 1か月ごと以外のキリのいい日数。
 *
 * **DBの `private.is_quest_streak_milestone` と同じ日数にすること。** DBはこの日数に
 * 届いていないお祝いの記録を拒否するので、ずれるとお祝いが出なくなったり、記録に失敗したりする。
 */
export const QUEST_STREAK_MILESTONES: readonly number[] = [3, 7, 10, 100, 365, 1000];

/** 連続記録（`get_quest_streak` の1行） */
export type QuestStreak = {
  /** 連続日数（途切れていれば0） */
  currentDays: number;
  /** 続いている記録が始まった日（YYYY-MM-DD、日本時間）。途切れていれば null */
  startedOn: string | null;
  /** 最後に続けた日（YYYY-MM-DD、日本時間）。一度も続けていなければ null */
  lastActiveOn: string | null;
  /** まだお祝いしていないキリのいい日数のうち一番大きいもの。なければ null */
  pendingMilestone: number | null;
};

/**
 * キリのいい日数かを判定する。
 * @param days - 連続日数
 * @returns 3・7・10・100・365・1000日と、30日ごとなら true
 */
export function isQuestStreakMilestone(days: number): boolean {
  if (!Number.isInteger(days) || days <= 0) return false;
  return QUEST_STREAK_MILESTONES.includes(days) || days % QUEST_STREAK_MONTH_DAYS === 0;
}

/**
 * 次のキリのいい日数を求める（掲示板の「あと何日」用。#355）。
 * @param currentDays - 今の連続日数
 * @returns 今の日数より大きい、一番近いキリのいい日数
 */
export function getNextQuestStreakMilestone(currentDays: number): number {
  const base = Number.isInteger(currentDays) && currentDays > 0 ? currentDays : 0;
  const nextMonth = (Math.floor(base / QUEST_STREAK_MONTH_DAYS) + 1) * QUEST_STREAK_MONTH_DAYS;
  const nextFixed = QUEST_STREAK_MILESTONES.find((days) => days > base);
  return nextFixed === undefined ? nextMonth : Math.min(nextFixed, nextMonth);
}

/**
 * お祝いの見出しに出す、日数の呼び方。
 *
 * 1週間・1年のように呼び名があるものはそれを使い、それ以外は「◯日」。
 * 子供向けの画面に出すので、漢字は小学校低学年で読めるものに限る。
 * @param days - キリのいい日数
 * @returns 表示用の文字列
 */
export function formatQuestStreakMilestone(days: number): string {
  if (days === 7) return "1しゅうかん";
  if (days === 365) return "1ねん";
  if (days % QUEST_STREAK_MONTH_DAYS === 0) return `${days / QUEST_STREAK_MONTH_DAYS}かげつ`;
  return `${days}日`;
}

/**
 * `get_quest_streak` の1行をアプリの型へ変換する。
 *
 * 想定外の値（数でない日数など）は「記録なし」として扱い、画面を壊さない。
 * @param row - RPCが返した1行（返らなければ undefined）
 * @returns 連続記録
 */
export function toQuestStreak(row: Record<string, unknown> | undefined): QuestStreak {
  const currentDays = row?.current_days;
  const pendingMilestone = row?.pending_milestone;
  const startedOn = row?.started_on;
  const lastActiveOn = row?.last_active_on;
  return {
    currentDays: typeof currentDays === "number" && Number.isInteger(currentDays) && currentDays > 0 ? currentDays : 0,
    lastActiveOn: typeof lastActiveOn === "string" ? lastActiveOn : null,
    pendingMilestone:
      typeof pendingMilestone === "number" && isQuestStreakMilestone(pendingMilestone) ? pendingMilestone : null,
    startedOn: typeof startedOn === "string" ? startedOn : null,
  };
}
