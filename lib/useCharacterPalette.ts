import { useCallback, useEffect } from "react";
import { fetchCharacterPalette, savePaletteChanges } from "./characterAppearanceService";
import { createStaleGuard } from "./staleGuard";
import { useAppearanceStore } from "../store/appearanceStore";
import { useAppStore, useCurrentUser, useDataAccess } from "../store";
import { DEFAULT_CHARACTER_TYPE, type CharacterType } from "./rpg-hub/characterTypes";
import type { PaletteChange } from "./rpg-hub/palette";

/**
 * 取得・保存の世代カウンタ。**モジュール単位で1つだけ持ち、フックのインスタンスごとには
 * 持たない**（PR #296レビュー対応）。
 *
 * このフックは複数箇所（RpgHubScreen・更衣室など）から呼ばれ、それぞれ別々に
 * `reload()` を実行しうる。インスタンスごとに `useRef` で持つと、片方のインスタンスの
 * 遅い取得が、もう片方のインスタンスの保存より後に完了したときにそれを検知できず、
 * 保存した色が古い取得結果で上書きされてしまう。モジュール単位にすることで、
 * どのインスタンスの `reload`/`save` も同じ世代を共有し、新しい方が古い方を
 * 確実に無効化できる。
 */
const sharedGuard = createStaleGuard();

/** 非同期処理の間に利用者や選択種類が変わった場合は、その結果を反映しない。 */
function isCurrentPaletteTarget(userId: string, characterType: CharacterType): boolean {
  const appearance = useAppearanceStore.getState();
  return useAppStore.getState().user?.id === userId &&
    appearance.characterTypeLoadedFor === userId && appearance.characterType === characterType;
}

/**
 * 選択中のキャラクター種類の色（3枠）をDBから読み込み、見た目の状態へ反映する。
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
 * 利用者と種類の両方をストアに記録する。選択種類の読み込みを待ってから色を取得し、
 * 「前の種類の色を次の種類に使う」ことも防ぐ。
 *
 * @returns 読み込み済みか、取り直す関数、選び直した色を保存する関数
 */
export function useCharacterPalette(): {
  isReady: boolean;
  reload: () => Promise<void>;
  save: (changes: readonly PaletteChange[]) => Promise<void>;
} {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const setPalette = useAppearanceStore((state) => state.setPalette);
  const loadedFor = useAppearanceStore((state) => state.paletteLoadedFor);
  const loadedCharacterType = useAppearanceStore((state) => state.paletteLoadedCharacterType);
  const characterType = useAppearanceStore((state) => state.characterType);
  const characterTypeLoadedFor = useAppearanceStore((state) => state.characterTypeLoadedFor);

  const userId = currentUser?.id;
  const targetLoadedFor = canUseRealData && userId ? userId : null;
  const targetCharacterType = canUseRealData ? characterType : DEFAULT_CHARACTER_TYPE;
  const isTypeReady = !canUseRealData || characterTypeLoadedFor === userId;
  const isReady = isTypeReady && loadedFor === targetLoadedFor &&
    loadedCharacterType === targetCharacterType;

  const reload = useCallback((): Promise<void> => {
    // 古い画面のコールバックから新しい対象の取得世代を消費しない。
    if (canUseRealData && (!userId || !isTypeReady || !isCurrentPaletteTarget(userId, characterType))) {
      return Promise.resolve();
    }
    // **start() は入口で1回だけ。** .then の中で呼ぶと isCurrent が常に true になる（#147）
    const requestId = sharedGuard.start();

    if (!canUseRealData || !userId) {
      if (sharedGuard.isCurrent(requestId)) setPalette({}, null, DEFAULT_CHARACTER_TYPE);
      return Promise.resolve();
    }

    return fetchCharacterPalette(userId, characterType)
      .then((palette) => {
        if (sharedGuard.isCurrent(requestId) && isCurrentPaletteTarget(userId, characterType)) {
          setPalette(palette, userId, characterType);
        }
      })
      .catch((e: unknown) => {
        console.warn("キャラクターの色の取得に失敗しました", e);
        // 取れなかったときも、この利用者について確定済み（既定）として扱う。
        // そうしないと isReady が永久に立たない
        if (sharedGuard.isCurrent(requestId) && isCurrentPaletteTarget(userId, characterType)) {
          setPalette({}, userId, characterType);
        }
      });
  }, [canUseRealData, characterType, isTypeReady, setPalette, userId]);

  /**
   * 選び直した色をまとめて保存する。書き込んでから読み直す（Issue #381）。
   * @param changes - 変えた枠と色（もとのいろに戻す枠は null）
   */
  const save = useCallback(
    async (changes: readonly PaletteChange[]): Promise<void> => {
      if (!canUseRealData || !userId || !isTypeReady || changes.length === 0 ||
          !isCurrentPaletteTarget(userId, characterType)) return;
      const targetUserId = userId;
      const targetCharacterType = characterType;
      // 保存を始めた時点で古い取得を無効化し、保存待ち中にも色を巻き戻させない。
      sharedGuard.start();
      await savePaletteChanges(targetUserId, targetCharacterType, changes);

      // 保存中に人が変わっていたら読み直さない（#147と同じ形）。
      // sharedGuard はモジュール単位で全インスタンス共有のため、ここで確かめずに
      // reload するとその世代を消費してしまい、切り替え先の人の取得が誤って
      // 「古い」と判定されるおそれがある。
      if (!isCurrentPaletteTarget(targetUserId, targetCharacterType)) return;
      await reload();
    },
    [canUseRealData, characterType, isTypeReady, reload, userId],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  return { isReady, reload, save };
}
