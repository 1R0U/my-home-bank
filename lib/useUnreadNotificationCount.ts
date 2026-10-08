import { useCallback, useRef, useState } from "react";
import { useCurrentUser, useDataAccess } from "../store";
import { fetchUnreadNotificationCount } from "./notificationService";
import { createStaleGuard } from "./staleGuard";
import { useRefetchOnFocus } from "./useRefetchOnFocus";

/**
 * 自分あての未読のお知らせの件数だけを取得するフック（Issue #354）。
 *
 * 大人ホームのベルのバッジ用。ホームでは件数しか使わないので、お知らせの一覧
 * （`useNotifications`。最大100件）は取らずに件数だけを数える。
 * 画面へ戻るたびに取り直す（タブの裏で生存し続ける大人ホームでも、件数が古いままにならないように）。
 *
 * **モックアカウント（`canUseRealData` が false）では0のまま。**
 * 取得に失敗したときも0にする（バッジを出さないだけで、ホームは使えるようにする）。
 * @returns 未読の件数
 */
export function useUnreadNotificationCount(): number {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const userId = canUseRealData ? currentUser?.id : undefined;

  const [unreadCount, setUnreadCount] = useState(0);
  // 連続して取り直したとき、先に始めた取得が後から終わって新しい件数を上書きしないようにする
  const guardRef = useRef(createStaleGuard());
  // 件数を最後に取った利用者。変わったときだけ、取り終わるまで0にする（前の利用者の件数を見せないため）
  const loadedForRef = useRef<string | null>(null);

  const reload = useCallback((): Promise<void> => {
    const requestId = guardRef.current.start();
    const owner = userId ?? null;
    const isOwnerChanged = loadedForRef.current !== owner;
    loadedForRef.current = owner;

    if (!userId) {
      setUnreadCount(0);
      return Promise.resolve();
    }
    if (isOwnerChanged) setUnreadCount(0);

    return fetchUnreadNotificationCount(userId)
      .then((count) => {
        if (guardRef.current.isCurrent(requestId)) setUnreadCount(count);
      })
      .catch((e: unknown) => {
        console.warn("未読のお知らせの件数を取得できませんでした", e);
        if (guardRef.current.isCurrent(requestId)) setUnreadCount(0);
      });
  }, [userId]);

  useRefetchOnFocus(reload);

  return unreadCount;
}
