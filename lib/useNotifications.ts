import { useCallback, useRef } from "react";
import { useCurrentUser, useDataAccess } from "../store";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationsRead,
} from "./notificationService";
import {
  countUnreadNotifications,
  markNotificationsReadLocally,
  type AppNotification,
} from "./notifications";
import { useResource } from "./useResource";

/**
 * 自分あてのお知らせを取得し、既読にする操作をまとめたフック（Issue #354）。
 *
 * 掲示板（通知画面）と、大人ホームのベルの未読バッジから使う。
 * 一覧は新しい順に上限（`NOTIFICATION_FETCH_LIMIT`）までしか取らないため、未読の件数は
 * 一覧から数えず、別に数えて取る（上限を超える未読があっても正しい件数を出すため）。
 * 画面へ戻るたびに取り直す（タブの裏で生存し続ける大人ホームでも、未読数が古いままにならないように）。
 *
 * **モックアカウント（`canUseRealData` が false）では空のまま。** お知らせは本人あての
 * 実データで、見せるものがない。
 *
 * 既読にする操作は、DBの応答を待たずに画面へ反映する（押したお知らせがすぐ「よんだ」へ移る）。
 * そのあと取り直すので、失敗したときはDBの状態へ戻る。
 */
type NotificationsData = { notifications: AppNotification[]; unreadCount: number };

const EMPTY_NOTIFICATIONS: NotificationsData = { notifications: [], unreadCount: 0 };

export function useNotifications() {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const userId = canUseRealData ? currentUser?.id : undefined;

  const { data, error, loading, reload, updateData } = useResource<NotificationsData>({
    errorMessage: "お知らせを取得できませんでした",
    fetcher: async () => {
      const [notifications, unreadCount] = await Promise.all([
        fetchNotifications(userId),
        fetchUnreadNotificationCount(userId),
      ]);
      return { notifications, unreadCount };
    },
    initialData: EMPTY_NOTIFICATIONS,
    key: userId ? ["notifications", userId] : null,
  });
  // いまの利用者。既読にする処理の途中で利用者が切り替わったかを、処理の後で確かめるために持つ
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  /**
   * お知らせを既読にする。
   * @param ids - 既読にするid。null なら未読すべて
   */
  const markRead = useCallback(
    async (ids: readonly string[] | null): Promise<void> => {
      if (!userId) return;
      const startedFor = userId;
      updateData((current) => {
        const marked = markNotificationsReadLocally(current.notifications, ids, new Date().toISOString());
        const newlyRead = countUnreadNotifications(current.notifications) - countUnreadNotifications(marked);
        // 「すべて既読」は一覧に載っていない古い未読も既読にするので、件数は0にする
        const unreadCount = ids === null ? 0 : Math.max(0, current.unreadCount - newlyRead);
        return { notifications: marked, unreadCount };
      });
      try {
        await markNotificationsRead(ids);
      } catch (e: unknown) {
        console.warn("お知らせを既読にできませんでした", e);
      }
      // 待っている間に利用者が切り替わっていたら取り直さない
      if (userIdRef.current !== startedFor) return;
      // 成功しても取り直す。既読にする前に始まっていた取得（画面へ戻ったときの取り直しなど）が
      // 後から終わると、未読のままの古い一覧で上書きされるため、それより新しい取得で上書きし返す。
      // 失敗したときは、これでDBの状態（未読）へ戻る。
      await reload();
    },
    [reload, updateData, userId],
  );

  return {
    error,
    loading,
    markRead,
    notifications: data.notifications,
    reload,
    unreadCount: data.unreadCount,
  };
}
