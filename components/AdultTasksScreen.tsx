import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_QUESTS } from "../constants/mockData";
import type { QuestCategory, QuestStatus } from "../types";
import AdultBottomNav from "./nav/AdultBottomNav";
import ScreenHeader from "./ScreenHeader";
import AdultTaskCreateForm from "./tasks/AdultTaskCreateForm";
import AdultTaskDetail from "./tasks/AdultTaskDetail";
import { QUEST_CATEGORY_LABELS, QUEST_STATUS_LABELS, filterQuestsByCategory } from "./tasks/taskUtils";

// 大人用タスク画面のタブ。承認待ちタスクの確認を最優先にしたいので先頭に置く。
// 日課/週課/限定は子供用と同じ「一覧を眺める」タブ。
type AdultTaskTab = QuestCategory | "approval";

const tabs: AdultTaskTab[] = ["approval", "daily", "weekly", "limited"];

const TAB_LABELS: Record<AdultTaskTab, string> = {
  ...QUEST_CATEGORY_LABELS,
  approval: "承認",
};

const STATUS_STYLES: Record<QuestStatus, { badge: string; text: string }> = {
  open: { badge: "bg-slate-100", text: "text-slate-500" },
  accepted: { badge: "bg-blue-50", text: "text-blue-600" },
  pending: { badge: "bg-amber-100", text: "text-amber-700" },
  completed: { badge: "bg-emerald-50", text: "text-emerald-600" },
};

export default function AdultTasksScreen() {
  const [activeTab, setActiveTab] = useState<AdultTaskTab>("approval");
  const [selectedQuestId, setSelectedQuestId] = useState<string>();
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const pendingCount = useMemo(
    () => MOCK_QUESTS.filter((quest) => quest.status === "pending").length,
    [],
  );

  const visibleQuests = useMemo(() => {
    if (activeTab === "approval") {
      return MOCK_QUESTS.filter((quest) => quest.status === "pending");
    }
    return filterQuestsByCategory(MOCK_QUESTS, activeTab);
  }, [activeTab]);
  const selectedQuest = visibleQuests.find((quest) => quest.id === selectedQuestId);

  const changeTab = (tab: AdultTaskTab) => {
    setActiveTab(tab);
    setSelectedQuestId(undefined);
    setIsCreatingTask(false);
  };

  const openCreateTask = () => {
    setIsCreatingTask(true);
    setSelectedQuestId(undefined);
  };

  const selectQuest = (questId: string) => {
    setSelectedQuestId(questId);
    setIsCreatingTask(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScreenHeader title="タスク管理" />

      <View accessibilityRole="tablist" className="flex-row gap-2 px-4 pb-3">
        {tabs.map((tab) => {
          const isActive = tab === activeTab;
          const label =
            tab === "approval" && pendingCount > 0
              ? `${TAB_LABELS[tab]} (${pendingCount})`
              : TAB_LABELS[tab];

          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className={`flex-1 items-center rounded-full py-2 ${isActive ? "bg-slate-900" : "bg-white"}`}
              key={tab}
              onPress={() => changeTab(tab)}
            >
              <Text className={`text-sm font-semibold ${isActive ? "text-white" : "text-slate-500"}`}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerClassName="px-4 pb-10" showsVerticalScrollIndicator={false}>
        {activeTab !== "approval" ? (
          <View className="mb-3 flex-row justify-end">
            <Pressable
              accessibilityRole="button"
              className="rounded-full bg-slate-900 px-4 py-2 active:bg-slate-700"
              onPress={openCreateTask}
            >
              <Text className="text-sm font-semibold text-white">＋ タスクを追加</Text>
            </Pressable>
          </View>
        ) : null}

        <View className="overflow-hidden rounded-2xl bg-white">
          {visibleQuests.length === 0 ? (
            <Text className="px-4 py-6 text-center text-sm text-slate-400">タスクがありません</Text>
          ) : (
            visibleQuests.map((quest, index) => {
              const isSelected = quest.id === selectedQuestId;
              const statusStyle = STATUS_STYLES[quest.status];

              return (
                <Pressable
                  accessibilityHint="タップすると下に詳細が表示されます"
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  className={`flex-row items-center justify-between px-4 py-4 ${
                    index !== visibleQuests.length - 1 ? "border-b border-slate-100" : ""
                  } ${isSelected ? "bg-slate-50" : ""}`}
                  key={quest.id}
                  onPress={() => selectQuest(quest.id)}
                >
                  <Text
                    className="flex-1 pr-3 text-sm font-medium text-slate-900"
                    ellipsizeMode="tail"
                    numberOfLines={1}
                  >
                    {quest.title}
                  </Text>
                  <Text className="mr-3 text-sm font-bold text-slate-700">{quest.reward_amount}pt</Text>
                  <View className={`rounded-full px-3 py-1 ${statusStyle.badge}`}>
                    <Text className={`text-xs font-semibold ${statusStyle.text}`}>
                      {QUEST_STATUS_LABELS[quest.status]}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        {isCreatingTask ? (
          <AdultTaskCreateForm onClose={() => setIsCreatingTask(false)} />
        ) : selectedQuest ? (
          <AdultTaskDetail
            onClose={() => setSelectedQuestId(undefined)}
            quest={selectedQuest}
            showActions={activeTab === "approval"}
          />
        ) : null}
      </ScrollView>

      <AdultBottomNav activeKey="tasks" />
    </SafeAreaView>
  );
}
