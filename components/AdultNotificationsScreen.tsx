import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ERROR_TEXT_CLASS, MUTED_ICON_COLOR, NOTICE_TEXT_CLASS } from "../constants/ui";
import {
  formatNotificationTime,
  NOTIFICATION_FETCH_LIMIT,
  NOTIFICATION_TAB_LABELS,
  type NotificationTab,
} from "../lib/notifications";
import { useFamilyQuestStreaks } from "../lib/useFamilyQuestStreaks";
import { useDataAccess } from "../store";
import LoadingSpinner from "./LoadingSpinner";
import { NOTIFICATION_BOARD_TABS, useNotificationBoard } from "./notifications/useNotificationBoard";
import QuestStreakBoardSection from "./QuestStreakBoardSection";
import ScreenHeader from "./ScreenHeader";

/** タブごとの、お知らせが1件も無いときの文言。 */
const EMPTY_MESSAGES: Record<NotificationTab, string> = {
  read: "既読のお知らせはありません",
  unread: "未読のお知らせはありません",
};

/**
 * 大人用の掲示板（お知らせ一覧）の画面（Issue #354・#441）。
 *
 * 大人ホームのベルと、大人が我が家タウンの掲示板を見たときに開く。子供用は `ChildNotificationsScreen`。
 * 自分あてのお知らせだけが出る（`notifications` は本人の行だけが見える）。
 *
 * お知らせを押すと既読になり、行き先があれば大人用のその画面を開く。
 */
export default function AdultNotificationsScreen() {
  const { canUseRealData } = useDataAccess();
  const board = useNotificationBoard("parent");
  const streaks = useFamilyQuestStreaks();
  const { activeTab, error, showLoading, visible } = board;

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="掲示板" />

      {/* 連続記録はお知らせのタブとは別物なので、タブの上に置く（Issue #355） */}
      <QuestStreakBoardSection entries={streaks.entries} error={streaks.error} />

      <View accessibilityRole="tablist" className="mx-4 mt-1 flex-row rounded-2xl bg-slate-200 p-1">
        {NOTIFICATION_BOARD_TABS.map((tab) => {
          const isActive = tab === activeTab;
          const count = board.countOf(tab);
          return (
            <Pressable
              accessibilityLabel={`${NOTIFICATION_TAB_LABELS[tab]} ${count}件`}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className={`flex-1 items-center rounded-xl py-2 ${isActive ? "bg-white" : ""}`}
              key={tab}
              onPress={() => board.selectTab(tab)}
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

        {board.showMarkAll ? (
          <Pressable
            accessibilityRole="button"
            className="self-end rounded-full bg-white px-4 py-2 active:bg-slate-50"
            onPress={board.markAllRead}
          >
            <Text className="text-xs font-semibold text-blue-600">すべて既読にする</Text>
          </Pressable>
        ) : null}

        {showLoading ? (
          <LoadingSpinner className="items-center justify-center py-16" label="お知らせを読み込み中" />
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
              onPress={() => board.open(notification)}
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

        {board.showLimitNotice ? (
          <Text className={`mt-2 text-center text-xs ${NOTICE_TEXT_CLASS}`}>
            新しい{NOTIFICATION_FETCH_LIMIT}件までを表示しています
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
