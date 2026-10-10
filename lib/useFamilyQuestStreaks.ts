import { useCurrentUser, useDataAccess } from "../store";
import type { QuestStreak } from "./questStreak";
import { buildQuestStreakBoard, type QuestStreakBoardEntry } from "./questStreakBoard";
import { fetchQuestStreak } from "./questStreakService";
import { useResource } from "./useResource";
import { fetchFamilyMembers } from "./userService";

/**
 * 家族全員と、それぞれの連続記録を取得して、掲示板に並べる行を作る。
 *
 * 1人の記録が取れなかったときは、その人だけ記録なし（null）にして、ほかの人は出す。
 * 家族の一覧そのものが取れなかったときは失敗にする。
 * @param familyId - 家族のid
 * @param selfId - 見ている人のid（先頭に出す）
 * @returns 掲示板に並べる行
 */
async function fetchFamilyQuestStreakBoard(familyId: string, selfId: string): Promise<QuestStreakBoardEntry[]> {
  const members = await fetchFamilyMembers(familyId);
  const results = await Promise.all(
    members.map((member) =>
      fetchQuestStreak(member.id).catch((e: unknown): QuestStreak | null => {
        console.warn("連続記録を取得できませんでした", e);
        return null;
      }),
    ),
  );
  const streaks: Record<string, QuestStreak | null> = {};
  members.forEach((member, i) => {
    streaks[member.id] = results[i];
  });
  return buildQuestStreakBoard(members, streaks, selfId);
}

/**
 * 家族全員（大人と子供）の連続記録を取得するフック（掲示板 Issue #355）。
 *
 * 大人・子供のどちらが見ても、家族全員の記録を返す（本人 → 子供 → 大人の順）。
 * 子供は承認されたタスクがある日、大人はアプリを開いた日で数える。
 * 画面へ戻るたびに、古ければ取り直す（親の承認は別の端末で起きるので、戻ってきたときに反映する）。
 *
 * **モックアカウント（`canUseRealData` が false）では取得せず空のまま。**
 * @returns 掲示板に並べる行、読み込み中か、エラー文言
 */
export function useFamilyQuestStreaks(): {
  entries: QuestStreakBoardEntry[];
  error: string | null;
  loading: boolean;
} {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const userId = canUseRealData ? currentUser?.id : undefined;
  const familyId = canUseRealData ? currentUser?.family_id : undefined;

  const { data, error, loading } = useResource<QuestStreakBoardEntry[]>({
    errorMessage: "連続記録を取得できませんでした",
    fetcher: () => fetchFamilyQuestStreakBoard(familyId as string, userId as string),
    initialData: [],
    // 並び（本人を先頭にする）が見ている人で変わるので、利用者IDもキーに入れる
    key: userId && familyId ? ["familyQuestStreaks", familyId, userId] : null,
  });

  return { entries: data, error, loading };
}
