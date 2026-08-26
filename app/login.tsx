import { router, Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { canSubmitLogin } from "../lib/loginForm";
import { SHOULD_ENABLE_MOCK_LOGIN } from "../lib/mockLoginEnvironment";
import { authenticateMockUser, MOCK_ACCOUNTS } from "../lib/mockAuth";
import { useAppStore } from "../store";
import type { User } from "../types";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const setUser = useAppStore((state) => state.setUser);
  const canLogin = canSubmitLogin(email, password);

  const completeLogin = (user: User) => {
    setUser(user);
    router.replace("/");
  };

  const handleLogin = () => {
    if (!SHOULD_ENABLE_MOCK_LOGIN) return;

    const user = authenticateMockUser(email, password);
    if (!user) {
      setError("メールアドレスまたはパスワードが違います。");
      return;
    }

    setError("");
    completeLogin(user);
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-8"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="mb-8 text-center text-3xl font-bold text-slate-900">
          我が家中央銀行
        </Text>

        <View className="rounded-2xl bg-white px-5 py-6">
          <Text className="text-sm font-semibold text-slate-800">メールアドレス</Text>
          <TextInput
            accessibilityLabel="メールアドレス"
            autoCapitalize="none"
            autoComplete="email"
            className="mt-2 rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="example@my-home-bank.com"
            placeholderTextColor="#94a3b8"
            value={email}
          />

          <Text className="mb-2 mt-6 text-sm font-semibold text-slate-800">パスワード</Text>
          <TextInput
            accessibilityLabel="パスワード"
            autoCapitalize="none"
            autoComplete="current-password"
            className="rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900"
            onChangeText={setPassword}
            placeholder="パスワードを入力"
            placeholderTextColor="#94a3b8"
            secureTextEntry
            value={password}
          />
        </View>

        {error ? (
          <Text accessibilityRole="alert" className="mt-4 text-center text-sm text-red-600">
            {error}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          className={`mt-8 items-center rounded-xl px-4 py-4 ${
            canLogin ? "bg-blue-600 active:bg-blue-700" : "bg-slate-300"
          }`}
          disabled={!canLogin}
          onPress={handleLogin}
        >
          <Text className="text-base font-bold text-white">ログイン</Text>
        </Pressable>

        {SHOULD_ENABLE_MOCK_LOGIN ? (
          <View className="mt-6 gap-3">
            <Text className="text-center text-sm font-semibold text-slate-600">
              開発用クイックログイン
            </Text>
            <Pressable
              accessibilityRole="button"
              className="items-center rounded-xl border border-blue-600 px-4 py-3"
              onPress={() => completeLogin(MOCK_ACCOUNTS.parent.user)}
            >
              <Text className="font-bold text-blue-600">大人として入る</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              className="items-center rounded-xl border border-emerald-600 px-4 py-3"
              onPress={() => completeLogin(MOCK_ACCOUNTS.child.user)}
            >
              <Text className="font-bold text-emerald-600">子供として入る</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              className="items-center rounded-xl border border-slate-400 px-4 py-3"
              onPress={() => router.push("/dev-navigation")}
            >
              <Text className="font-bold text-slate-700">開発用ナビを開く</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              className="items-center rounded-xl border border-violet-600 px-4 py-3"
              onPress={() => router.push("/onboarding")}
            >
              <Text className="font-bold text-violet-600">初期設定から始める</Text>
            </Pressable>
            <Text className="text-center text-xs leading-5 text-slate-500">
              大人: {MOCK_ACCOUNTS.parent.email} / {MOCK_ACCOUNTS.parent.password}{"\n"}
              子供: {MOCK_ACCOUNTS.child.email} / {MOCK_ACCOUNTS.child.password}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
