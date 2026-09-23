import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { acceptQuest, submitQuestCompletion } from "../../lib/taskService";
import type { Quest } from "../../types";
import { taskStyles as styles } from "./taskStyles";
import { canAcceptQuest, canReportQuestCompletion, QUEST_STATUS_LABELS } from "./taskUtils";
import { PREVIEW_DISABLED_NOTICE } from "../../constants/ui";
import { AMOUNT_UNITS, formatAmount } from "../../lib/amount";

type TaskDetailProps = {
  quest?: Quest;
  onClose: () => void;
  currentUserId: string;
  isLive: boolean;
  onActionComplete: () => void;
  // 詳細パネルは一覧の上に固定表示されるため、板の上端をはみ出さないよう
  // 呼び出し側（ChildTasksScreen）で計算した高さを渡す。説明が長く収まらない
  // 場合は内部でスクロールする
  height: number;
};

export default function TaskDetail({
  quest,
  onClose,
  currentUserId,
  isLive,
  onActionComplete,
  height,
}: TaskDetailProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!quest) {
    return null;
  }

  const canAccept = canAcceptQuest(quest, isLive);
  const canReport = canReportQuestCompletion(quest, currentUserId, isLive);

  const handleAccept = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await acceptQuest(quest.id, currentUserId);
      onActionComplete();
    } catch (e) {
      console.warn("受注に失敗しました", e);
      setErrorMessage(e instanceof Error ? e.message : "受注に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReport = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await submitQuestCompletion(quest.id, currentUserId);
      onActionComplete();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "完了報告に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.detailPanel, { height }]}>
      <Pressable
        accessibilityLabel="タスク詳細を閉じる"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onClose}
        style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
      >
        <Text style={styles.closeButtonText}>×</Text>
      </Pressable>
      <View style={styles.detailPinRight} />
      <ScrollView showsVerticalScrollIndicator={false} style={styles.detailScroll}>
        <Text style={styles.detailLabel}>選択中のタスク</Text>
        <View style={styles.detailTitleRow}>
          <Text style={styles.detailTitle}>{quest.title}</Text>
          <View style={styles.detailReward}>
            <Text style={styles.detailRewardValue}>{formatAmount(quest.reward_amount)}</Text>
            <Text style={styles.detailRewardUnit}> {AMOUNT_UNITS.PT}</Text>
          </View>
        </View>

        <View style={styles.divider} />
        <Text style={styles.descriptionLabel}>やること</Text>
        <Text style={styles.description}>{quest.description}</Text>
        <Text style={styles.currentStatus}>現在：{QUEST_STATUS_LABELS[quest.status]}</Text>

        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canAccept || isSubmitting }}
            disabled={!canAccept || isSubmitting}
            onPress={handleAccept}
            style={[
              styles.actionButton,
              styles.acceptButton,
              (!canAccept || isSubmitting) && styles.actionButtonDisabled,
            ]}
          >
            <Text
              style={[
                styles.actionButtonText,
                (!canAccept || isSubmitting) && styles.actionButtonTextDisabled,
              ]}
            >
              受注する
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canReport || isSubmitting }}
            disabled={!canReport || isSubmitting}
            onPress={handleReport}
            style={[
              styles.actionButton,
              styles.reportButton,
              (!canReport || isSubmitting) && styles.actionButtonDisabled,
            ]}
          >
            <Text
              style={[
                styles.actionButtonText,
                (!canReport || isSubmitting) && styles.actionButtonTextDisabled,
              ]}
            >
              完了報告
            </Text>
          </Pressable>
        </View>
        {errorMessage ? <Text style={styles.mockNotice}>{errorMessage}</Text> : null}
        {!isLive ? <Text style={styles.mockNotice}>{PREVIEW_DISABLED_NOTICE}</Text> : null}
      </ScrollView>
    </View>
  );
}
