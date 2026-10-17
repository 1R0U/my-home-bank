import { router } from "expo-router";
import { useMemo, useState } from "react";
import { playSoundEffect } from "../../lib/audio";
import { splitNotificationsByTab, type AppNotification, type NotificationTab } from "../../lib/notifications";
import { MAP_ROUTES_BY_ROLE } from "../../lib/rpg-hub/routes";
import { useNotifications } from "../../lib/useNotifications";
import { useTravelArrival } from "../../lib/useTravelArrival";
import type { UserRole } from "../../types";

/** 掲示板のタブの並び。 */
export const NOTIFICATION_BOARD_TABS: NotificationTab[] = ["unread", "read"];

/**
 * 掲示板（お知らせ一覧）の画面の動き（Issue #354・#441）。
 *
 * 大人用（`AdultNotificationsScreen`）と子供用（`ChildNotificationsScreen`）は見た目だけが違い、
 * タブの切り替え・既読にする操作・押したときの遷移はここで共通にする。
 *
 * 押したお知らせの行き先は、町の建物と同じ「何の建物か」から、その画面のロール用の画面へ向ける
 * （大人と子供でタスク・ストアの画面が違う）。画面がロールごとに分かれているので、
 * いまのロールではなく画面のロールで決める。
 * @param role - この掲示板を使う人のロール
 * @returns 画面に出すものと、押したときの操作
 */
export function useNotificationBoard(role: UserRole) {
  const { error, loading, markRead, notifications, unreadCount } = useNotifications();
  const [activeTab, setActiveTab] = useState<NotificationTab>("unread");

  const byTab = useMemo(() => splitNotificationsByTab(notifications), [notifications]);
  const showLoading = loading && notifications.length === 0;
  // 我が家タウンから入ってきたときは、読み込み中の間「いどうちゅう」の画面を出しておく（Issue #261）
  useTravelArrival(!showLoading);

  return {
    activeTab,
    error,
    /** タブごとの件数。未読は一覧の上限を超えていても正しい件数を出す（一覧には新しい順に上限までしか載らない） */
    countOf: (tab: NotificationTab) => (tab === "unread" ? unreadCount : byTab[tab].length),
    /** 一覧は新しい順に上限までしか取らないので、未読が上限を超えると並ぶ件数が少なくなる。残りが消えたように見えないよう知らせる */
    showLimitNotice: activeTab === "unread" && unreadCount > byTab.unread.length,
    showLoading,
    /** 「すべて既読にする」を出すか */
    showMarkAll: activeTab === "unread" && unreadCount > 0,
    visible: byTab[activeTab],
    markAllRead: () => {
      playSoundEffect("confirm");
      void markRead(null);
    },
    open: (notification: AppNotification) => {
      playSoundEffect("board");
      if (notification.read_at === null) void markRead([notification.id]);
      if (notification.route) router.push(MAP_ROUTES_BY_ROLE[role][notification.route]);
    },
    selectTab: (tab: NotificationTab) => {
      if (tab !== activeTab) playSoundEffect("board");
      setActiveTab(tab);
    },
  };
}
