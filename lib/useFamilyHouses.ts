import { useCallback, useEffect, useRef } from "react";
import { MOCK_USERS } from "../constants/mockData";
import { useMapStore } from "../store/mapStore";
import { useCurrentUser, useDataAccess } from "../store";
import { createFamilyHouses, type FamilyHouseMember } from "./rpg-hub/mapObjects";
import { createStaleGuard } from "./staleGuard";
import { fetchFamilyMembers, fetchUserFamilyId } from "./userService";

/**
 * 実データが取れないときに家を建てる相手。
 *
 * 誰の家も建たないと住宅街が更地のままになり、「家に入る」導線ごと無くなってしまう。
 * モックのクエストやストア商品と同じ考え方で、モックの家族を出しておく
 * （`lib/useQuests.ts`）。ログイン中の人は、モックに居なくても必ず1軒持つ。
 * @param currentUser - ログイン中の人（未ログインなら null）
 * @returns 家を建てる相手の一覧
 */
function fallbackMembers(
  currentUser: { id: string; name: string } | null,
): FamilyHouseMember[] {
  const members: FamilyHouseMember[] = currentUser
    ? [{ id: currentUser.id, name: currentUser.name }]
    : [];

  for (const user of MOCK_USERS) {
    if (!members.some((member) => member.id === user.id)) {
      members.push({ id: user.id, name: user.name });
    }
  }
  return members;
}

/**
 * 家族の人数ぶんの家をマップへ反映する。
 *
 * 家は町の固定物ではなく、`users` の行から作る（`createFamilyHouses`）。
 * 取得は2段階で、`useGuildTreasury` と同じ形にしてある。
 *
 * 1. ログイン中の人の `family_id` を引く
 * 2. その家族に所属する人を引く
 *
 * **取れなかったときも住宅街は空にしない。** 家族が未設定（ゲスト起動など）・
 * 取得に失敗した・RLSで1件も見えない、のいずれでもモックの家族を建てる。
 * 家が無いと、着せ替え（姿見）と家の中の「かざる」への入口ごと消えてしまうため。
 */
export function useFamilyHouses(): { reload: () => Promise<void> } {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const setFamilyHouses = useMapStore((state) => state.setFamilyHouses);
  const guardRef = useRef(createStaleGuard());

  const userId = currentUser?.id;
  const userName = currentUser?.name;

  const reload = useCallback((): Promise<void> => {
    // **start() は入口で1回だけ。** .then の中で呼ぶと isCurrent が常に true になる（#147）
    const requestId = guardRef.current.start();
    const displayUser = userId && userName ? { id: userId, name: userName } : null;

    /**
     * 家を建て直す。古い応答なら何もしない。
     * @param members - 家を建てる相手
     */
    const apply = (members: readonly FamilyHouseMember[]) => {
      if (!guardRef.current.isCurrent(requestId)) return;
      setFamilyHouses(createFamilyHouses(members));
    };

    if (!canUseRealData || !userId) {
      apply(fallbackMembers(displayUser));
      return Promise.resolve();
    }

    return fetchUserFamilyId(userId)
      .then((familyId) => {
        // ここでも確認する。切替後に古い取得が解決した場合、結果はどのみち捨てるので、
        // 2ホップ目（家族一覧の取得）を無駄に呼ばずに済む
        if (!guardRef.current.isCurrent(requestId)) return;
        if (!familyId) {
          apply(fallbackMembers(displayUser));
          return;
        }

        return fetchFamilyMembers(familyId).then((members) => {
          apply(members.length > 0 ? members : fallbackMembers(displayUser));
        });
      })
      .catch((e: unknown) => {
        console.warn("家族の取得に失敗しました", e);
        apply(fallbackMembers(displayUser));
      });
  }, [canUseRealData, setFamilyHouses, userId, userName]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { reload };
}
