import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_QUESTS, MOCK_USERS } from "../constants/mockData";
import AdultBottomNav from "./nav/AdultBottomNav";
import { filterQuestsByCategory, QUEST_STATUS_LABELS } from "./tasks/taskUtils";

const currentParent = MOCK_USERS.find((user) => user.role === "parent") ?? MOCK_USERS[0];
const dailyQuests = filterQuestsByCategory(MOCK_QUESTS, "daily").filter(
  (quest) => quest.status !== "completed",
);
const pendingApprovalCount = MOCK_QUESTS.filter((quest) => quest.status === "pending").length;

export default function ParentHomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerClassName="px-6 pb-6" showsVerticalScrollIndicator={false}>
        <View className="mt-4 flex-row items-start justify-between">
          <View>
            <Text className="text-lg font-bold text-slate-900">{currentParent.name}</Text>
            <View className="mt-2 h-14 w-14 items-center justify-center rounded-full bg-slate-200">
              <Ionicons color="#94a3b8" name="person" size={28} />
            </View>
          </View>

          <Pressable
            accessibilityLabel={
              pendingApprovalCount > 0
                ? `通知。承認待ちが${pendingApprovalCount}件あります`
                : "通知"
            }
            accessibilityRole="button"
            className="h-16 w-16 items-center justify-center rounded-full bg-white"
            onPress={() => router.push("/tasks-adult")}
          >
            <Ionicons color="#0f172a" name="notifications" size={36} />
            {pendingApprovalCount > 0 && (
              <View className="absolute right-2 top-2 h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1">
                <Text className="text-[11px] font-bold text-white">{pendingApprovalCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View className="mt-6 items-center rounded-2xl bg-white py-8">
          <Text className="text-sm text-slate-500">所持金</Text>
          <Text className="mt-1 text-4xl font-bold text-slate-900">
            {currentParent.balance.toLocaleString("ja-JP")}pt
          </Text>
        </View>

        <View className="mt-6">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-bold text-slate-900">デイリータスク</Text>
            <Pressable
              accessibilityLabel="デイリータスクをすべて見る"
              accessibilityRole="button"
              onPress={() => router.push("/tasks-adult")}
            >
              <Text className="text-xs font-semibold text-blue-600">すべて見る</Text>
            </Pressable>
          </View>

          <View className="mt-3 gap-3">
            {dailyQuests.map((quest) => (
              <Pressable
                accessibilityLabel={`${quest.title}、${QUEST_STATUS_LABELS[quest.status]}、報酬${quest.reward_amount}pt`}
                accessibilityRole="button"
                className="flex-row items-center justify-between rounded-xl bg-white px-4 py-3 active:bg-slate-50"
                key={quest.id}
                onPress={() =>
                  router.push({ pathname: "/tasks-adult", params: { questId: quest.id, tab: "daily" } })
                }
              >
                <View className="flex-1 pr-3">
                  <Text className="text-sm font-semibold text-slate-900">{quest.title}</Text>
                  <Text className="mt-0.5 text-xs text-slate-500">
                    {QUEST_STATUS_LABELS[quest.status]}
                  </Text>
                </View>
                <Text className="text-sm font-bold text-blue-600">+{quest.reward_amount}pt</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      <AdultBottomNav activeKey="home" />
    </SafeAreaView>
  );
}
