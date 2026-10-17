import { Stack, router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { playSoundEffect } from "../lib/audio";
import { NOTIFICATION_FETCH_LIMIT, NOTIFICATION_TAB_LABELS, type NotificationTab } from "../lib/notifications";
import { useFamilyQuestStreaks } from "../lib/useFamilyQuestStreaks";
import { useDataAccess } from "../store";
import { CHILD_THEME } from "./childTheme";
import Furigana from "./Furigana";
import ChildStreakNote from "./notifications/ChildStreakNote";
import NoticeBoardNote from "./notifications/NoticeBoardNote";
import { NOTICE_BOARD_COLORS, noticeBoardStyles as styles } from "./notifications/noticeBoardStyles";
import { NOTIFICATION_BOARD_TABS, useNotificationBoard } from "./notifications/useNotificationBoard";
import TutorialPressable from "./tutorial/TutorialPressable";

/** タブの見出し（ふりがな付き）。読み上げは `NOTIFICATION_TAB_LABELS` と同じ言葉にする */
const TAB_FURIGANA: Record<NotificationTab, string> = {
  read: "{既読|きどく}",
  unread: "{未読|みどく}",
};

/** タブごとの、お知らせが1件も無いときの文言。 */
const EMPTY_MESSAGES: Record<NotificationTab, string> = {
  read: "{既読|きどく}のお{知|し}らせはないよ",
  unread: "{未読|みどく}のお{知|し}らせはないよ",
};

/**
 * コルクの粒の位置（%）と大きさ。毎回同じ模様になるよう固定しておく。
 * 飾りなので、読み上げや押す操作の対象にはしない。
 */
const CORK_SPECKS: { left: number; top: number; size: number; light?: boolean }[] = [
  { left: 6, size: 4, top: 4 },
  { left: 22, light: true, size: 5, top: 11 },
  { left: 41, size: 3, top: 7 },
  { left: 63, size: 5, top: 3 },
  { left: 84, light: true, size: 4, top: 9 },
  { left: 12, size: 5, top: 24 },
  { left: 35, light: true, size: 3, top: 30 },
  { left: 57, size: 4, top: 22 },
  { left: 78, size: 3, top: 28 },
  { left: 93, light: true, size: 5, top: 36 },
  { left: 4, light: true, size: 3, top: 47 },
  { left: 27, size: 5, top: 52 },
  { left: 49, size: 4, top: 44 },
  { left: 70, light: true, size: 5, top: 55 },
  { left: 88, size: 3, top: 61 },
  { left: 15, size: 4, top: 71 },
  { left: 38, light: true, size: 4, top: 78 },
  { left: 60, size: 3, top: 69 },
  { left: 81, size: 5, top: 80 },
  { left: 8, light: true, size: 5, top: 90 },
  { left: 30, size: 3, top: 94 },
  { left: 53, light: true, size: 4, top: 88 },
  { left: 74, size: 4, top: 95 },
  { left: 95, size: 3, top: 86 },
];

/**
 * 子供用の掲示板（お知らせ一覧）の画面（Issue #354・#441）。
 *
 * 我が家タウンの広場の掲示板から開く。大人用は `AdultNotificationsScreen`。
 * 木の枠にコルクを張った掲示板に、お知らせを1枚ずつ羊皮紙で画びょう留めした見た目にしている。
 * 自分あてのお知らせだけが出る（`notifications` は本人の行だけが見える）。
 *
 * お知らせを押すと既読になり、行き先があれば子供用のその画面を開く。
 */
export default function ChildNotificationsScreen() {
  const { canUseRealData } = useDataAccess();
  const board = useNotificationBoard("child");
  const streaks = useFamilyQuestStreaks();
  const { activeTab, error, showLoading, visible } = board;
  const unreadCount = board.countOf("unread");

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>TOWN SQUARE</Text>
          <Furigana accessibilityRole="header" noWrap style={styles.screenTitle}>
            {"{掲示板|けいじばん}"}
          </Furigana>
        </View>
        <View accessible accessibilityLabel={`未読のお知らせ ${unreadCount}件`} style={styles.unreadBadge}>
          <Furigana noWrap style={styles.unreadBadgeLabel}>
            {"{未読|みどく}"}
          </Furigana>
          <Text style={styles.unreadBadgeValue}>{unreadCount}</Text>
        </View>
      </View>

      <View style={styles.board}>
        <View style={styles.roof}>
          <View style={styles.titleSign}>
            <Furigana noWrap style={styles.titleSignText}>
              {"お{知|し}らせ"}
            </Furigana>
          </View>
        </View>

        <View style={styles.frame}>
          <View style={[styles.rivet, { left: 4 }]} />
          <View style={[styles.rivet, { right: 4 }]} />

          <View accessibilityRole="tablist" style={styles.tabs}>
            {NOTIFICATION_BOARD_TABS.map((tab) => {
              const isActive = tab === activeTab;
              const count = board.countOf(tab);
              return (
                <Pressable
                  accessibilityLabel={`${NOTIFICATION_TAB_LABELS[tab]} ${count}件`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  key={tab}
                  onPress={() => board.selectTab(tab)}
                  style={[styles.tab, isActive && styles.tabActive]}
                >
                  <Furigana noWrap style={[styles.tabText, isActive && styles.tabTextActive]}>
                    {`${TAB_FURIGANA[tab]}（${count}）`}
                  </Furigana>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.cork}>
            {CORK_SPECKS.map((speck, i) => (
              <View
                importantForAccessibility="no-hide-descendants"
                key={i}
                pointerEvents="none"
                style={[
                  styles.corkSpeck,
                  {
                    backgroundColor: speck.light ? NOTICE_BOARD_COLORS.corkLight : NOTICE_BOARD_COLORS.corkSpeck,
                    height: speck.size,
                    left: `${speck.left}%`,
                    top: `${speck.top}%`,
                    width: speck.size,
                  },
                ]}
              />
            ))}

            <ScrollView contentContainerStyle={styles.corkContent}>
              {/* 連続記録はお知らせのタブとは別物なので、タブの一覧より上に留める（Issue #355） */}
              <ChildStreakNote entries={streaks.entries} error={streaks.error} />

              {!canUseRealData ? (
                <View style={styles.boardMessage}>
                  <Furigana style={styles.boardMessageText}>
                    {"※ プレビュー{中|ちゅう}はお{知|し}らせを{表示|ひょうじ}できません"}
                  </Furigana>
                </View>
              ) : null}

              {error ? (
                <View style={styles.boardMessage}>
                  <Text accessibilityRole="alert" style={styles.errorText}>
                    {error}
                  </Text>
                </View>
              ) : null}

              {board.showMarkAll ? (
                <Pressable
                  accessibilityLabel="すべて既読にする"
                  accessibilityRole="button"
                  onPress={board.markAllRead}
                  style={({ pressed }) => [styles.markAllButton, pressed && styles.pressed]}
                >
                  <Furigana noWrap style={styles.markAllText}>
                    {"すべて{既読|きどく}にする"}
                  </Furigana>
                </Pressable>
              ) : null}

              {showLoading ? (
                <View
                  accessibilityLabel="お知らせを読み込み中"
                  accessibilityRole="progressbar"
                  accessibilityState={{ busy: true }}
                  accessible
                  style={styles.loading}
                  testID="loading-spinner"
                >
                  <ActivityIndicator color={CHILD_THEME.parchment} size="large" />
                </View>
              ) : null}

              {/* 取得に失敗したときは「ないよ」と出さない。0件なのか取れなかったのか区別できなくなる（Issue #212） */}
              {!showLoading && !error && visible.length === 0 ? (
                <View style={styles.emptyNote}>
                  <Furigana style={styles.emptyText}>{EMPTY_MESSAGES[activeTab]}</Furigana>
                </View>
              ) : null}

              {visible.map((notification, index) => (
                <NoticeBoardNote index={index} key={notification.id} notification={notification} onPress={board.open} />
              ))}

              {board.showLimitNotice ? (
                <View style={styles.boardMessage}>
                  <Furigana style={styles.boardMessageText}>
                    {`{新|あたら}しい${NOTIFICATION_FETCH_LIMIT}{件|けん}までを{表示|ひょうじ}しています`}
                  </Furigana>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>

        <View style={styles.legLeft} />
        <View style={styles.legRight} />
      </View>

      <View style={styles.footer}>
        <TutorialPressable tutorialId="child-board-back"
          accessibilityLabel="前の画面に戻る"
          accessibilityRole="button"
          onPress={() => {
            playSoundEffect("cancel");
            router.back();
          }}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backArrow}>‹</Text>
          <Furigana noWrap style={styles.backButtonText}>
            {"{戻|もど}る"}
          </Furigana>
        </TutorialPressable>
      </View>
    </SafeAreaView>
  );
}
