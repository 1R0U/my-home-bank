import { Pressable, Text, View } from "react-native";
import type { Quest, QuestStatus } from "../../types";
import { taskStyles as styles } from "./taskStyles";
import { QUEST_STATUS_LABELS } from "./taskUtils";
import { AMOUNT_UNITS, formatAmount } from "../../lib/amount";

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
              styles.taskCard,
              isSelected && styles.taskCardSelected,
              pressed && styles.taskCardPressed,
            ]}
          >
            <View style={styles.taskCardPin} />
            <Text ellipsizeMode="tail" numberOfLines={2} style={styles.taskCardTitle}>
              {quest.title}
            </Text>
            <View style={styles.taskCardFooter}>
              <Text numberOfLines={1} style={styles.rewardValue}>
                {formatAmount(quest.reward_amount)}
                <Text style={styles.rewardUnit}> {AMOUNT_UNITS.PT}</Text>
              </Text>
              <View style={[styles.statusBadge, statusStyle.badge]}>
                <Text numberOfLines={1} style={[styles.statusText, statusStyle.text]}>
                  {QUEST_STATUS_LABELS[quest.status]}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
