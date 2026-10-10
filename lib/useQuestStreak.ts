import { useCallback, useRef, useState } from "react";
import { useActiveRole, useCurrentUser, useDataAccess } from "../store";
import { fetchQuestStreak } from "./questStreakService";
import type { QuestStreak } from "./questStreak";
import { createStaleGuard } from "./staleGuard";
import { useRefetchOnFocus } from "./useRefetchOnFocus";

/**
 * 自分の連続記録を取得するフック（Issue #372）。
 *
 * 画面へ戻るたびに取り直す（親の承認は別の端末で起きるので、戻ってきたときに反映する）。
 *
 * **子供だけが対象。** 大人やモックアカウント（`canUseRealData` が false）では取得せず null のまま。
 * 取得に失敗したときも null にする（お祝いを出さないだけで、画面は使えるようにする）。
 * @returns 連続記録（取得できていなければ null）と、取り直す関数
 */
export function useQuestStreak(): { reload: () => Promise<void>; streak: QuestStreak | null } {
  const currentUser = useCurrentUser();
  const role = useActiveRole();
  const { canUseRealData } = useDataAccess();
  const userId = canUseRealData && role === "child" ? currentUser?.id : undefined;

  const [streak, setStreak] = useState<QuestStreak | null>(null);
  // 連続して取り直したとき、先に始めた取得が後から終わって新しい記録を上書きしないようにする
  const guardRef = useRef(createStaleGuard());
  // 最後に取った利用者。変わったときだけ、取り終わるまで null にする（前の利用者の記録を見せないため）
  const loadedForRef = useRef<string | null>(null);

  const reload = useCallback((): Promise<void> => {
    const requestId = guardRef.current.start();
    const owner = userId ?? null;
    const isOwnerChanged = loadedForRef.current !== owner;
    loadedForRef.current = owner;

    if (!userId) {
      setStreak(null);
      return Promise.resolve();
    }
    if (isOwnerChanged) setStreak(null);

    return fetchQuestStreak(undefined)
      .then((value) => {
        if (guardRef.current.isCurrent(requestId)) setStreak(value);
      })
      .catch((e: unknown) => {
        console.warn("連続記録を取得できませんでした", e);
        if (guardRef.current.isCurrent(requestId)) setStreak(null);
      });
  }, [userId]);

  useRefetchOnFocus(reload);

  return { reload, streak };
}
