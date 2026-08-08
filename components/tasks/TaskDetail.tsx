import { Pressable, Text, View } from "react-native";
import type { Quest } from "../../types";
import { taskStyles as styles } from "./taskStyles";
import { QUEST_STATUS_LABELS } from "./taskUtils";

type TaskDetailProps = {
  quest?: Quest;
  onClose: () => void;
};

export default function TaskDetail({ quest, onClose }: TaskDetailProps) {
  if (!quest) {
    return null;
  }

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
          accessibilityState={{ disabled: true }}
          disabled
          style={[styles.actionButton, styles.acceptButton, styles.actionButtonDisabled]}
        >
          <Text style={[styles.actionButtonText, styles.actionButtonTextDisabled]}>
            受注する
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          style={[styles.actionButton, styles.reportButton, styles.actionButtonDisabled]}
        >
          <Text style={[styles.actionButtonText, styles.actionButtonTextDisabled]}>
            完了報告
          </Text>
        </Pressable>
      </View>
      <Text style={styles.mockNotice}>※ ボタンの動作は今後実装予定です</Text>
    </View>
  );
}
