import { type Href, router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import ChildHomeScreen from "../components/ChildHomeScreen";
import ParentHomeScreen from "../components/ParentHomeScreen";
import { SHOULD_SHOW_DEV_NAVIGATION } from "../lib/devNavigation";
import { useActiveRole } from "../store";

const screens = [
  { label: "ログイン", route: "/login" },
  { label: "タスク（大人）", route: "/tasks-adult" },
  { label: "タスク（子供）", route: "/tasks-child" },
  { label: "ストア（大人）", route: "/store-adult" },
  { label: "ストア（子供）", route: "/store-child" },
  { label: "所持金（大人）", route: "/balance-adult" },
  { label: "所持金（子供）", route: "/balance-child" },
  { label: "履歴", route: "/history" },
  { label: "設定", route: "/settings" },
  { label: "初期設定", route: "/onboarding" },
  { label: "家族メンバー登録", route: "/family-registration" },
  { label: "メイン（大人）", route: "/main-adult" },
  { label: "メイン（子供）", route: "/main-child" },
] as const satisfies ReadonlyArray<{ label: string; route: Href }>;

function DevNavigationScreen() {
  return (
    <ScrollView className="flex-1 bg-slate-100" contentContainerClassName="p-6">
      <View className="mb-6">
        <Text className="text-3xl font-bold text-slate-900">開発用ナビ</Text>
        <Text className="mt-2 text-base text-slate-600">
          確認したい画面を選択してください
        </Text>
      </View>

      <View className="gap-3">
        {screens.map(({ label, route }) => (
          <Pressable
            key={route}
            accessibilityRole="button"
            className="rounded-xl bg-blue-600 px-5 py-4 active:bg-blue-700"
            onPress={() => router.push(route)}
          >
            <Text className="text-center text-base font-semibold text-white">
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

export default function HomeScreen() {
  const role = useActiveRole();

  if (SHOULD_SHOW_DEV_NAVIGATION) {
    return <DevNavigationScreen />;
  }

  if (role === "parent") {
    return <ParentHomeScreen />;
  }

  if (role === "child") {
    return <ChildHomeScreen />;
  }

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-2xl font-bold">我が家中央銀行</Text>
    </View>
  );
}
