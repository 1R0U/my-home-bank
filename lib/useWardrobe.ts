import { useCallback, useEffect, useRef } from "react";
import { fetchEquippedItems, fetchOwnedItems, saveEquippedItem } from "./wardrobeService";
import { toEquipment, toOwnedWearables } from "./rpg-hub/wardrobe";
import { DEFAULT_PLAYER_EQUIPMENT } from "./rpg-hub/equipment";
import { createStaleGuard } from "./staleGuard";
import { useWardrobeStore } from "../store/wardrobeStore";
import { useCurrentUser, useDataAccess } from "../store";
import type { EquipmentSlot } from "../types/map";

/**
 * 所有と装備をDBから読み込み、着せ替えの状態へ反映する（Issue #222）。
 *
 * 取得に失敗しても**町とキャラクターは表示する**。着せ替えが出ないだけで、
 * 遊べなくなるほうが困るため（#223 と同じ考え方）。
 *
 * **モックアカウント（`canUseRealData` が false）では既定の装備を着せる。**
 * 書き込みができないので着替えられないが、何も着ていないカエルが出るより、
 * 他の画面がモック値に戻るのと同じ見え方にそろえたほうが分かりやすい。
 *
 * @returns 着け替える関数と、取り直す関数
 */
export function useWardrobe(): {
  equip: (slot: EquipmentSlot, assetId: string | null) => Promise<void>;
  reload: () => Promise<void>;
} {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const setWardrobe = useWardrobeStore((state) => state.setWardrobe);
  const guardRef = useRef(createStaleGuard());

  const userId = currentUser?.id;

  const reload = useCallback((): Promise<void> => {
    // **start() は入口で1回だけ。** .then の中で呼ぶと isCurrent が常に true になる（#147）
    const requestId = guardRef.current.start();

    if (!canUseRealData || !userId) {
      // 持ちものは空にする。買えないし脱げないので、選ばせる意味がない
      if (guardRef.current.isCurrent(requestId)) setWardrobe([], DEFAULT_PLAYER_EQUIPMENT);
      return Promise.resolve();
    }

    return Promise.all([fetchOwnedItems(userId), fetchEquippedItems(userId)])
      .then((results) => {
        if (!guardRef.current.isCurrent(requestId)) return;
        const owned = toOwnedWearables(results[0]);
        const equipped = toEquipment(results[1], owned.assetIds);
        // カタログから消えたIDなどは捨てて残りを出す。捨てた理由は追えるように残す
        const errors = [...owned.errors, ...equipped.errors];
        if (errors.length > 0) {
          console.warn("着せ替えの一部を読み込めませんでした", errors);
        }
        setWardrobe(owned.assetIds, equipped.equipment);
      })
      .catch((e: unknown) => {
        console.warn("着せ替えの取得に失敗しました", e);
        if (!guardRef.current.isCurrent(requestId)) return;
        // 取れなかったときは何も着ていない状態にする。
        // 前のユーザーの装備が残るより、出ないほうがよい
        setWardrobe([], {});
      });
  }, [canUseRealData, setWardrobe, userId]);

  /**
   * 1つの枠を着け替える。書き込んでから読み直す。
   *
   * 先に画面を書き換えないのは、DB側が拒否したとき（持っていないものなど）に
   * 画面とDBがずれたままになるため。着せ替えは待たされても困らない。
   * @param slot - 着け替える枠
   * @param assetId - 着けるもの。脱ぐ場合は null
   */
  const equip = useCallback(
    async (slot: EquipmentSlot, assetId: string | null): Promise<void> => {
      if (!canUseRealData || !userId) return;
      await saveEquippedItem(userId, slot, assetId);
      await reload();
    },
    [canUseRealData, reload, userId],
  );

  // **ユーザーが変わったら、取得を待たずに前の人の装備を消す。**
  // 待つと、切り替え直後のあいだ前の人の帽子が見えてしまう（#147 と同じ形）。
  // 同じユーザーのまま取り直すときは消さない。着け替え直後の再取得で
  // 一瞬裸になるのを避けるため（#216 と同じ考え方）。
  useEffect(() => {
    setWardrobe([], {});
  }, [setWardrobe, userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { equip, reload };
}
