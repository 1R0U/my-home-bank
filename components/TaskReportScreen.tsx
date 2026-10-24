import { Stack } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { playSoundEffect } from "../lib/audio";
import { createTaskReport } from "../lib/taskReportService";
import { validateTaskReport } from "../lib/taskReportValidation";
import { useSubmitGate } from "../lib/useSubmitGate";
import ChildBackButton, { goBackOrReplace } from "./ChildBackButton";
import Furigana from "./Furigana";
import KeyboardAvoidingScreen from "./KeyboardAvoidingScreen";
import SubmitGateNotice from "./SubmitGateNotice";
import { taskStyles } from "./tasks/taskStyles";
import { TASK_REPORT_COLORS, taskReportStyles as styles } from "./tasks/taskReportStyles";
import { useLeaveLockWhileSubmitting } from "./useLeaveLockWhileSubmitting";

/** 戻れる画面がないとき（Webでの再読み込み・ディープリンク）の移り先。報告の入口のタスク画面へ戻す */
const BACK_FALLBACK_HREF = "/tasks-child";

/**
 * 子供が自分でやったことを報告する画面。
 * タスク画面と同じ、木の板に羊皮紙の報告用紙を留めた見た目にしている（Issue #487）。
 *
 * 子供のロールで、かつIDがUUIDのときだけ送信できる。
 * モックアカウントで入った場合は「プレビュー中」としてボタンを無効にする（#174）。
 */
export default function TaskReportScreen() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const gate = useSubmitGate("child", isSubmitting);
  const screenOptions = useLeaveLockWhileSubmitting(isSubmitting);
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
        { onPress: () => goBackOrReplace(BACK_FALLBACK_HREF), text: "OK" },
      ]);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "タスクの{報告|ほうこく}に{失敗|しっぱい}しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentUser) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={[taskStyles.safeArea, styles.loginContainer]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.loginText}>ログインしてください</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={taskStyles.safeArea}>
      <Stack.Screen options={screenOptions} />

      {/* 入力欄がキーボードに隠れないよう、木の板ごと縮める */}
      <KeyboardAvoidingScreen>

        <View style={taskStyles.header}>
          <View>
            <Text style={taskStyles.eyebrow}>クエストボード</Text>
            <Furigana noWrap accessibilityRole="header" style={taskStyles.screenTitle}>
              {"お{手伝|てつだ}い{報告|ほうこく}"}
            </Furigana>
          </View>
        </View>

        <View style={taskStyles.boardFrame}>
          <View style={taskStyles.frameRivetLeft} />
          <View style={taskStyles.frameRivetRight} />
          <View style={taskStyles.boardContent}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.paper}>
                <View style={styles.paperPin} />

                <Text style={styles.fieldLabel}>タイトル</Text>
                <TextInput
                  accessibilityLabel="タイトル"
                  onChangeText={setTitle}
                  // 入力欄の見本にはふりがなを付けられないので、ひらがなで書く（Issue #347）
                  placeholder="やったタスクのタイトルを にゅうりょく"
                  placeholderTextColor={TASK_REPORT_COLORS.placeholder}
                  style={styles.input}
                  value={title}
                />

                <Furigana style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{"{説明|せつめい}"}</Furigana>
                <TextInput
                  accessibilityLabel="説明"
                  multiline
                  numberOfLines={3}
                  onChangeText={setDescription}
                  placeholder="どんなことをしたか にゅうりょく"
                  placeholderTextColor={TASK_REPORT_COLORS.placeholder}
                  style={[styles.input, styles.inputMultiline]}
                  value={description}
                />

                <Pressable
                  accessibilityLabel="報告する"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canSubmit }}
                  disabled={!canSubmit}
                  onPress={handleSubmit}
                >
                  {/* 見た目は内側の View に付ける。Pressable の style を関数で渡すと、実機で背景・枠が付かなかった */}
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.submitButton,
                        !canSubmit && styles.submitButtonDisabled,
                        pressed && styles.submitButtonPressed,
                      ]}
                    >
                      <Furigana
                        noWrap
                        style={[styles.submitButtonText, !canSubmit && styles.submitButtonTextDisabled]}
                      >
                        {"{報告|ほうこく}する"}
                      </Furigana>
                    </View>
                  )}
                </Pressable>

                <SubmitGateNotice
                  errorMessage={errorMessage}
                  featureName="お手伝いの報告"
                  gate={gate}
                  textStyles={{ error: styles.errorNotice, notice: styles.notice }}
                />
              </View>
            </ScrollView>
          </View>
        </View>

        <View style={taskStyles.footer}>
          {/* 送信中に離れると、成功の「OK」でさらに前の画面へ戻ってしまうので押せなくする */}
          <ChildBackButton buttonStyle={taskStyles.backButtonBoard} disabled={isSubmitting} fallbackHref={BACK_FALLBACK_HREF} />
        </View>
      </KeyboardAvoidingScreen>
    </SafeAreaView>
  );
}
