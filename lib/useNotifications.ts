import { useCallback, useMemo, useRef, useState } from "react";
import { useCurrentUser, useDataAccess } from "../store";
import { fetchNotifications, markNotificationsRead } from "./notificationService";
import {
  countUnreadNotifications,
  markNotificationsReadLocally,
  type AppNotification,
} from "./notifications";
import { createStaleGuard } from "./staleGuard";
import { useRefetchOnFocus } from "./useRefetchOnFocus";

/**
 * 自分あてのお知らせを取得し、既読にする操作をまとめたフック（Issue #354）。
 *
 * 掲示板（通知画面）と、大人ホームのベルの未読バッジから使う。
 * 画面へ戻るたびに取り直す（タブの裏で生存し続ける大人ホームでも、未読数が古いままにならないように）。
 *
 * **モックアカウント（`canUseRealData` が false）では空のまま。** お知らせは本人あての
 * 実データで、見せるものがない。
 *
 * 既読にする操作は、DBの応答を待たずに画面へ反映する（押したお知らせがすぐ「よんだ」へ移る）。
 * そのあと取り直すので、失敗したときはDBの状態へ戻る。
 */
export function useNotifications() {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const userId = canUseRealData ? currentUser?.id : undefined;

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(userId !== undefined);
  const [error, setError] = useState<string | null>(null);
  // 連続して取り直したとき、先に始めた取得が後から終わって新しい一覧を上書きしないようにする
  const guardRef = useRef(createStaleGuard());
  // 一覧を最後に取った利用者。変わったときだけ、取り終わるまで一覧を空にする
  // （前の利用者のお知らせを見せないため。lib/useStoreItemRequests.ts と同じ方針）
  const loadedForRef = useRef<string | null>(null);

  const reload = useCallback((): Promise<void> => {
    const requestId = guardRef.current.start();
    const owner = userId ?? null;
    const isOwnerChanged = loadedForRef.current !== owner;
    loadedForRef.current = owner;

    if (!userId) {
      setNotifications([]);
      setLoading(false);
      setError(null);
      return Promise.resolve();
    }

    setLoading(true);
    setError(null);
    if (isOwnerChanged) setNotifications([]);

    return fetchNotifications(userId)
      .then((result) => {
        if (guardRef.current.isCurrent(requestId)) setNotifications(result);
      })
      .catch((e: unknown) => {
        console.warn("お知らせの取得に失敗しました", e);
        if (guardRef.current.isCurrent(requestId)) setError("お知らせを取得できませんでした");
      })
      .finally(() => {
        if (guardRef.current.isCurrent(requestId)) setLoading(false);
      });
  }, [userId]);

  useRefetchOnFocus(reload);

  /**
   * お知らせを既読にする。
   * @param ids - 既読にするid。null なら未読すべて
   */
  const markRead = useCallback(
    async (ids: readonly string[] | null): Promise<void> => {
      if (!userId) return;
      setNotifications((current) =>
        markNotificationsReadLocally(current, ids, new Date().toISOString()),
      );
      try {
        await markNotificationsRead(ids);
      } catch (e: unknown) {
        console.warn("お知らせを既読にできませんでした", e);
      }
      // 成功しても取り直す。既読にする前に始まっていた取得（画面へ戻ったときの取り直しなど）が
      // 後から終わると、未読のままの古い一覧で上書きされるため、それより新しい取得で上書きし返す。
      // 失敗したときは、これでDBの状態（未読）へ戻る。
      await reload();
    },
    [reload, userId],
  );

  const unreadCount = useMemo(() => countUnreadNotifications(notifications), [notifications]);

  return { error, loading, markRead, notifications, reload, unreadCount };
}
