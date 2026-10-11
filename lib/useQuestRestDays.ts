import { useCurrentUser, useDataAccess } from "../store";
import { restDayRange, tokyoDate, type QuestRestDayRow } from "./questRestDays";
import { fetchQuestRestDays } from "./questRestDayService";
import { useResource } from "./useResource";
import { fetchFamilyMembers } from "./userService";

type Child = { id: string; name: string };

type RestDaysData = { children: Child[]; restDays: QuestRestDayRow[] };

const EMPTY: RestDaysData = { children: [], restDays: [] };

/**
 * 家族の子供と、設定できる範囲（1週間前〜1年先）のお休みの日を取得する（Issue #396）。
 *
 * 範囲は今日から決まるので、今日の日付もキーに入れる（日をまたいで開き直したときに取り直す）。
 * モックアカウントでは取得しない（書き込みもできないため）。
 */
export function useQuestRestDays(): {
  children: Child[];
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
  const today = tokyoDate(new Date());

  const { data, error, isLive, loading, reload } = useResource<RestDaysData>({
    blockedReason: familyId ? null : "所属する家族が設定されていません",
    errorMessage: "家事をしなくていい日を取得できませんでした",
    fetcher: async () => {
      const { min, max } = restDayRange(today);
      const [members, restDays] = await Promise.all([
        fetchFamilyMembers(familyId as string),
        fetchQuestRestDays(familyId as string, min, max),
      ]);
      return {
        children: members.filter((member) => member.role === "child").map(({ id, name }) => ({ id, name })),
        restDays,
      };
    },
    initialData: EMPTY,
    key: canUseRealData ? ["questRestDays", familyId ?? null, currentUser?.id ?? null, today] : null,
  });

  return { children: data.children, error, isLive, loading, reload, restDays: data.restDays, today };
}
