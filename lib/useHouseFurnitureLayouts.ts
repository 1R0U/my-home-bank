import { useCallback, useEffect, useRef } from "react";
import { useCurrentUser, useDataAccess } from "../store";
import { useMapStore } from "../store/mapStore";
import { fetchHouseFurnitureLayouts, saveHouseFurnitureLayout } from "./houseFurnitureService";
import type { HouseFurnitureLayout } from "./rpg-hub/houseFurniture";
import { useResource } from "./useResource";

const EMPTY: HouseFurnitureLayout[] = [];

/**
 * 一覧のうち1つの家具の位置と向きを差し替えた一覧を返す（無ければ足す）。
 * @param layouts - 今の一覧
 * @param layout - 差し替える家具
 * @returns 新しい一覧
 */
function upsertLayout(layouts: readonly HouseFurnitureLayout[], layout: HouseFurnitureLayout): HouseFurnitureLayout[] {
  return [...layouts.filter((item) => item.furnitureId !== layout.furnitureId), layout];
}

/**
 * 家の中の家具の位置と向きをDBから読み込み、マップへ反映する（Issue #477）。
 *
 * 取得に失敗しても**家は表示する**（家具が最初の位置に出るだけ）。
 * 実データを使わないとき（モックアカウント・未ログイン）は、動かした分を画面の中だけで覚える。
 * @returns 家具の位置と向きを保存する関数
 */
export function useHouseFurnitureLayouts(): { save: (layout: HouseFurnitureLayout) => Promise<void> } {
  const user = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const setFurnitureLayouts = useMapStore((state) => state.setFurnitureLayouts);
  const userId = user?.id;
  const { data, isLive, reload, updateData } = useResource({
    key: canUseRealData && userId ? ["houseFurnitureLayouts", userId] : null,
    fetcher: () => fetchHouseFurnitureLayouts(userId as string),
    initialData: EMPTY,
    errorMessage: "家具の配置を取得できませんでした",
  });

  // 取得した（または利用者が変わって空になった）配置をマップへ反映する
  useEffect(() => {
    setFurnitureLayouts(data);
  }, [data, setFurnitureLayouts]);

  // 書き込みを順番に送るための列。「まわす」を続けて押すと書き込みが重なり、
  // 後から送った向きより先に前の向きが届くと、最後に押した向きと違う向きで保存されてしまう
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  /**
   * 家具の位置と向きを保存する。**保存を待たずに画面へ出し**、書き込みは押した順に1つずつ送る。
   * 失敗したときだけDBから読み直して、画面を保存されている状態へ戻す（usePlacedDecorations の update と同じ）。
   * @param layout - 位置と向き
   */
  const save = useCallback(
    (layout: HouseFurnitureLayout): Promise<void> => {
      if (!isLive || !userId) {
        // 実データを使わないときは、画面の中だけで動かす
        setFurnitureLayouts(upsertLayout(useMapStore.getState().furnitureLayouts, layout));
        return Promise.resolve();
      }
      const targetUserId = userId;
      updateData((current) => upsertLayout(current, layout));
      const write = queueRef.current.then(() => saveHouseFurnitureLayout(targetUserId, layout));
      // 失敗しても次の書き込みは送れるよう、列には失敗を残さない
      queueRef.current = write.catch(() => undefined);
      return write.catch(async (e: unknown) => {
        await reload();
        throw e;
      });
    },
    [isLive, reload, setFurnitureLayouts, updateData, userId],
  );

  return { save };
}
