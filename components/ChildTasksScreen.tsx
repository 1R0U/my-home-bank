import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuests } from "../lib/useQuests";
import { useLiveBalance } from "../lib/useLiveBalance";
import { useDataAccess, useDisplayUser } from "../store";
import type { QuestCategory } from "../types";
import TaskDetail from "./tasks/TaskDetail";
import TaskFolderTabs from "./tasks/TaskFolderTabs";
import TaskList from "./tasks/TaskList";
import { taskStyles as styles } from "./tasks/taskStyles";
import { filterQuestsByCategory } from "./tasks/taskUtils";
import { AMOUNT_UNITS, formatAmount } from "../lib/amount";

// boardContentの実測前（初回描画）用のフォールバック高さ
const DETAIL_PANEL_FALLBACK_HEIGHT = 235;
// 詳細パネルが板の上端（フォルダタブ側）まで達しないための隙間
const DETAIL_PANEL_TOP_GAP = 40;
// detailPanelのbottomオフセット(10)に、一覧との隙間を足した分
const DETAIL_PANEL_BOTTOM_MARGIN = 20;

export default function ChildTasksScreen() {
  const [activeCategory, setActiveCategory] = useState<QuestCategory>("daily");
  const [selectedQuestId, setSelectedQuestId] = useState<string>();
  // 詳細パネルの高さはboardContentの実測サイズから決める固定値にし、
  // タスクの説明文の長さで変わらないようにする（開いたまま別のタスクへ
  // 切り替えたときに一覧の下余白と実際の高さがずれる問題を避けるため）
  const [boardContentHeight, setBoardContentHeight] = useState(0);
  const detailPanelHeight = boardContentHeight
    ? Math.max(boardContentHeight - DETAIL_PANEL_TOP_GAP, 160)
    : DETAIL_PANEL_FALLBACK_HEIGHT;
  const { quests, isLive, reload, error: questsError } = useQuests();
  const currentUser = useDisplayUser("child");
  const { canUseRealData: canWriteQuests } = useDataAccess();

  // 所持ポイントは、タスク承認でDB側の残高が変わっても画面に反映されるよう取り直す。
  // 古い応答での上書きと、ユーザー切替直後に前のユーザーの残高を見せてしまう問題は
  // useLiveBalance が引き受ける（Issue #147）。
  const {
    balance: liveBalance,
    hasError: hasBalanceError,
    reload: reloadBalance,
  } = useLiveBalance(currentUser.id, isLive);

  const displayBalance = liveBalance ?? currentUser.balance;

  const visibleQuests = useMemo(
    () => filterQuestsByCategory(quests, activeCategory),
    [quests, activeCategory],
  );
  const selectedQuest = visibleQuests.find((quest) => quest.id === selectedQuestId);

  const changeCategory = (category: QuestCategory) => {
    setActiveCategory(category);
    setSelectedQuestId(undefined);
  };

  const handleActionComplete = () => {
    reload();
    reloadBalance();
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>クエストボード</Text>
          <Text style={styles.screenTitle}>タスク</Text>
        </View>
        <View accessibilityLabel={`所持ポイント ${displayBalance}`} style={styles.wallet}>
          <Text style={styles.walletLabel}>おサイフ</Text>
          <View style={styles.walletRow}>
            <View style={styles.coin}>
              <Text style={styles.coinText}>P</Text>
            </View>
            <Text style={styles.walletValue}>{formatAmount(displayBalance)}</Text>
            <Text style={styles.walletUnit}> {AMOUNT_UNITS.Pt}</Text>
          </View>
          {hasBalanceError ? (
            <Text style={styles.walletErrorNotice}>よみこめません</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.boardFrame}>
        <View style={styles.frameRivetLeft} />
        <View style={styles.frameRivetRight} />
        <TaskFolderTabs activeCategory={activeCategory} onChange={changeCategory} />
        <View
          onLayout={(e) => setBoardContentHeight(e.nativeEvent.layout.height)}
          style={styles.boardContent}
        >
          <ScrollView
            contentContainerStyle={[
              styles.taskScrollContent,
              selectedQuest && {
                paddingBottom: detailPanelHeight + DETAIL_PANEL_BOTTOM_MARGIN,
              },
            ]}
            showsVerticalScrollIndicator={false}
            style={styles.taskScroll}
          >
            {/*
              取得に失敗したことを出す。黙って空の板を見せると、
              本当にタスクが無いのか取れなかったのかが区別できない（Issue #212）。
              一覧そのものは消さない。受注や報告の後の再取得が失敗しただけの場合、
              取得済みの一覧は正しいままで、消すと見る手段がなくなる。
            */}
            {questsError ? (
              <Text style={styles.fetchErrorNotice}>タスクをよみこめませんでした</Text>
            ) : null}
            <TaskList
              onSelect={setSelectedQuestId}
              quests={visibleQuests}
              selectedQuestId={selectedQuestId}
            />
          </ScrollView>
          <TaskDetail
            currentUserId={currentUser.id}
            height={detailPanelHeight}
            isLive={canWriteQuests}
            onActionComplete={handleActionComplete}
            onClose={() => setSelectedQuestId(undefined)}
            quest={selectedQuest}
          />
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityLabel="前の画面に戻る"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
        >
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backText}>戻る</Text>
        </Pressable>

        <Pressable
          accessibilityLabel="タスクとして発行されていない家事を報告"
          accessibilityRole="button"
          onPress={() => router.push("/task-report")}
          style={({ pressed }) => [styles.footerReportButton, pressed && styles.backButtonPressed]}
        >
          <Text style={styles.footerReportButtonText}>報告</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
