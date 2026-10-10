import { useActiveRole, useCurrentUser, useDataAccess } from "../store";
import { fetchQuestStreak } from "./questStreakService";
import type { QuestStreak } from "./questStreak";
import { useResource } from "./useResource";

/**
 * 自分の連続記録を取得するフック（Issue #372）。
 *
 * 画面へ戻るたびに、古ければ取り直す（親の承認は別の端末で起きるので、戻ってきたときに反映する）。
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

  const { data, error, reload } = useResource<QuestStreak | null>({
    errorMessage: "連続記録を取得できませんでした",
    // 本人の記録はRPCがログイン中の利用者から決めるため、引数は渡さない
    fetcher: () => fetchQuestStreak(undefined),
    initialData: null,
    key: userId ? ["questStreak", userId] : null,
  });

  return { reload, streak: error ? null : data };
}
