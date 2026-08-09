import { Ionicons } from "@expo/vector-icons";
import { type Href, router, Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_QUESTS, MOCK_USERS } from "../constants/mockData";
import { QUEST_STATUS_LABELS } from "./tasks/taskUtils";

type NavItem = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  route: Href;
};

const NAV_ITEMS: NavItem[] = [
  { key: "loan", label: "ローン", icon: "cash-outline", route: "/loan-adult" },
  { key: "store", label: "ストア", icon: "storefront-outline", route: "/store-adult" },
  { key: "home", label: "ホーム", icon: "home", route: "/main-adult" },
  { key: "tasks", label: "タスク", icon: "list-outline", route: "/tasks-adult" },
  { key: "history", label: "履歴", icon: "time-outline", route: "/history" },
  { key: "settings", label: "設定", icon: "settings-outline", route: "/settings" },
];

const currentParent = MOCK_USERS.find((user) => user.role === "parent") ?? MOCK_USERS[0];
const dailyQuests = MOCK_QUESTS.filter((quest) => quest.category === "daily");

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

          <View
            accessibilityLabel="通知"
            className="h-16 w-16 items-center justify-center rounded-full bg-white"
          >
            <Ionicons color="#0f172a" name="notifications" size={36} />
          </View>
        </View>

        <View className="mt-6 items-center rounded-2xl bg-white py-8">
          <Text className="text-sm text-slate-500">所持金</Text>
          <Text className="mt-1 text-4xl font-bold text-slate-900">
            {currentParent.balance.toLocaleString("ja-JP")}円
          </Text>
        </View>

        <View className="mt-6">
          <Text className="text-base font-bold text-slate-900">デイリータスク</Text>
          <View className="mt-3 gap-3">
            {dailyQuests.map((quest) => (
              <View
                className="flex-row items-center justify-between rounded-xl bg-white px-4 py-3"
                key={quest.id}
              >
                <View className="flex-1 pr-3">
                  <Text className="text-sm font-semibold text-slate-900">{quest.title}</Text>
                  <Text className="mt-0.5 text-xs text-slate-500">
                    {QUEST_STATUS_LABELS[quest.status]}
                  </Text>
                </View>
                <Text className="text-sm font-bold text-blue-600">+{quest.reward_amount}円</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View className="flex-row border-t border-slate-200 bg-white px-2 pt-2">
        {NAV_ITEMS.map((item) => {
          const active = item.key === "home";

          return (
            <Pressable
              accessibilityLabel={item.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className="flex-1 items-center py-1"
              key={item.key}
              onPress={() => {
                if (!active) {
                  router.push(item.route);
                }
              }}
            >
              <Ionicons color={active ? "#2563eb" : "#94a3b8"} name={item.icon} size={22} />
              <Text
                className={`mt-1 text-[11px] font-medium ${
                  active ? "text-blue-600" : "text-slate-400"
                }`}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
