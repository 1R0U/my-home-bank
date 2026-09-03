import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { acceptQuest, submitQuestCompletion } from "../../lib/taskService";
import type { Quest } from "../../types";
import { taskStyles as styles } from "./taskStyles";
import { canAcceptQuest, canReportQuestCompletion, QUEST_STATUS_LABELS } from "./taskUtils";

type TaskDetailProps = {
  quest?: Quest;
  onClose: () => void;
  currentUserId: string;
  isLive: boolean;
  onActionComplete: () => void;
};

export default function TaskDetail({
  quest,
  onClose,
  currentUserId,
  isLive,
  onActionComplete,
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
    <View style={styles.detailPanel}>
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
      <Text style={styles.detailLabel}>選択中のタスク</Text>
      <View style={styles.detailTitleRow}>
        <Text style={styles.detailTitle}>{quest.title}</Text>
        <View style={styles.detailReward}>
          <Text style={styles.detailRewardValue}>{quest.reward_amount.toLocaleString("ja-JP")}</Text>
          <Text style={styles.detailRewardUnit}> PT</Text>
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
      {!isLive ? (
        <Text style={styles.mockNotice}>※ プレビュー中はボタンを操作できません</Text>
      ) : null}
    </View>
  );
}
