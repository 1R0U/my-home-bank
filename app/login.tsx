import { router, Stack } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const canLogin = email.trim().length > 0 && password.trim().length > 0;

  const handleLogin = () => {
    router.replace("/");
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-1 justify-center px-6">
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
            autoComplete="password"
            className="rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900"
            onChangeText={setPassword}
            placeholder="パスワードを入力"
            placeholderTextColor="#94a3b8"
            secureTextEntry
            value={password}
          />
        </View>

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
      </View>
    </SafeAreaView>
  );
}
