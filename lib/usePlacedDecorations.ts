import { useCallback, useEffect, useRef } from "react";
import { fetchPlacedDecorations } from "./decorationService";
import { toPlacedDecorations } from "./rpg-hub/placedDecorations";
import { createStaleGuard } from "./staleGuard";
import { useMapStore } from "../store/mapStore";
import { useCurrentUser, useDataAccess } from "../store";

/**
 * 置いた装飾をDBから読み込み、マップへ反映する（Issue #223）。
 *
 * 取得に失敗したり、行が壊れていたりしても**町は表示する**。
 * 装飾が出ないだけで、建物へ行けなくなるほうが困るため。
 *
 * @returns 取り直す関数
 */
export function usePlacedDecorations(): { reload: () => Promise<void> } {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const setPlacedDecorations = useMapStore((state) => state.setPlacedDecorations);
  const guardRef = useRef(createStaleGuard());

  const userId = currentUser?.id;

  const reload = useCallback((): Promise<void> => {
    // **start() は入口で1回だけ。** .then の中で呼ぶと isCurrent が常に true になる（#147）
    const requestId = guardRef.current.start();

    if (!canUseRealData || !userId) {
      if (guardRef.current.isCurrent(requestId)) setPlacedDecorations([]);
      return Promise.resolve();
    }

    return fetchPlacedDecorations(userId)
      .then((rows) => {
        if (!guardRef.current.isCurrent(requestId)) return;
        const { errors, objects } = toPlacedDecorations(rows);
        // 壊れた行は捨てて残りを出す。捨てた理由は追えるように残す
        if (errors.length > 0) {
          console.warn("置いた装飾の一部を読み込めませんでした", errors);
        }
        setPlacedDecorations(objects);
      })
      .catch((e: unknown) => {
        console.warn("置いた装飾の取得に失敗しました", e);
        if (!guardRef.current.isCurrent(requestId)) return;
        // 取れなかったときは何も置かれていない状態にする。
        // 前のユーザーの装飾が残るより、出ないほうがよい
        setPlacedDecorations([]);
      });
  }, [canUseRealData, setPlacedDecorations, userId]);

  // **ユーザーが変わったら、取得を待たずに前の人の装飾を消す。**
  // 待つと、切り替え直後のあいだ前の人の庭が見えてしまう（#147 と同じ形）。
  // 同じユーザーのまま取り直すときは消さない。置いた直後の再取得で
  // 庭が一瞬空になるのを避けるため（#216 と同じ考え方）。
  useEffect(() => {
    setPlacedDecorations([]);
  }, [setPlacedDecorations, userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { reload };
}
