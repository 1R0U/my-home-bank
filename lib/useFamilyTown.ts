import { useEffect } from "react";
import { fetchFamilyTown } from "./familyTownService";
import { buildFamilyNpcs, toFamilyTownStatus, withFamilyQuestCounts, type FamilyMember, type FamilyQuestRow } from "./rpg-hub/familyNpcs";
import { useResource } from "./useResource";
import { useQuestDeadlineClock } from "./useQuestDeadlineClock";
import { useMapStore } from "../store/mapStore";
import { useCurrentUser, useDataAccess } from "../store";

/** 家族が取れていないとき（取得前・モックアカウント）の値。毎回作ると下の effect が回り続ける */
const EMPTY_FAMILY_TOWN: { familyPendingQuestCount: number; members: FamilyMember[]; quests: FamilyQuestRow[] } = {
  familyPendingQuestCount: 0,
  members: [],
  quests: [],
};

/**
 * 家族を取得し、我が家タウンにNPCとして立たせる（Issue #255）。
 *
 * 取得は `useResource` に任せる。建物（クエスト・銀行など）から戻ってきたときに、
 * 家族NPCの会話（クエスト数・残高）が古いままにならないよう、フォーカス時に取り直される。
 * 期限到達と前面復帰では取得済みのクエストを再集計し、期限切れを作業中に数えない。
 * 見た目が変わっていなければ町は組み直さない（`setFamily` が比べる）。
 *
 * 取得に失敗しても**町とキャラクターは表示する**（`useWardrobe` と同じ考え方）。
 * 失敗したときは前に取れた家族をそのまま残す（`useResource` が前回の値を残す）。
 *
 * **モックアカウント（`canUseRealData` が false）では家族を出さない。** 家族の実データが無いため。
 * 利用者が変わるとキーが変わるので、取得を待たずに前の人の家族は消える。
 */
export function useFamilyTown(): void {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const setFamily = useMapStore((state) => state.setFamily);

  const userId = currentUser?.id;
  const familyId = currentUser?.family_id;

  const { data } = useResource({
    // 自分を除くので、家族IDだけでなく利用者IDもキーに入れる
    key: canUseRealData && userId && familyId ? ["family-town", userId, familyId] : null,
    fetcher: () => fetchFamilyTown(familyId),
    initialData: EMPTY_FAMILY_TOWN,
    errorMessage: "家族を読み込めませんでした",
  });
  const now = useQuestDeadlineClock(data.quests ?? EMPTY_FAMILY_TOWN.quests);

  useEffect(() => {
    const current = data.quests ? withFamilyQuestCounts(data.members, data.quests, now) : data;
    setFamily(buildFamilyNpcs(current.members, userId), toFamilyTownStatus(current));
  }, [data, now, setFamily, userId]);
}
