import { router, Stack } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signInWithEmail } from "../lib/auth";
import { canSubmitLogin } from "../lib/loginForm";
import { getEmailError, getRequiredError } from "../lib/validation";
import { useAppStore } from "../store";
import { PLACEHOLDER_TEXT_COLOR } from "../constants/ui";

/**
 * ログイン画面。Supabase Authで認証し、取得したプロフィールをストアへ保存する。
 */
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordInputRef = useRef<TextInput>(null);
  const setUser = useAppStore((state) => state.setUser);
  const canLogin = canSubmitLogin(email, password) && !isSubmitting;

  const handleLogin = async () => {
    if (isSubmitting) return;

    const nextEmailError = getEmailError(email);
    const nextPasswordError = getRequiredError(password, "パスワード");
    setEmailError(nextEmailError ?? "");
    setPasswordError(nextPasswordError ?? "");
    setError("");

    if (nextEmailError || nextPasswordError) return;

    setIsSubmitting(true);
    try {
      const result = await signInWithEmail(email, password);
      if (result.error) {
        setError(result.error);
        return;
      }

      setUser(result.data);
      router.replace("/");
    } catch {
      setError("認証に失敗しました。通信環境を確認して再度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
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
            onChangeText={(value) => {
              setEmail(value);
              setEmailError("");
            }}
            onSubmitEditing={() => passwordInputRef.current?.focus()}
            placeholder="example@my-home-bank.com"
            placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
            returnKeyType="next"
            value={email}
          />
          {emailError ? (
            <Text accessibilityRole="alert" className="mt-2 text-sm text-red-600">
              {emailError}
            </Text>
          ) : null}

          <Text className="mb-2 mt-6 text-sm font-semibold text-slate-800">パスワード</Text>
          <TextInput
            accessibilityLabel="パスワード"
            autoCapitalize="none"
            autoComplete="current-password"
            className="rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900"
            onChangeText={(value) => {
              setPassword(value);
              setPasswordError("");
            }}
            onSubmitEditing={handleLogin}
            placeholder="パスワードを入力"
            placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
            ref={passwordInputRef}
            returnKeyType="done"
            secureTextEntry
            value={password}
          />
          {passwordError ? (
            <Text accessibilityRole="alert" className="mt-2 text-sm text-red-600">
              {passwordError}
            </Text>
          ) : null}
        </View>

        {error ? (
          <Text accessibilityRole="alert" className="mt-4 text-center text-sm text-red-600">
            {error}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canLogin }}
          className={`mt-8 items-center rounded-xl px-4 py-4 ${
            canLogin ? "bg-blue-600 active:bg-blue-700" : "bg-slate-300"
          }`}
          disabled={!canLogin}
          onPress={handleLogin}
        >
          <Text className="text-base font-bold text-white">
            {isSubmitting ? "ログイン中..." : "ログイン"}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          className="mt-4 items-center px-4 py-3"
          onPress={() => router.push("/family-registration")}
        >
          <Text className="font-bold text-blue-600">新しいアカウントを登録</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
