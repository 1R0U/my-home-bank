import { useCallback, useEffect, useRef } from "react";
import {
  deletePlacedDecoration,
  fetchPlacedDecorations,
  insertPlacedDecoration,
} from "./decorationService";
import { PLACED_ID_PREFIX, toPlacedDecorations } from "./rpg-hub/placedDecorations";
import { createStaleGuard } from "./staleGuard";
import { useMapStore } from "../store/mapStore";
import { useCurrentUser, useDataAccess } from "../store";

/**
 * 置いた装飾をDBから読み込み、マップへ反映する（Issue #223）。
 *
 * 取得に失敗したり、行が壊れていたりしても**町は表示する**。
 * 装飾が出ないだけで、建物へ行けなくなるほうが困るため。
 *
 * @returns 置く・しまう・取り直す関数
 */
export function usePlacedDecorations(): {
  place: (decoration: {
    assetId: string;
    rotationY: number;
    scale: number;
    x: number;
    z: number;
  }) => Promise<void>;
  reload: () => Promise<void>;
  remove: (objectId: string) => Promise<void>;
} {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const setPlacedDecorations = useMapStore((state) => state.setPlacedDecorations);
  const guardRef = useRef(createStaleGuard());

  const userId = currentUser?.id;

  // 書き込みの完了を待っているあいだに誰へ切り替わったかを見るための、いまの利用者。
  // 書き込み側のクロージャが持つ `userId` は呼び出し時点のもので、切替後も古いまま
  // （#222 で同じ形の競合を踏んでいる）。
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

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

  /**
   * 書き込んだあと、まだ同じ人なら読み直す。
   *
   * 待っているあいだに人が変わっていたら読み直さない。読み直すと `createStaleGuard` の
   * 「最後に始めた取得が最新」に乗ってしまい、切り替えた先の人の庭へ前の人の装飾が
   * 入る（#222 で踏んだのと同じ形）。
   * @param write - 実際の書き込み
   */
  const writeThenReload = useCallback(
    async (write: (id: string) => Promise<void>): Promise<void> => {
      if (!canUseRealData || !userId) return;
      const targetUserId = userId;
      await write(targetUserId);
      if (userIdRef.current !== targetUserId) return;
      await reload();
    },
    [canUseRealData, reload, userId],
  );

  /**
   * 装飾を1つ置く。
   * @param decoration - 置くもの
   */
  const place = useCallback(
    (decoration: { assetId: string; rotationY: number; scale: number; x: number; z: number }) =>
      writeThenReload((id) => insertPlacedDecoration(id, decoration)),
    [writeThenReload],
  );

  /**
   * 置いた装飾を1つしまう。
   * @param objectId - マップ上のオブジェクトid（`placed-` 付き）
   */
  const remove = useCallback(
    (objectId: string) =>
      writeThenReload((id) =>
        // マップ上のidは町の固定物とぶつからないよう接頭辞を足してあるので、外して渡す
        deletePlacedDecoration(id, objectId.slice(PLACED_ID_PREFIX.length)),
      ),
    [writeThenReload],
  );

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

  return { place, reload, remove };
}
