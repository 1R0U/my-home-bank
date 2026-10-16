import { useCurrentUser, useDataAccess } from "../store";
import { jstDate } from "./jstDate";
import { restDayRange, type QuestRestDayRow } from "./questRestDays";
import { fetchQuestRestDays } from "./questRestDayService";
import { useResource } from "./useResource";

/**
 * 家族のお休みの日を、設定できる範囲（1週間前〜1年先）だけ取得する（Issue #396）。
 *
 * 範囲は今日から決まるので、今日の日付もキーに入れる（日をまたいで開き直したときに取り直す）。
 * 家族の一覧（子供）は `useFamilyMembers` から取る。
 * モックアカウントでは取得しない（書き込みもできないため）。
 */
export function useQuestRestDays(): {
  restDays: QuestRestDayRow[];
  today: string;
  loading: boolean;
  error: string | null;
  isLive: boolean;
  reload: () => Promise<void>;
} {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const familyId = currentUser?.family_id;
  const today = jstDate(new Date());

  const { data, error, isLive, loading, reload } = useResource<QuestRestDayRow[]>({
    blockedReason: familyId ? null : "所属する家族が設定されていません",
    errorMessage: "家事をしなくていい日を取得できませんでした",
    fetcher: () => {
      const { min, max } = restDayRange(today);
      return fetchQuestRestDays(familyId as string, min, max);
    },
    initialData: [],
    key: canUseRealData ? ["questRestDays", familyId ?? null, currentUser?.id ?? null, today] : null,
  });

  return { error, isLive, loading, reload, restDays: data, today };
}
