import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { approveQuestLog, fetchPendingLogForQuest, rejectQuestLog } from "../../lib/taskService";
import type { Quest, QuestLog } from "../../types";
import { QUEST_STATUS_LABELS } from "./taskUtils";

type AdultTaskDetailProps = {
  quest: Quest;
  onClose: () => void;
  showActions?: boolean;
  approverId: string;
  isLive: boolean;
  onActionComplete: () => void;
};

export default function AdultTaskDetail({
  quest,
  onClose,
  showActions = false,
  approverId,
  isLive,
  onActionComplete,
}: AdultTaskDetailProps) {
  const [pendingLog, setPendingLog] = useState<QuestLog | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPendingLog(null);
    setErrorMessage(null);

    if (!isLive || !showActions || quest.status !== "pending") {
      return;
    }

    fetchPendingLogForQuest(quest.id)
      .then((log) => {
        if (!cancelled) setPendingLog(log);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErrorMessage(e instanceof Error ? e.message : "承認申請の取得に失敗しました");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isLive, showActions, quest.id, quest.status]);

  const canApproveOrReject = isLive && showActions && pendingLog !== null;

  const handleApprove = async () => {
    if (!pendingLog) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await approveQuestLog(pendingLog.id, approverId);
      onActionComplete();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "承認に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!pendingLog) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await rejectQuestLog(pendingLog.id, approverId);
      onActionComplete();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "却下に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="mt-4 rounded-2xl bg-white p-5">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-xs font-semibold text-slate-400">選択中のタスク</Text>
          <Text className="mt-1 text-lg font-bold text-slate-900">{quest.title}</Text>
        </View>
        <Pressable
          accessibilityLabel="タスク詳細を閉じる"
          accessibilityRole="button"
          className="h-8 w-8 items-center justify-center rounded-full active:bg-slate-100"
          hitSlop={8}
          onPress={onClose}
        >
          <Text className="text-lg font-bold text-slate-400">×</Text>
        </Pressable>
      </View>

      <View className="mt-3 flex-row items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
        <Text className="text-xs font-semibold text-slate-400">報酬</Text>
        <Text className="text-base font-bold text-slate-900">
          {quest.reward_amount.toLocaleString("ja-JP")} PT
        </Text>
      </View>

      <Text className="mt-4 text-xs font-semibold text-slate-400">やること</Text>
      <Text className="mt-1 text-sm leading-5 text-slate-600">{quest.description}</Text>
      <Text className="mt-3 text-xs font-medium text-slate-400">
        現在：{QUEST_STATUS_LABELS[quest.status]}
      </Text>

      {showActions ? (
        <>
          <View className="mt-4 flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canApproveOrReject || isSubmitting }}
              className={`flex-1 items-center rounded-xl py-3 ${
                canApproveOrReject && !isSubmitting ? "bg-emerald-500 active:bg-emerald-600" : "bg-slate-200"
              }`}
              disabled={!canApproveOrReject || isSubmitting}
              onPress={handleApprove}
            >
              <Text
                className={`text-sm font-bold ${
                  canApproveOrReject && !isSubmitting ? "text-white" : "text-slate-400"
                }`}
              >
                承認
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canApproveOrReject || isSubmitting }}
              className={`flex-1 items-center rounded-xl py-3 ${
                canApproveOrReject && !isSubmitting ? "bg-rose-500 active:bg-rose-600" : "bg-slate-200"
              }`}
              disabled={!canApproveOrReject || isSubmitting}
              onPress={handleReject}
            >
              <Text
                className={`text-sm font-bold ${
                  canApproveOrReject && !isSubmitting ? "text-white" : "text-slate-400"
                }`}
              >
                却下
              </Text>
            </Pressable>
          </View>
          {errorMessage ? (
            <Text className="mt-2 text-center text-[11px] text-rose-500">{errorMessage}</Text>
          ) : !isLive ? (
            <Text className="mt-2 text-center text-[11px] text-slate-300">
              ※ プレビュー中はボタンを操作できません
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
