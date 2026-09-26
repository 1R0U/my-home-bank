import { useCallback, useEffect, useRef } from "react";
import { fetchCharacterPalette, savePaletteColor } from "./characterAppearanceService";
import { createStaleGuard } from "./staleGuard";
import { useAppearanceStore } from "../store/appearanceStore";
import { useCurrentUser, useDataAccess } from "../store";
import type { PaletteSlot } from "../types/map";

/**
 * 選んでいる色（3枠）をDBから読み込み、見た目の状態へ反映する（Issue #253）。
 *
 * `useWardrobe` と同じ作り。取得に失敗しても**町とキャラクターは表示する**。
 * 色が既定のままになるだけで、遊べなくなるほうが困るため。
 *
 * **モックアカウント（`canUseRealData` が false）では既定の色のままにする。**
 * 書き込みができないので選べない。
 *
 * 色はWebViewへ postMessage（`createSetPlayerPaletteIntent`）で送るだけで、
 * `characterType` と違いシーンの作り直しを伴わない。そのため `useCharacterAppearance`
 * のような「読み込み済みか」の管理は不要（RpgHubScreenは待たずに描いてよい）。
 *
 * @returns 選び直す関数と、取り直す関数
 */
export function useCharacterPalette(): {
  reload: () => Promise<void>;
  select: (slot: PaletteSlot, color: string) => Promise<void>;
} {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const setPalette = useAppearanceStore((state) => state.setPalette);
  const guardRef = useRef(createStaleGuard());

  const userId = currentUser?.id;

  // 保存の完了を待っているあいだに誰へ切り替わったかを見るための、いまの利用者。
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const reload = useCallback((): Promise<void> => {
    // **start() は入口で1回だけ。** .then の中で呼ぶと isCurrent が常に true になる（#147）
    const requestId = guardRef.current.start();

    if (!canUseRealData || !userId) {
      if (guardRef.current.isCurrent(requestId)) setPalette({});
      return Promise.resolve();
    }

    return fetchCharacterPalette(userId)
      .then((palette) => {
        if (guardRef.current.isCurrent(requestId)) setPalette(palette);
      })
      .catch((e: unknown) => {
        console.warn("キャラクターの色の取得に失敗しました", e);
        // 取れなかったときは既定に戻す。前のユーザーの色が残るより、出ないほうがよい
        if (guardRef.current.isCurrent(requestId)) setPalette({});
      });
  }, [canUseRealData, setPalette, userId]);

  /**
   * 1つの枠の色を選び直す。書き込んでから読み直す。
   * @param slot - 選び直す枠
   * @param color - 選ぶ色
   */
  const select = useCallback(
    async (slot: PaletteSlot, color: string): Promise<void> => {
      if (!canUseRealData || !userId) return;
      const targetUserId = userId;
      await savePaletteColor(targetUserId, slot, color);

      // 保存中に人が変わっていたら読み直さない（#147と同じ形）
      if (userIdRef.current !== targetUserId) return;
      await reload();
    },
    [canUseRealData, reload, userId],
  );

  // ユーザーが変わったら、取得を待たずに前の人の色を消す（#147と同じ形）。
  // このフックは複数箇所（RpgHubScreen・色を選ぶ画面）から呼ばれるため、
  // 同じ利用者のまま別の画面がマウントされただけでは消さない（利用者IDが実際に
  // 変わったときだけ消す。lib/useWardrobe.ts にある同種のマウント起因のバグは踏まない）。
  const previousUserIdRef = useRef(userId);
  useEffect(() => {
    if (previousUserIdRef.current === userId) return;
    previousUserIdRef.current = userId;
    setPalette({});
  }, [setPalette, userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { reload, select };
}
