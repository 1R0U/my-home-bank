import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_CURRENT_USER } from "../constants/mockData";
import { useQuests } from "../lib/useQuests";
import { useCurrentUser } from "../store";
import type { QuestCategory } from "../types";
import TaskDetail from "./tasks/TaskDetail";
import TaskFolderTabs from "./tasks/TaskFolderTabs";
import TaskList from "./tasks/TaskList";
import { taskStyles as styles } from "./tasks/taskStyles";
import { filterQuestsByCategory } from "./tasks/taskUtils";

export default function ChildTasksScreen() {
  const [activeCategory, setActiveCategory] = useState<QuestCategory>("daily");
  const [selectedQuestId, setSelectedQuestId] = useState<string>();
  const { quests, isLive, reload } = useQuests();
  // ライブ接続中は実際にログイン中のユーザーを使う。プレビュー中/未ログイン時のみモックにフォールバックする
  // （フォールバック時は isLive が false になるため、実データへの書き込みには使われない）。
  const loggedInUser = useCurrentUser();
  const currentUser = loggedInUser ?? MOCK_CURRENT_USER;

  const visibleQuests = useMemo(
    () => filterQuestsByCategory(quests, activeCategory),
    [quests, activeCategory],
  );
  const selectedQuest = visibleQuests.find((quest) => quest.id === selectedQuestId);

  const changeCategory = (category: QuestCategory) => {
    setActiveCategory(category);
    setSelectedQuestId(undefined);
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>クエストボード</Text>
          <Text style={styles.screenTitle}>タスク</Text>
        </View>
        <View accessibilityLabel={`所持ポイント ${currentUser.balance}`} style={styles.wallet}>
          <Text style={styles.walletLabel}>おサイフ</Text>
          <View style={styles.walletRow}>
            <View style={styles.coin}>
              <Text style={styles.coinText}>P</Text>
            </View>
            <Text style={styles.walletValue}>{currentUser.balance.toLocaleString("ja-JP")}</Text>
            <Text style={styles.walletUnit}> Pt</Text>
          </View>
        </View>
      </View>

      <View style={styles.boardFrame}>
        <TaskFolderTabs activeCategory={activeCategory} onChange={changeCategory} />
        <View style={styles.boardContent}>
          <ScrollView
            contentContainerStyle={styles.taskScrollContent}
            showsVerticalScrollIndicator={false}
            style={styles.taskScroll}
          >
            <TaskList
              onSelect={setSelectedQuestId}
              quests={visibleQuests}
              selectedQuestId={selectedQuestId}
            />
          </ScrollView>
          <TaskDetail
            currentUserId={currentUser.id}
            isLive={isLive}
            onActionComplete={reload}
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
      </View>
    </SafeAreaView>
  );
}
