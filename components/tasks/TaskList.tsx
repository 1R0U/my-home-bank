import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Quest, QuestStatus } from "../../types";
import { taskStyles as styles } from "./taskStyles";
import Furigana from "../Furigana";
import { questStatusLabelForChild, questStatusStyleKey, questRequirementLabelForChild } from "./taskUtils";
import { GOL_UNIT, formatAmount, formatGolForSpeech } from "../../lib/amount";
import { stripFurigana } from "../../lib/furigana";
import { isQuestClosedByDeadline, questDeadlineLabelForChild } from "../../lib/questDeadline";

const statusStyles: Record<QuestStatus, { badge: object; text: object }> = {
  open: { badge: styles.statusOpen, text: styles.statusTextDark },
  accepted: { badge: styles.statusAccepted, text: styles.statusTextLight },
  pending: { badge: styles.statusPending, text: styles.statusTextDark },
  completed: { badge: styles.statusCompleted, text: styles.statusTextLight },
};

const CARDS_PER_ROW = 3;
const CARD_GAP = 10;

type TaskListProps = {
  currentUserId?: string;
  now?: number;
  quests: Quest[];
  selectedQuestId?: string;
  onSelect: (questId: string) => void;
};

/** 子供のタスク一覧。期限切れの状態は表示と読み上げの両方へ反映する。 */
export default function TaskList({ quests, selectedQuestId, onSelect, currentUserId, now = Date.now() }: TaskListProps) {
  // taskListを囲む余白（枠線やpaddingなど）は周辺のスタイル変更で増減しうるため、
  // 固定値で見積もらずrowの実際の描画幅から3列ぶんのカード幅を求める。
  // 初期値は0にする（windowWidthを初期値にすると、板の内側幅より広い値で
  // 一瞬2列に描画されてから3列へ組み替わってガタつく）。実測できるまでは
  // 描画自体は行い、見た目だけopacityで隠す（react-test-renderer等、
  // onLayoutが発火しない環境でも一覧が描画されなくならないようにするため）
  const [rowWidth, setRowWidth] = useState(0);
  const cardWidth = Math.max(rowWidth - CARD_GAP * (CARDS_PER_ROW - 1), 0) / CARDS_PER_ROW;

  return (
    <View
      onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
      style={[styles.taskList, rowWidth === 0 && styles.taskListMeasuring]}
    >
      {quests.map((quest, index) => {
        const isSelected = quest.id === selectedQuestId;
        const closed = isQuestClosedByDeadline(quest, now);
        const deadlineLabel = closed ? null : questDeadlineLabelForChild(quest, now);
        const statusLabel = questStatusLabelForChild(quest, now);
        const statusStyle = statusStyles[questStatusStyleKey(quest, now)];
        const assignmentLabel = closed && quest.status === "accepted" && currentUserId && quest.assigned_to === currentUserId
          ? "{担当|たんとう}：あなた" : null;
        const isRowEnd = (index + 1) % CARDS_PER_ROW === 0;

        return (
          <Pressable
            accessibilityHint="画面下部に詳細を表示します"
            // 名前を中の文字から組み立てると、状態のふりがなまで読まれるため明示する（Issue #347）
            accessibilityLabel={[
              quest.is_required ? questRequirementLabelForChild(true) : null,
              quest.title,
              formatGolForSpeech(quest.reward_amount),
              stripFurigana(statusLabel),
              assignmentLabel && stripFurigana(assignmentLabel),
              deadlineLabel && stripFurigana(deadlineLabel),
            ]
              .filter(Boolean)
              .join("、")}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            key={quest.id}
            onPress={() => onSelect(quest.id)}
            style={{ marginRight: isRowEnd ? 0 : CARD_GAP, width: cardWidth }}
          >
            {({ pressed }) => (
              <View
                style={[
                  styles.taskCard,
                  isSelected && styles.taskCardSelected,
                  pressed && styles.taskCardPressed,
                ]}
              >
                <View style={styles.taskCardPin} />
                {/* 推奨は印を付けない。全カードに付けると必須の印が目立たなくなるため */}
                {quest.is_required ? (
                  <View style={styles.requiredBadge}>
                    <Text style={styles.requiredBadgeText}>
                      {questRequirementLabelForChild(true)}
                    </Text>
                  </View>
                ) : null}
                <Text ellipsizeMode="tail" numberOfLines={2} style={styles.taskCardTitle}>
                  {quest.title}
                </Text>
                {deadlineLabel ? <Furigana style={styles.deadlineLabel}>{deadlineLabel}</Furigana> : null}
                {assignmentLabel ? <Furigana style={styles.currentStatus}>{assignmentLabel}</Furigana> : null}
                <View style={styles.taskCardFooter}>
                  <Text numberOfLines={1} style={styles.rewardValue}>
                    {formatAmount(quest.reward_amount)}
                    <Text style={styles.rewardUnit}> {GOL_UNIT}</Text>
                  </Text>
                  <View style={[styles.statusBadge, statusStyle.badge]}>
                    <Furigana noWrap style={[styles.statusText, statusStyle.text]}>
                      {statusLabel}
                    </Furigana>
                  </View>
                </View>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
