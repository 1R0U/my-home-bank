import { useCallback, useRef, useState } from "react";
import { useCurrentUser, useDataAccess } from "../store";
import type { QuestStreak } from "./questStreak";
import { buildQuestStreakBoard, type QuestStreakBoardEntry } from "./questStreakBoard";
import { fetchQuestStreak } from "./questStreakService";
import { createStaleGuard } from "./staleGuard";
import { useRefetchOnFocus } from "./useRefetchOnFocus";
import { fetchFamilyMembers } from "./userService";

/**
 * 家族全員（大人と子供）の連続記録を取得するフック（掲示板 Issue #355）。
 *
 * 大人・子供のどちらが見ても、家族全員の記録を返す（本人 → 子供 → 大人の順）。
 * 子供は承認されたタスクがある日、大人はアプリを開いた日で数える。
 * 画面へ戻るたびに取り直す（親の承認は別の端末で起きるので、戻ってきたときに反映する）。
 *
 * 1人の記録が取れなかったときは、その人だけ記録なし（null）にして、ほかの人は出す。
 * 家族の一覧そのものが取れなかったときは error を返す。
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

  const [entries, setEntries] = useState<QuestStreakBoardEntry[]>([]);
  const [loading, setLoading] = useState(familyId !== undefined);
  const [error, setError] = useState<string | null>(null);
  // 連続して取り直したとき、先に始めた取得が後から終わって新しい記録を上書きしないようにする
  const guardRef = useRef(createStaleGuard());
  // 最後に取った利用者。変わったときだけ、取り終わるまで空にする（前の利用者の家族の記録を見せないため）
  const loadedForRef = useRef<string | null>(null);

  const reload = useCallback((): Promise<void> => {
    const requestId = guardRef.current.start();
    const owner = userId && familyId ? `${userId}:${familyId}` : null;
    const isOwnerChanged = loadedForRef.current !== owner;
    loadedForRef.current = owner;

    if (!userId || !familyId) {
      setEntries([]);
      setLoading(false);
      setError(null);
      return Promise.resolve();
    }

    setLoading(true);
    setError(null);
    if (isOwnerChanged) setEntries([]);

    return fetchFamilyMembers(familyId)
      .then(async (members) => {
        const results = await Promise.all(
          members.map((member) =>
            fetchQuestStreak(member.id).catch((e: unknown): QuestStreak | null => {
              console.warn("連続記録を取得できませんでした", e);
              return null;
            }),
          ),
        );
        if (!guardRef.current.isCurrent(requestId)) return;
        const streaks: Record<string, QuestStreak | null> = {};
        members.forEach((member, i) => {
          streaks[member.id] = results[i];
        });
        setEntries(buildQuestStreakBoard(members, streaks, userId));
      })
      .catch((e: unknown) => {
        console.warn("家族を取得できませんでした", e);
        if (guardRef.current.isCurrent(requestId)) setError("連続記録を取得できませんでした");
      })
      .finally(() => {
        if (guardRef.current.isCurrent(requestId)) setLoading(false);
      });
  }, [userId, familyId]);

  useRefetchOnFocus(reload);

  return { entries, error, loading };
}
