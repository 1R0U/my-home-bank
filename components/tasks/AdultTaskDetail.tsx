import { Pressable, Text, View } from "react-native";
import type { Quest } from "../../types";
import { QUEST_STATUS_LABELS } from "./taskUtils";

type AdultTaskDetailProps = {
  quest: Quest;
  onClose: () => void;
  showActions?: boolean;
};

export default function AdultTaskDetail({ quest, onClose, showActions = false }: AdultTaskDetailProps) {
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
              accessibilityState={{ disabled: true }}
              className="flex-1 items-center rounded-xl bg-slate-200 py-3"
              disabled
            >
              <Text className="text-sm font-bold text-slate-400">承認</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              className="flex-1 items-center rounded-xl bg-slate-200 py-3"
              disabled
            >
              <Text className="text-sm font-bold text-slate-400">却下</Text>
            </Pressable>
          </View>
          <Text className="mt-2 text-center text-[11px] text-slate-300">
            ※ ボタンの動作は今後実装予定です
          </Text>
        </>
      ) : null}
    </View>
  );
}
