import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_CURRENT_USER, MOCK_QUESTS } from "../constants/mockData";
import type { QuestCategory } from "../types";
import TaskDetail from "./tasks/TaskDetail";
import TaskFolderTabs from "./tasks/TaskFolderTabs";
import TaskList from "./tasks/TaskList";
import { taskStyles as styles } from "./tasks/taskStyles";
import { filterQuestsByCategory } from "./tasks/taskUtils";

export default function ChildTasksScreen() {
  const [activeCategory, setActiveCategory] = useState<QuestCategory>("daily");
  const [selectedQuestId, setSelectedQuestId] = useState<string>();

  const visibleQuests = useMemo(
    () => filterQuestsByCategory(MOCK_QUESTS, activeCategory),
    [activeCategory],
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
          <Text style={styles.eyebrow}>QUEST BOARD</Text>
          <Text style={styles.screenTitle}>タスク</Text>
        </View>
        <View accessibilityLabel={`所持ポイント ${MOCK_CURRENT_USER.balance}`} style={styles.wallet}>
          <Text style={styles.walletLabel}>おサイフ</Text>
          <View style={styles.walletRow}>
            <View style={styles.coin}>
              <Text style={styles.coinText}>P</Text>
            </View>
            <Text style={styles.walletValue}>{MOCK_CURRENT_USER.balance.toLocaleString("ja-JP")}</Text>
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
          <TaskDetail quest={selectedQuest} onClose={() => setSelectedQuestId(undefined)} />
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
