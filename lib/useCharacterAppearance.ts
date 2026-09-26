import { useCallback, useEffect, useRef } from "react";
import { fetchCharacterType, saveCharacterType } from "./characterAppearanceService";
import { createStaleGuard } from "./staleGuard";
import { useAppearanceStore } from "../store/appearanceStore";
import { useCurrentUser, useDataAccess } from "../store";
import { DEFAULT_CHARACTER_TYPE, type CharacterType } from "./rpg-hub/characterTypes";

/**
 * 選んでいるキャラクターの種類をDBから読み込み、見た目の状態へ反映する（Issue #287）。
 *
 * `useWardrobe` と同じ作り。取得に失敗しても**町とキャラクターは表示する**。
 * 種類が既定（カエル）のままになるだけで、遊べなくなるほうが困るため。
 *
 * **モックアカウント（`canUseRealData` が false）では既定の種類のままにする。**
 * 書き込みができないので選べない。
 *
 * **`isReady` になるまで、呼び出し側は `characterType` を使わないこと（PR #290レビュー対応）。**
 * このフックは `RpgHubScreen`・`CharacterSelectScreen` の複数箇所から呼ばれる。
 * 取得中は共有ストアの `characterType` が既定（カエル）のままなので、`isReady` を見ずに
 * 使うと次の2つの問題が起きる。
 *   - 取得が終わる前にシーンを作ってしまい、既定→本来の種類で2回シーンを作り直す
 *   - 利用者を切り替えた直後、前の利用者の種類のままシーンを作ってしまう
 * `RpgHubScreen` は `isReady` が立つまで `RpgHubWebView` を描かない（読み込み中の表示を出す）。
 *
 * @returns 読み込み済みか、選び直す関数、取り直す関数
 */
export function useCharacterAppearance(): {
  isReady: boolean;
  reload: () => Promise<void>;
  select: (characterType: CharacterType) => Promise<void>;
} {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const setCharacterType = useAppearanceStore((state) => state.setCharacterType);
  const loadedFor = useAppearanceStore((state) => state.characterTypeLoadedFor);
  const guardRef = useRef(createStaleGuard());

  const userId = currentUser?.id;
  // 実データを読まない（未ログイン・モック）ときは、利用者に紐づかない既定値として
  // null を対象にする。fetchCharacterType 自体を呼ばないため、その場で確定している。
  const targetLoadedFor = canUseRealData && userId ? userId : null;
  const isReady = loadedFor === targetLoadedFor;

  // 保存の完了を待っているあいだに誰へ切り替わったかを見るための、いまの利用者。
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const reload = useCallback((): Promise<void> => {
    // **start() は入口で1回だけ。** .then の中で呼ぶと isCurrent が常に true になる（#147）
    const requestId = guardRef.current.start();

    if (!canUseRealData || !userId) {
      if (guardRef.current.isCurrent(requestId)) setCharacterType(DEFAULT_CHARACTER_TYPE, null);
      return Promise.resolve();
    }

    return fetchCharacterType(userId)
      .then((characterType) => {
        if (guardRef.current.isCurrent(requestId)) setCharacterType(characterType, userId);
      })
      .catch((e: unknown) => {
        console.warn("キャラクターの種類の取得に失敗しました", e);
        // 取れなかったときも、この利用者について確定済み（既定）として扱う。
        // そうしないと isReady が永久に立たず、町へ入れなくなる。
        if (guardRef.current.isCurrent(requestId)) setCharacterType(DEFAULT_CHARACTER_TYPE, userId);
      });
  }, [canUseRealData, setCharacterType, userId]);

  /**
   * キャラクターの種類を選び直す。書き込んでから読み直す。
   * @param characterType - 選ぶ種類
   */
  const select = useCallback(
    async (characterType: CharacterType): Promise<void> => {
      if (!canUseRealData || !userId) return;
      const targetUserId = userId;
      await saveCharacterType(targetUserId, characterType);

      // 保存中に人が変わっていたら読み直さない（#147と同じ形）
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
