import { router, Stack } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { isChildLoginCode, signInWithChildCode } from "../lib/childLoginService";
import { ERROR_TEXT_CLASS, PLACEHOLDER_TEXT_COLOR } from "../constants/ui";
import { useAppStore } from "../store";
import LoginNotice from "../components/LoginNotice";

/** 子供の端末で、親からもらった1回限りのコードを入力する。 */
export default function ChildLoginScreen() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const setUser = useAppStore((state) => state.setUser);
  const canSubmit = !busy && isChildLoginCode(code);
  const login = async () => {
    if (submitting.current || !canSubmit) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const user = await signInWithChildCode(code);
      setCode("");
      setUser(user);
      if (router.canDismiss()) router.dismissAll();
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ログインできませんでした。もういちど試してください");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ title: "こどものログイン" }} />
      <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-8" keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" className="mb-4 text-center text-2xl font-bold text-slate-900">コードでログイン</Text>
        <Text className="mb-6 text-center text-base text-slate-600">おうちの人からもらった8文字のコードを入れてね。コードは10分間つかえます。</Text>
        <LoginNotice />
        <TextInput accessibilityLabel="ログインコード" autoCapitalize="characters" autoCorrect={false}
          autoComplete="off" editable={!busy} maxLength={8} value={code}
          onChangeText={(value) => { setCode(value); setError(""); }} onSubmitEditing={login}
          placeholder="ABCDEFGH" placeholderTextColor={PLACEHOLDER_TEXT_COLOR} returnKeyType="go"
          className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-center text-2xl font-bold text-slate-900" />
        {error ? <Text accessibilityRole="alert" className={`mt-4 text-center text-sm ${ERROR_TEXT_CLASS}`}>{error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSubmit }} disabled={!canSubmit}
          onPress={login} className={`mt-6 items-center rounded-xl px-4 py-4 ${canSubmit ? "bg-blue-600" : "bg-slate-300"}`}>
          <Text className="text-base font-bold text-white">{busy ? "ログイン中..." : "はじめる"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
