import { formatQuestStreakMilestone, getNextQuestStreakMilestone, type QuestStreak } from "./questStreak.ts";

/** 掲示板に並べる家族の一員。 */
export type QuestStreakBoardMember = {
  id: string;
  name: string;
  role: "parent" | "child";
};

/**
 * 掲示板に並べる、1人分の連続記録（Issue #355）。
 *
 * 子供は承認されたタスクがある日、大人はアプリを開いた日で数える（数えるのはDBの `get_quest_streak`）。
 */
export type QuestStreakBoardEntry = {
  userId: string;
  name: string;
  role: "parent" | "child";
  /** 見ている本人か（先頭へ出し、「じぶん」と添える） */
  isSelf: boolean;
  /** 連続記録。取得に失敗した人は null（0日と区別するため） */
  streak: QuestStreak | null;
  /** 次のキリのいい日数。記録が取れなかった人は null */
  nextMilestone: number | null;
  /** 次のキリのいい日数まであと何日か。記録が取れなかった人は null */
  daysToNextMilestone: number | null;
};

/**
 * 家族と、それぞれの連続記録から、掲示板に並べる行を作る。
 *
 * 並びは、見ている本人 → 子供 → 大人。子供どうし・大人どうしは家族に加わった順のまま。
 * @param members - 家族全員（加わった順）
 * @param streaks - id ごとの連続記録。取得に失敗した人は null か、キーが無い
 * @param selfId - 見ている人の id
 * @returns 掲示板に並べる行
 */
export function buildQuestStreakBoard(
  members: readonly QuestStreakBoardMember[],
  streaks: Readonly<Record<string, QuestStreak | null>>,
  selfId: string | null | undefined,
): QuestStreakBoardEntry[] {
  const entries = members.map((member): QuestStreakBoardEntry => {
    const streak = streaks[member.id] ?? null;
    const nextMilestone = streak ? getNextQuestStreakMilestone(streak.currentDays) : null;
    return {
      daysToNextMilestone: streak && nextMilestone !== null ? nextMilestone - streak.currentDays : null,
      isSelf: member.id === selfId,
      name: member.name,
      nextMilestone,
      role: member.role,
      streak,
      userId: member.id,
    };
  });
  const rank = (entry: QuestStreakBoardEntry) => (entry.isSelf ? 0 : entry.role === "child" ? 1 : 2);
  // sort は安定なので、同じ順位どうしは元の順のまま残る
  return entries.sort((a, b) => rank(a) - rank(b));
}

/** 連続日数が0日の人に、日数の代わりに出す文言 */
export const QUEST_STREAK_ZERO_DAYS_TEXT = "今日からスタート";

/** 記録が取れなかった人に出す文言 */
export const QUEST_STREAK_UNAVAILABLE_TEXT = "記録を取得できませんでした";

/**
 * 掲示板の1人分の行に出す文言。大人用・子供用の掲示板で同じ言い方にそろえる（Issue #441）。
 */
export type QuestStreakBoardEntryText = {
  /** 「5日 連続」など。記録が取れなかった人は null */
  daysText: string | null;
  /** 0日（途切れている・まだ記録がない）か */
  isZero: boolean;
  /** 「次の「1しゅうかん」まで あと2日」など。記録が取れなかった人は null */
  nextText: string | null;
  /** 1人分をまとめた読み上げ用の文言（名前・日数・あと何日かが別々に読まれないように） */
  label: string;
};

/**
 * 掲示板の1人分の行に出す文言を作る。
 *
 * 途切れている人・まだ記録がない人に「0日 連続」と出すのは不自然なので、言い換える。
 * @param entry - 1人分の連続記録
 * @returns 行に出す文言
 */
export function describeQuestStreakEntry(entry: QuestStreakBoardEntry): QuestStreakBoardEntryText {
  const isZero = entry.streak?.currentDays === 0;
  const daysText = entry.streak
    ? isZero
      ? QUEST_STREAK_ZERO_DAYS_TEXT
      : `${entry.streak.currentDays}日 連続`
    : null;
  const nextText =
    entry.streak && entry.nextMilestone !== null
      ? `次の「${formatQuestStreakMilestone(entry.nextMilestone)}」まで あと${entry.daysToNextMilestone}日`
      : null;
  const label = [entry.name + (entry.isSelf ? "（じぶん）" : ""), daysText, nextText ?? QUEST_STREAK_UNAVAILABLE_TEXT]
    .filter(Boolean)
    .join("、");
  return { daysText, isZero, label, nextText };
}
