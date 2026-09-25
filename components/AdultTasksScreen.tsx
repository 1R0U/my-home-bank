import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuests } from "../lib/useQuests";
import { useDisplayUser } from "../store";
import type { QuestCategory, QuestStatus } from "../types";
import KeyboardAvoidingScreen from "./KeyboardAvoidingScreen";
import ScreenHeader from "./ScreenHeader";
import AdultTaskCreateForm from "./tasks/AdultTaskCreateForm";
import AdultTaskDetail from "./tasks/AdultTaskDetail";
import { QUEST_CATEGORY_LABELS, QUEST_STATUS_LABELS, filterQuestsByCategory } from "./tasks/taskUtils";
import { AMOUNT_UNITS, formatAmountWithUnit } from "../lib/amount";
import { ERROR_TEXT_CLASS } from "../constants/ui";

// 大人用タスク画面のタブ。承認待ちタスクの確認を最優先にしたいので先頭に置く。
// 日課/週課/限定は子供用と同じ「一覧を眺める」タブ。
type AdultTaskTab = QuestCategory | "approval";

const tabs: AdultTaskTab[] = ["approval", "daily", "weekly", "limited"];

const TAB_LABELS: Record<AdultTaskTab, string> = {
  ...QUEST_CATEGORY_LABELS,
  approval: "承認",
};

// badge: ステータスバッジの背景色 / text: バッジ内テキスト色 / reward: 一覧の報酬額表示の色
// completed は報酬付与済みなので、打ち消し線＋トーンダウンした色で「これから貰える額」と区別する。
const STATUS_STYLES: Record<QuestStatus, { badge: string; text: string; reward: string }> = {
  open: { badge: "bg-slate-100", text: "text-slate-500", reward: "text-slate-700" },
  accepted: { badge: "bg-blue-50", text: "text-blue-600", reward: "text-slate-700" },
  pending: { badge: "bg-amber-100", text: "text-amber-700", reward: "text-slate-700" },
  completed: { badge: "bg-emerald-50", text: "text-emerald-600", reward: "text-slate-400 line-through" },
};

function isAdultTaskTab(value: string | undefined): value is AdultTaskTab {
  return tabs.includes(value as AdultTaskTab);
}

export default function AdultTasksScreen() {
  const params = useLocalSearchParams<{ navKey?: string; questId?: string; tab?: string }>();
  const [activeTab, setActiveTab] = useState<AdultTaskTab>(
    isAdultTaskTab(params.tab) ? params.tab : "approval",
  );
  const [selectedQuestId, setSelectedQuestId] = useState<string | undefined>(params.questId);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  // タブ化により画面がマウントされたまま残るため、ホーム等から2回目以降
  // params付きで遷移してきた場合もuseStateの初期値だけでなくここで反映する。
  // タスク追加フォームを開いたままdeep linkされた場合に古いフォームが
  // 残らないよう、isCreatingTaskもここでリセットする。
  // 初回マウント時はuseStateの初期値が既に同じ内容を反映しているため、
  // 無駄な再実行を避けるためスキップする。
  const isFirstRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    setActiveTab(isAdultTaskTab(params.tab) ? params.tab : "approval");
    // 呼び出し側（ホーム画面等）はタブ切り替え扱いになるnavigateでparamsが
    // マージされ得るため、questIdを指定しない遷移では空文字を明示してもらう
    // 想定。空文字・未指定のどちらも「未選択」として扱う。
    setSelectedQuestId(params.questId || undefined);
    setIsCreatingTask(false);
    // params.navKey（呼び出し側が遷移のたびに生成する一意な値）を依存配列に
    // 含めることで、前回と全く同じtab/questIdへ再遷移した場合（例:
    // 「デイリータスクをすべて見る」を連続で押す）でもこのeffectが確実に
    // 発火し、ローカル状態（isCreatingTask等）が残り続けないようにする。
  }, [params.tab, params.questId, params.navKey]);
  const { quests, isLive, reload, error: questsError } = useQuests();
  const currentUser = useDisplayUser("parent");

  const pendingCount = useMemo(
    () => quests.filter((quest) => quest.status === "pending").length,
    [quests],
  );

  const visibleQuests = useMemo(() => {
    if (activeTab === "approval") {
      return quests.filter((quest) => quest.status === "pending");
    }
    return filterQuestsByCategory(quests, activeTab);
  }, [quests, activeTab]);
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
      <ScreenHeader hideBackButton title="タスク管理" />

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

      <KeyboardAvoidingScreen>
        <ScrollView className="flex-1" contentContainerClassName="px-4 pb-10" showsVerticalScrollIndicator={false}>
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
            {/*
              取得に失敗したことを出す。黙って「ありません」と出すと、
              本当に0件なのか取れなかったのかが区別できない（Issue #212）。
              一覧そのものは消さない。タスク追加や承認の後の再取得が失敗しただけの場合、
              取得済みの一覧は正しいままで、消すと見る手段がなくなる。
            */}
            {questsError ? (
              <Text className={`px-4 py-6 text-center text-sm ${ERROR_TEXT_CLASS}`}>
                タスクを取得できませんでした
              </Text>
            ) : null}
            {!questsError && visibleQuests.length === 0 ? (
              <Text className="px-4 py-6 text-center text-sm text-slate-400">タスクがありません</Text>
            ) : null}
            {visibleQuests.map((quest, index) => {
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
                    <Text className={`mr-3 text-sm font-bold ${statusStyle.reward}`}>
                      {formatAmountWithUnit(quest.reward_amount, AMOUNT_UNITS.pt)}
                    </Text>
                    <View className={`rounded-full px-3 py-1 ${statusStyle.badge}`}>
                      <Text className={`text-xs font-semibold ${statusStyle.text}`}>
                        {QUEST_STATUS_LABELS[quest.status]}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
          </View>

          {isCreatingTask ? (
            <AdultTaskCreateForm
              creator={currentUser}
              isLive={isLive}
              onClose={() => setIsCreatingTask(false)}
              onCreated={reload}
            />
          ) : selectedQuest ? (
            <AdultTaskDetail
              approver={currentUser}
              canWrite={isLive}
              isLive={isLive}
              onActionComplete={reload}
              onClose={() => setSelectedQuestId(undefined)}
              quest={selectedQuest}
              showActions={activeTab === "approval"}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingScreen>
    </SafeAreaView>
  );
}
