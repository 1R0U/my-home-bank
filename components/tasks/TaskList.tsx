import { Pressable, Text, View } from "react-native";
import type { Quest, QuestStatus } from "../../types";
import { taskStyles as styles } from "./taskStyles";
import { QUEST_STATUS_LABELS } from "./taskUtils";

const statusStyles: Record<QuestStatus, { badge: object; text: object }> = {
  open: { badge: styles.statusOpen, text: styles.statusTextDark },
  accepted: { badge: styles.statusAccepted, text: styles.statusTextLight },
  pending: { badge: styles.statusPending, text: styles.statusTextDark },
  completed: { badge: styles.statusCompleted, text: styles.statusTextLight },
};

type TaskListProps = {
  quests: Quest[];
  selectedQuestId?: string;
  onSelect: (questId: string) => void;
};

export default function TaskList({ quests, selectedQuestId, onSelect }: TaskListProps) {
  return (
    <View style={styles.taskList}>
      <View style={styles.listHeadingRow}>
        <View style={[styles.titleColumn, styles.titleCell]}>
          <Text style={[styles.listHeading, styles.titleHeading]}>タスク名</Text>
        </View>
        <View style={[styles.rewardColumn, styles.headingCell, styles.headingColumnDivider]}>
          <Text style={styles.listHeading}>Pt</Text>
        </View>
        <View style={[styles.statusColumn, styles.headingCell, styles.headingColumnDivider]}>
          <Text style={styles.listHeading}>状態</Text>
        </View>
      </View>

      {quests.map((quest) => {
        const isSelected = quest.id === selectedQuestId;
        const statusStyle = statusStyles[quest.status];

        return (
          <Pressable
            accessibilityHint="画面下部に詳細を表示します"
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            key={quest.id}
            onPress={() => onSelect(quest.id)}
            style={({ pressed }) => [
              styles.taskRow,
              isSelected && styles.taskRowSelected,
              pressed && styles.taskRowPressed,
            ]}
          >
            <View style={styles.taskRowContent}>
              <View style={[styles.titleColumn, styles.titleCell]}>
                <Text ellipsizeMode="tail" numberOfLines={1} style={styles.taskTitle}>
                  {quest.title}
                </Text>
              </View>
              <View style={[styles.rewardColumn, styles.rewardCell, styles.columnDivider]}>
                <Text numberOfLines={1} style={styles.rewardValue}>
                  {quest.reward_amount.toLocaleString("ja-JP")}
                  <Text style={styles.rewardUnit}> PT</Text>
                </Text>
              </View>
              <View style={[styles.statusColumn, styles.statusCell, styles.columnDivider]}>
                <View style={[styles.statusBadge, statusStyle.badge]}>
                  <Text numberOfLines={1} style={[styles.statusText, statusStyle.text]}>
                    {QUEST_STATUS_LABELS[quest.status]}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
