import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DEV_ROLE_OVERRIDE } from "../lib/devRole";
import { createTaskReport } from "../lib/taskReportService";
import { validateTaskReport } from "../lib/taskReportValidation";
import { useCurrentUser } from "../store";
import ScreenHeader from "./ScreenHeader";

export default function TaskReportScreen() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const isLive = !DEV_ROLE_OVERRIDE && currentUser !== null;
  const isChildRole = currentUser?.role === "child";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = isLive && isChildRole && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit || !currentUser || !isChildRole) return;

    const validationError = validateTaskReport({ description, title });
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await createTaskReport({
        description: description.trim(),
        reported_by: currentUser.id,
        title: title.trim(),
      });
      Alert.alert("報告を送信しました", "親が確認できるように報告を保存しました。", [
        { onPress: () => router.back(), text: "OK" },
      ]);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "タスクの報告に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentUser) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-100" edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text className="text-sm text-slate-400">ログインしてください</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScreenHeader title="お手伝い報告" />

      <ScrollView contentContainerClassName="px-6 pb-10" showsVerticalScrollIndicator={false}>
        <Text className="mt-2 text-xs font-semibold text-slate-400">タイトル</Text>
        <TextInput
          accessibilityLabel="タイトル"
          className="mt-1 rounded-xl bg-white px-4 py-3 text-sm text-slate-900"
          onChangeText={setTitle}
          placeholder="行ったタスクのタイトルを入力"
          placeholderTextColor="#94a3b8"
          value={title}
        />

        <Text className="mt-4 text-xs font-semibold text-slate-400">説明</Text>
        <TextInput
          accessibilityLabel="説明"
          className="mt-1 rounded-xl bg-white px-4 py-3 text-sm text-slate-900"
          multiline
          numberOfLines={3}
          onChangeText={setDescription}
          placeholder="どんなことをしたか入力"
          placeholderTextColor="#94a3b8"
          style={{ minHeight: 72, textAlignVertical: "top" }}
          value={description}
        />

        <Pressable
          accessibilityLabel="報告する"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          className={`mt-6 items-center rounded-xl py-3 ${canSubmit ? "bg-slate-900 active:bg-slate-700" : "bg-slate-200"}`}
          disabled={!canSubmit}
          onPress={handleSubmit}
        >
          <Text className={`text-sm font-bold ${canSubmit ? "text-white" : "text-slate-400"}`}>報告する</Text>
        </Pressable>

        {errorMessage ? (
          <Text className="mt-2 text-center text-xs text-rose-500">{errorMessage}</Text>
        ) : !isLive ? (
          <Text className="mt-2 text-center text-xs text-slate-300">
            ※ プレビュー中はボタンを操作できません
          </Text>
        ) : !isChildRole ? (
          <Text className="mt-2 text-center text-xs text-slate-300">
            ※ お手伝いの報告は子供用アカウントのみ利用できます
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
