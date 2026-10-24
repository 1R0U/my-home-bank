import { useCallback, useEffect, useRef } from "react";
import { useCurrentUser, useDataAccess } from "../store";
import { useMapStore } from "../store/mapStore";
import { fetchHouseFinishes, saveHouseFinishes } from "./houseFinishService";
import { type HouseFinishes, STARTER_HOUSE_FINISHES } from "./rpg-hub/houseFinishes";
import { useResource } from "./useResource";

/**
 * 家の中の壁紙・床板をDBから読み込み、マップへ反映する（Issue #480）。
 *
 * 取得に失敗しても**家は表示する**（最初の壁紙・床板で出るだけ）。
 * 実データを使わないとき（モックアカウント・未ログイン）は、選んだ分を画面の中だけで覚える。
 * @returns 今の壁紙・床板と、保存する関数
 */
export function useHouseFinishes(): { finishes: HouseFinishes; save: (finishes: HouseFinishes) => Promise<void> } {
  const user = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const finishes = useMapStore((state) => state.houseFinishes);
  const setHouseFinishes = useMapStore((state) => state.setHouseFinishes);
  const userId = user?.id;
  const { data, isLive, reload, updateData } = useResource({
    key: canUseRealData && userId ? ["houseFinishes", userId] : null,
    fetcher: () => fetchHouseFinishes(userId as string),
    initialData: STARTER_HOUSE_FINISHES,
    errorMessage: "壁紙と床板を取得できませんでした",
  });

  // 取得した（または利用者が変わって最初の見た目に戻った）壁紙・床板をマップへ反映する
  useEffect(() => {
    setHouseFinishes(data);
  }, [data, setHouseFinishes]);

  // 書き込みを順番に送るための列（useHouseFurnitureLayouts と同じ。続けて選んだとき、
  // 前に選んだほうが後から届いて、最後に選んだものと違う見た目で保存されないように）
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  /**
   * 壁紙・床板を保存する。**保存を待たずに画面へ出し**、書き込みは選んだ順に1つずつ送る。
   * 失敗したときだけDBから読み直して、画面を保存されている状態へ戻す。
   * @param next - 壁紙・床板
   */
  const save = useCallback(
    (next: HouseFinishes): Promise<void> => {
      if (!isLive || !userId) {
        setHouseFinishes(next);
        return Promise.resolve();
      }
      const targetUserId = userId;
      updateData(() => next);
      const write = queueRef.current.then(() => saveHouseFinishes(targetUserId, next));
      queueRef.current = write.catch(() => undefined);
      return write.catch(async (e: unknown) => {
        await queueRef.current;
        await reload();
        throw e;
      });
    },
    [isLive, reload, setHouseFinishes, updateData, userId],
  );

  return { finishes, save };
}
