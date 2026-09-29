import { useCallback, useEffect, useRef } from "react";
import { fetchFamilyTown } from "./familyTownService";
import { buildFamilyNpcs, EMPTY_FAMILY_TOWN_STATUS, toFamilyTownStatus } from "./rpg-hub/familyNpcs";
import { createStaleGuard } from "./staleGuard";
import { useRefetchOnFocus } from "./useRefetchOnFocus";
import { useMapStore } from "../store/mapStore";
import { useCurrentUser, useDataAccess } from "../store";

/**
 * 家族を取得し、我が家タウンにNPCとして立たせる（Issue #255）。
 *
 * **フォーカスが戻るたびに取り直す。** 建物（クエスト・銀行など）から戻ってきたときに、
 * 家族NPCの会話（クエスト数・残高）が古いままにならないようにするため。
 * 見た目が変わっていなければ町は組み直さない（`setFamily` が比べる）。
 *
 * 取得に失敗しても**町とキャラクターは表示する**（`useWardrobe` と同じ考え方）。
 * 失敗したときは前に取れた家族をそのまま残す。
 *
 * **モックアカウント（`canUseRealData` が false）では家族を出さない。** 家族の実データが無いため。
 */
export function useFamilyTown(): void {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const setFamily = useMapStore((state) => state.setFamily);
  const guardRef = useRef(createStaleGuard());

  const userId = currentUser?.id;
  const familyId = currentUser?.family_id;

  const reload = useCallback((): Promise<void> => {
    // **start() は入口で1回だけ。** .then の中で呼ぶと isCurrent が常に true になる（#147）
    const requestId = guardRef.current.start();

    if (!canUseRealData || !userId || !familyId) {
      setFamily([], EMPTY_FAMILY_TOWN_STATUS);
      return Promise.resolve();
    }

    return fetchFamilyTown(familyId)
      .then((summary) => {
        if (!guardRef.current.isCurrent(requestId)) return;
        setFamily(buildFamilyNpcs(summary.members, userId), toFamilyTownStatus(summary));
      })
      .catch((e: unknown) => {
        console.warn("家族の取得に失敗しました", e);
      });
  }, [canUseRealData, familyId, setFamily, userId]);

  // **ユーザーが変わったら、取得を待たずに前の人の家族を消す。**
  // 待つと、切り替え直後のあいだ前の人の家族が町に立ったままになる（#147 と同じ形）。
  useEffect(() => {
    setFamily([], EMPTY_FAMILY_TOWN_STATUS);
  }, [setFamily, userId]);

  useRefetchOnFocus(reload);
}
