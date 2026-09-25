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
 * @returns 選び直す関数と、取り直す関数
 */
export function useCharacterAppearance(): {
  reload: () => Promise<void>;
  select: (characterType: CharacterType) => Promise<void>;
} {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const setCharacterType = useAppearanceStore((state) => state.setCharacterType);
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
      if (guardRef.current.isCurrent(requestId)) setCharacterType(DEFAULT_CHARACTER_TYPE);
      return Promise.resolve();
    }

    return fetchCharacterType(userId)
      .then((characterType) => {
        if (guardRef.current.isCurrent(requestId)) setCharacterType(characterType);
      })
      .catch((e: unknown) => {
        console.warn("キャラクターの種類の取得に失敗しました", e);
        // 取れなかったときは既定に戻す。前のユーザーの種類が残るより、出ないほうがよい
        if (guardRef.current.isCurrent(requestId)) setCharacterType(DEFAULT_CHARACTER_TYPE);
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

  // ユーザーが変わったら、取得を待たずに前の人の種類を消す（#147と同じ形）。
  // このフックは複数箇所（RpgHubScreen・CharacterSelectScreen）から呼ばれるため、
  // 同じ利用者のまま別の画面がマウントされただけでは消さない（利用者IDが実際に
  // 変わったときだけ消す）。
  const previousUserIdRef = useRef(userId);
  useEffect(() => {
    if (previousUserIdRef.current === userId) return;
    previousUserIdRef.current = userId;
    setCharacterType(DEFAULT_CHARACTER_TYPE);
  }, [setCharacterType, userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { reload, select };
}
