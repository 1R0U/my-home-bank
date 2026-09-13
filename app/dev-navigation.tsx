import { type Href, Redirect, router, Stack } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SHOULD_ENABLE_MOCK_LOGIN } from "../lib/mockLoginEnvironment";
import { createUserProfile } from "../lib/userService";
import { useAppStore } from "../store";
import type { UserRole } from "../types";

type DevScreenItem = {
  label: string;
  route: Href;
  /**
   * 指定されている場合、画面遷移前にSupabaseのusersテーブルへ実際に
   * テストユーザーを新規作成し、そのユーザーとしてログイン状態にしてから
   * 遷移する（タスク追加・購入・預入など、実際の書き込みを試したい場合に使う）。
   * 省略時は従来通りログイン状態を変更せずに遷移するだけ。
   *
   * 注意: 呼び出すたびに本番のSupabaseプロジェクトへ実際に行が作成される
   * （テストデータが溜まっていく）。気になる場合はSupabase側で定期的に整理すること。
   */
  devUserRole?: UserRole;
};

const screens: DevScreenItem[] = [
  { label: "ログイン", route: "/login" },
  { label: "タスク（大人）", route: "/tasks-adult", devUserRole: "parent" },
  { label: "タスク（子供）", route: "/tasks-child", devUserRole: "child" },
  { label: "ストア（大人）", route: "/store-adult", devUserRole: "parent" },
  { label: "ストア（子供）", route: "/store-child", devUserRole: "child" },
  { label: "所持金（大人）", route: "/balance-adult", devUserRole: "parent" },
  { label: "ローン（大人）", route: "/loan-adult", devUserRole: "parent" },
  { label: "銀行", route: "/bank", devUserRole: "parent" },
  { label: "履歴", route: "/history", devUserRole: "parent" },
  { label: "設定", route: "/settings", devUserRole: "parent" },
  { label: "初期設定", route: "/onboarding" },
  { label: "家族メンバー登録", route: "/family-registration" },
  { label: "メイン（大人）", route: "/main-adult", devUserRole: "parent" },
  { label: "メイン（子供）", route: "/main-child", devUserRole: "child" },
  { label: "メイン（子供・2D比較）", route: "/main-child-2d", devUserRole: "child" },
];

const ROLE_LABELS: Record<UserRole, string> = { parent: "親", child: "子" };

export default function DevNavigationScreen() {
  const setUser = useAppStore((state) => state.setUser);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  if (!SHOULD_ENABLE_MOCK_LOGIN) {
    return <Redirect href="/" />;
  }

  const handlePress = async ({ route, devUserRole }: DevScreenItem) => {
    if (!devUserRole || isLoggingIn) {
      router.push(route);
      return;
    }

    setIsLoggingIn(true);
    try {
      const now = new Date();
      const timeLabel = now.toLocaleTimeString("ja-JP", { hour12: false });
      const user = await createUserProfile({
        name: `開発テスト（${ROLE_LABELS[devUserRole]}） ${timeLabel}`,
        role: devUserRole,
      });
      setUser(user);
      router.push(route);
    } catch (e) {
      Alert.alert(
        "テストユーザーの作成に失敗しました",
        e instanceof Error ? e.message : "時間をおいて再度お試しください。",
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerClassName="p-6">
        <View className="mb-6">
          <Text className="text-3xl font-bold text-slate-900">開発用ナビ</Text>
          <Text className="mt-2 text-base text-slate-600">
            確認したい画面を選択してください
          </Text>
          <Text className="mt-1 text-xs text-slate-400">
            「大人/子供」表記のある画面は、遷移前にSupabaseへ実際のテストユーザーを
            新規作成してログイン状態にします（本番プロジェクトにデータが残ります）。
          </Text>
        </View>

        <View className="gap-3">
          {screens.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityState={{ disabled: isLoggingIn }}
              className={`rounded-xl px-5 py-4 ${isLoggingIn ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
              disabled={isLoggingIn}
              onPress={() => handlePress(item)}
            >
              <Text className="text-center text-base font-semibold text-white">
                {item.label}
                {item.devUserRole ? `（${ROLE_LABELS[item.devUserRole]}としてテストログイン）` : ""}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
