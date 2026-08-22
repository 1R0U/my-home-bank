import { type Href, Redirect, router, Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SHOULD_ENABLE_MOCK_LOGIN } from "../lib/mockLoginEnvironment";

const screens = [
  { label: "ログイン", route: "/login" },
  { label: "タスク（大人）", route: "/tasks-adult" },
  { label: "タスク（子供）", route: "/tasks-child" },
  { label: "ストア（大人）", route: "/store-adult" },
  { label: "ストア（子供）", route: "/store-child" },
  { label: "所持金（大人）", route: "/balance-adult" },
  { label: "所持金（子供）", route: "/balance-child" },
  { label: "銀行", route: "/bank" },
  { label: "履歴", route: "/history" },
  { label: "設定", route: "/settings" },
  { label: "初期設定", route: "/onboarding" },
  { label: "家族メンバー登録", route: "/family-registration" },
  { label: "メイン（大人）", route: "/main-adult" },
  { label: "メイン（子供）", route: "/main-child" },
  { label: "メイン（子供・2D比較）", route: "/main-child-2d" },
] as const satisfies ReadonlyArray<{ label: string; route: Href }>;

export default function DevNavigationScreen() {
  if (!SHOULD_ENABLE_MOCK_LOGIN) {
    return <Redirect href="/" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerClassName="p-6">
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
    </SafeAreaView>
  );
}
