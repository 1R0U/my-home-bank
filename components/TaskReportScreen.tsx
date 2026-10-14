import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { playSoundEffect } from "../lib/audio";
import { createTaskReport } from "../lib/taskReportService";
import { validateTaskReport } from "../lib/taskReportValidation";
import { useSubmitGate } from "../lib/useSubmitGate";
import Furigana from "./Furigana";
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

  const gate = useSubmitGate("child", isSubmitting);
  const { currentUser } = gate;
  const canSubmit = gate.canSubmit && Boolean(currentUser?.family_id);

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
        family_id: currentUser.family_id as string,
        reported_by: currentUser.id,
        title: title.trim(),
      });
      playSoundEffect("taskSubmit");
      // アラートにはふりがなを付けられないので、ひらがなで書く（Issue #347）
      Alert.alert("ほうこくを そうしんしました", "おやが かくにんできるように ほうこくを ほぞんしました。", [
        { onPress: () => router.back(), text: "OK" },
      ]);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "タスクの{報告|ほうこく}に{失敗|しっぱい}しました");
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

      <ScreenHeader title="お{手伝|てつだ}い{報告|ほうこく}" />

      <ScrollView contentContainerClassName="px-6 pb-10" showsVerticalScrollIndicator={false}>
        <Text className="mt-2 text-xs font-semibold text-slate-400">タイトル</Text>
        <TextInput
          accessibilityLabel="タイトル"
          className="mt-1 rounded-xl bg-white px-4 py-3 text-sm text-slate-900"
          onChangeText={setTitle}
          // 入力欄の見本にはふりがなを付けられないので、ひらがなで書く（Issue #347）
          placeholder="やったタスクのタイトルを にゅうりょく"
          placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
          value={title}
        />

        <Furigana className="mt-4 text-xs font-semibold text-slate-400">{"{説明|せつめい}"}</Furigana>
        <TextInput
          accessibilityLabel="説明"
          className="mt-1 rounded-xl bg-white px-4 py-3 text-sm text-slate-900"
          multiline
          numberOfLines={3}
          onChangeText={setDescription}
          placeholder="どんなことをしたか にゅうりょく"
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
          <Furigana noWrap className={`text-sm font-bold ${canSubmit ? "text-white" : "text-slate-400"}`}>
            {"{報告|ほうこく}する"}
          </Furigana>
        </Pressable>

        <SubmitGateNotice errorMessage={errorMessage} featureName="お手伝いの報告" gate={gate} />
      </ScrollView>
    </SafeAreaView>
  );
}
