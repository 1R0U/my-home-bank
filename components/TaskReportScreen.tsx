import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createTaskReport } from "../lib/taskReportService";
import { validateTaskReport } from "../lib/taskReportValidation";
import { useSubmitGate } from "../lib/useSubmitGate";
import ScreenHeader from "./ScreenHeader";
import SubmitGateNotice from "./SubmitGateNotice";
import { PLACEHOLDER_TEXT_COLOR } from "../constants/ui";

/**
 * 子供が自分でやったことを報告する画面。
 *
 * 子供のロールで、かつIDがUUIDのときだけ送信できる。
 * モックアカウントで入った場合は「プレビュー中」としてボタンを無効にする（#174）。
 */
export default function TaskReportScreen() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { blockReason, canSubmit, currentUser } = useSubmitGate("child", isSubmitting);

  const handleSubmit = async () => {
    if (!canSubmit) return;

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
          placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
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
          placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
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

        <SubmitGateNotice
          blockReason={blockReason}
          errorMessage={errorMessage}
          featureName="お手伝いの報告"
          requiredRole="child"
        />
      </ScrollView>
    </SafeAreaView>
  );
}
