import { useCallback, useEffect, useRef } from "react";
import { fetchCharacterPalette, savePaletteColor } from "./characterAppearanceService";
import { createStaleGuard } from "./staleGuard";
import { useAppearanceStore } from "../store/appearanceStore";
import { useCurrentUser, useDataAccess } from "../store";
import type { PaletteSlot } from "../types/map";

/**
 * 取得・保存の世代カウンタ。**モジュール単位で1つだけ持ち、フックのインスタンスごとには
 * 持たない**（PR #296レビュー対応）。
 *
 * このフックは複数箇所（RpgHubScreen・色を選ぶ画面）から呼ばれ、それぞれ別々に
 * `reload()` を実行しうる。インスタンスごとに `useRef` で持つと、片方のインスタンスの
 * 遅い取得が、もう片方のインスタンスの保存より後に完了したときにそれを検知できず、
 * 保存した色が古い取得結果で上書きされてしまう。モジュール単位にすることで、
 * どのインスタンスの `reload`/`select` も同じ世代を共有し、新しい方が古い方を
 * 確実に無効化できる。
 */
const sharedGuard = createStaleGuard();

/**
 * 選んでいる色（3枠）をDBから読み込み、見た目の状態へ反映する（Issue #253）。
 *
 * `useWardrobe` と同じ作り。取得に失敗しても**町とキャラクターは表示する**。
 * 色が既定のままになるだけで、遊べなくなるほうが困るため。
 *
 * **モックアカウント（`canUseRealData` が false）では既定の色のままにする。**
 * 書き込みができないので選べない。
 *
 * **`isReady` になるまで、呼び出し側は `palette` を3Dシーンへ送らないこと
 * （PR #296レビュー対応）。** このフックは複数箇所から呼ばれるため、単に
 * 「利用者が変わったら消す」effectだけでは、①切り替え直後の一瞬前の利用者の色が
 * 残る、②前の利用者の画面が既に無い状態で新規マウントする場合は消すべき色を
 * 検知できない、という2つの穴がある。`characterType`（#287）と同じく、ストア側に
 * 「どの利用者について確定済みか」（`paletteLoadedFor`）を持たせて解決する。
 *
 * @returns 読み込み済みか、選び直す関数、取り直す関数
 */
export function useCharacterPalette(): {
  isReady: boolean;
  reload: () => Promise<void>;
  select: (slot: PaletteSlot, color: string) => Promise<void>;
} {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const setPalette = useAppearanceStore((state) => state.setPalette);
  const loadedFor = useAppearanceStore((state) => state.paletteLoadedFor);

  const userId = currentUser?.id;
  const targetLoadedFor = canUseRealData && userId ? userId : null;
  const isReady = loadedFor === targetLoadedFor;

  // 保存の完了を待っているあいだに誰へ切り替わったかを見るための、いまの利用者。
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const reload = useCallback((): Promise<void> => {
    // **start() は入口で1回だけ。** .then の中で呼ぶと isCurrent が常に true になる（#147）
    const requestId = sharedGuard.start();

    if (!canUseRealData || !userId) {
      if (sharedGuard.isCurrent(requestId)) setPalette({}, null);
      return Promise.resolve();
    }

    return fetchCharacterPalette(userId)
      .then((palette) => {
        if (sharedGuard.isCurrent(requestId)) setPalette(palette, userId);
      })
      .catch((e: unknown) => {
        console.warn("キャラクターの色の取得に失敗しました", e);
        // 取れなかったときも、この利用者について確定済み（既定）として扱う。
        // そうしないと isReady が永久に立たない
        if (sharedGuard.isCurrent(requestId)) setPalette({}, userId);
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

      // 保存中に人が変わっていたら読み直さない（#147と同じ形）。
      // sharedGuard はモジュール単位で全インスタンス共有のため、ここで確かめずに
      // reload するとその世代を消費してしまい、切り替え先の人の取得が誤って
      // 「古い」と判定されるおそれがある。
      if (userIdRef.current !== targetUserId) return;
      await reload();
    },
    [canUseRealData, reload, userId],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  return { isReady, reload, select };
}
