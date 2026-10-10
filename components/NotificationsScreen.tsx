import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ERROR_TEXT_CLASS, MUTED_ICON_COLOR, NOTICE_TEXT_CLASS, UI_COLORS } from "../constants/ui";
import {
  formatNotificationTime,
  NOTIFICATION_FETCH_LIMIT,
  NOTIFICATION_TAB_LABELS,
  splitNotificationsByTab,
  type AppNotification,
  type NotificationTab,
} from "../lib/notifications";
import { resolveMapRoute } from "../lib/rpg-hub/routes";
import { useNotifications } from "../lib/useNotifications";
import { useActiveRole, useDataAccess } from "../store";
import ScreenHeader from "./ScreenHeader";

const TABS: NotificationTab[] = ["unread", "read"];

/** タブごとの、お知らせが1件も無いときの文言。 */
const EMPTY_MESSAGES: Record<NotificationTab, string> = {
  read: "既読のお知らせはありません",
  unread: "未読のお知らせはありません",
};

/**
 * 掲示板（お知らせ一覧）の画面（Issue #354）。
 *
 * 我が家タウンの掲示板と、大人ホームのベルから開く。大人・子供のどちらも同じこの画面で、
 * 自分あてのお知らせだけが出る（`notifications` は本人の行だけが見える）。
 *
 * お知らせを押すと既読になり、行き先があればその画面を開く。行き先の画面は
 * 町の建物と同じく、開く人のロールから決める（大人と子供でタスク・ストアの画面が違う）。
 */
export default function NotificationsScreen() {
  const role = useActiveRole();
  const { canUseRealData } = useDataAccess();
  const { error, loading, markRead, notifications, unreadCount } = useNotifications();
  const [activeTab, setActiveTab] = useState<NotificationTab>("unread");

  const byTab = useMemo(() => splitNotificationsByTab(notifications), [notifications]);
  const visible = byTab[activeTab];
  const showLoading = loading && notifications.length === 0;
  // 一覧は新しい順に上限までしか取らないので、未読が上限を超えると、タブの件数より並ぶ件数が少なくなる。
  // 残りが消えたように見えないよう、未読タブの一覧の下で知らせる
  const showLimitNotice = activeTab === "unread" && unreadCount > byTab.unread.length;

  const handlePress = (notification: AppNotification) => {
    if (notification.read_at === null) void markRead([notification.id]);
    if (notification.route) router.push(resolveMapRoute(notification.route, role));
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="掲示板" />

      <View accessibilityRole="tablist" className="mx-4 mt-1 flex-row rounded-2xl bg-slate-200 p-1">
        {TABS.map((tab) => {
          const isActive = tab === activeTab;
          // 未読は一覧の上限を超えていても正しい件数を出す（一覧には新しい順に上限までしか載らない）
          const count = tab === "unread" ? unreadCount : byTab[tab].length;
          return (
            <Pressable
              accessibilityLabel={`${NOTIFICATION_TAB_LABELS[tab]} ${count}件`}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className={`flex-1 items-center rounded-xl py-2 ${isActive ? "bg-white" : ""}`}
              key={tab}
              onPress={() => setActiveTab(tab)}
            >
              <Text className={`text-sm font-bold ${isActive ? "text-slate-900" : "text-slate-500"}`}>
                {NOTIFICATION_TAB_LABELS[tab]}（{count}）
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-3 px-4 pb-8 pt-4">
        {!canUseRealData ? (
          <Text className={`text-xs ${NOTICE_TEXT_CLASS}`}>
            ※ プレビュー中はお知らせを表示できません
          </Text>
        ) : null}

        {error ? (
          <Text accessibilityRole="alert" className={`text-sm ${ERROR_TEXT_CLASS}`}>
            {error}
          </Text>
        ) : null}

        {activeTab === "unread" && unreadCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            className="self-end rounded-full bg-white px-4 py-2 active:bg-slate-50"
            onPress={() => void markRead(null)}
          >
            <Text className="text-xs font-semibold text-blue-600">すべて既読にする</Text>
          </Pressable>
        ) : null}

        {showLoading ? (
          <ActivityIndicator accessibilityLabel="お知らせを読み込み中" className="mt-6" color={UI_COLORS.blue600} />
        ) : null}

        {/* 取得に失敗したときは「ありません」と出さない。0件なのか取れなかったのか区別できなくなる（Issue #212） */}
        {!showLoading && !error && visible.length === 0 ? (
          <Text className={`mt-6 text-center text-sm ${NOTICE_TEXT_CLASS}`}>{EMPTY_MESSAGES[activeTab]}</Text>
        ) : null}

        {visible.map((notification) => {
          const isUnread = notification.read_at === null;
          return (
            <Pressable
              accessibilityHint={notification.route ? "関係する画面を開きます" : undefined}
              accessibilityLabel={`${isUnread ? "未読。" : ""}${notification.title}`}
              accessibilityRole="button"
              className="flex-row items-center rounded-2xl bg-white px-4 py-4 active:bg-slate-50"
              key={notification.id}
              onPress={() => handlePress(notification)}
            >
              <View className="mr-3 w-2 items-center">
                {isUnread ? <View className="h-2 w-2 rounded-full bg-rose-500" /> : null}
              </View>
              <View className="flex-1 pr-2">
                <Text className={`text-sm text-slate-900 ${isUnread ? "font-bold" : "font-semibold"}`}>
                  {notification.title}
                </Text>
                {notification.body ? (
                  <Text className="mt-1 text-xs text-slate-600">{notification.body}</Text>
                ) : null}
                <Text className="mt-1 text-[11px] text-slate-500">
                  {formatNotificationTime(notification.created_at)}
                </Text>
              </View>
              {notification.route ? (
                <Ionicons color={MUTED_ICON_COLOR} name="chevron-forward" size={20} />
              ) : null}
            </Pressable>
          );
        })}

        {showLimitNotice ? (
          <Text className={`mt-2 text-center text-xs ${NOTICE_TEXT_CLASS}`}>
            新しい{NOTIFICATION_FETCH_LIMIT}件までを表示しています
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
