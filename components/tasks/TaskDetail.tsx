import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { acceptQuest, submitQuestCompletion } from "../../lib/taskService";
import { playSoundEffect } from "../../lib/audio";
import type { Quest } from "../../types";
import Furigana from "../Furigana";
import { taskStyles as styles } from "./taskStyles";
import {
  canAcceptQuest,
  canReportQuestCompletion,
  questStatusLabelForChild,
  questRequirementLabelForChild,
} from "./taskUtils";
import { PREVIEW_DISABLED_NOTICE_FOR_CHILD } from "../../constants/ui";
import { GOL_UNIT, formatAmount } from "../../lib/amount";
import { formatQuestDeadline, isQuestClosedByDeadline, isQuestExpired, questDeadlineLabelForChild } from "../../lib/questDeadline";
import { toErrorMessage } from "../../lib/errorMessage";

type TaskDetailProps = {
  now?: number;
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

/** 子供のタスク詳細。共通の期限判定で状態と操作ボタンをそろえる。 */
export default function TaskDetail({
  quest,
  onClose,
  currentUserId,
  isLive,
  onActionComplete,
  height,
  now = Date.now(),
}: TaskDetailProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!quest) {
    return null;
  }

  const canAccept = canAcceptQuest(quest, isLive, now);
  const canReport = canReportQuestCompletion(quest, currentUserId, isLive, now);
  const closed = isQuestClosedByDeadline(quest, now);
  const deadlineLabel = closed ? null : questDeadlineLabelForChild(quest, now);

  const handleAccept = async () => {
    if (!canAcceptQuest(quest, isLive) || isSubmitting) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await acceptQuest(quest.id, currentUserId);
      playSoundEffect("taskSubmit");
      onActionComplete();
    } catch (e) {
      console.warn("受注に失敗しました", e);
      setErrorMessage(toErrorMessage(e, "{受注|じゅちゅう}に{失敗|しっぱい}しました"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReport = async () => {
    if (!canReportQuestCompletion(quest, currentUserId, isLive) || isSubmitting) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await submitQuestCompletion(quest.id, currentUserId);
      playSoundEffect("taskSubmit");
      onActionComplete();
    } catch (e) {
      setErrorMessage(toErrorMessage(e, "{完了|かんりょう}{報告|ほうこく}に{失敗|しっぱい}しました"));
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
        onPress={() => {
          playSoundEffect("cancel");
          onClose();
        }}
        style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
      >
        <Text style={styles.closeButtonText}>×</Text>
      </Pressable>
      <View style={styles.detailPinRight} />
      <ScrollView showsVerticalScrollIndicator={false} style={styles.detailScroll}>
        <Furigana style={styles.detailLabel}>{"{選択中|せんたくちゅう}のタスク"}</Furigana>
        <View style={styles.detailTitleRow}>
          <Text style={styles.detailTitle}>{quest.title}</Text>
          <View style={styles.detailReward}>
            <Text style={styles.detailRewardValue}>{formatAmount(quest.reward_amount)}</Text>
            <Text style={styles.detailRewardUnit}> {GOL_UNIT}</Text>
          </View>
        </View>

        <View style={styles.divider} />
        <Text style={styles.descriptionLabel}>やること</Text>
        <Text style={styles.description}>{quest.description}</Text>
        <Text style={styles.requirementLabel}>
          {questRequirementLabelForChild(quest.is_required)}のタスク
        </Text>
        <Furigana style={styles.currentStatus}>{`{現在|げんざい}：${questStatusLabelForChild(quest, now)}`}</Furigana>
        {deadlineLabel ? <Furigana style={styles.deadlineLabel}>{deadlineLabel}</Furigana> : null}
        {quest.category === "limited" && quest.expires_at ? (
          <Furigana style={styles.currentStatus}>{`${formatQuestDeadline(quest.expires_at)}（{日本時間|にほんじかん}）まで`}</Furigana>
        ) : null}
        {closed ? (
          <Furigana style={styles.mockNotice}>{"{期限|きげん}をすぎたので、{受注|じゅちゅう}・{完了|かんりょう}{報告|ほうこく}はできません"}</Furigana>
        ) : null}
        {isQuestExpired(quest, now) && quest.status === "pending" ? (
          <Furigana style={styles.mockNotice}>{"{期限前|きげんまえ}の{報告|ほうこく}は、おうちの{人|ひと}の{承認|しょうにん}を{待|ま}てます"}</Furigana>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            accessibilityLabel="受注する"
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
            <Furigana noWrap
              style={[
                styles.actionButtonText,
                (!canAccept || isSubmitting) && styles.actionButtonTextDisabled,
              ]}
            >
              {"{受注|じゅちゅう}する"}
            </Furigana>
          </Pressable>
          <Pressable
            accessibilityLabel="完了報告"
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
            <Furigana noWrap
              style={[
                styles.actionButtonText,
                (!canReport || isSubmitting) && styles.actionButtonTextDisabled,
              ]}
            >
              {"{完了|かんりょう}{報告|ほうこく}"}
            </Furigana>
          </Pressable>
        </View>
        {errorMessage ? <Furigana style={styles.mockNotice}>{errorMessage}</Furigana> : null}
        {!isLive ? <Furigana style={styles.mockNotice}>{PREVIEW_DISABLED_NOTICE_FOR_CHILD}</Furigana> : null}
      </ScrollView>
    </View>
  );
}
