import { getNextQuestStreakMilestone, type QuestStreak } from "./questStreak.ts";

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
