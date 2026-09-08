import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { createQuest } from "../../lib/taskService";
import type { QuestCategory } from "../../types";
import { QUEST_CATEGORY_LABELS } from "./taskUtils";

type AdultTaskCreateFormProps = {
  onClose: () => void;
  createdBy: string;
  isLive: boolean;
  onCreated: () => void;
};

const categories = Object.keys(QUEST_CATEGORY_LABELS) as QuestCategory[];

export default function AdultTaskCreateForm({
  onClose,
  createdBy,
  isLive,
  onCreated,
}: AdultTaskCreateFormProps) {
  const [title, setTitle] = useState("");
  const [rewardAmount, setRewardAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<QuestCategory>("daily");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsedReward = Number(rewardAmount);
  const canSubmit =
    isLive &&
    title.trim().length > 0 &&
    rewardAmount.trim().length > 0 &&
    Number.isFinite(parsedReward) &&
    parsedReward >= 0 &&
    !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await createQuest({
        category,
        created_by: createdBy,
        description: description.trim(),
        reward_amount: parsedReward,
        title: title.trim(),
      });
      onCreated();
      onClose();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "タスクの追加に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="mt-4 rounded-2xl bg-white p-5">
      <View className="flex-row items-start justify-between">
        <Text className="text-lg font-bold text-slate-900">タスクを追加</Text>
        <Pressable
          accessibilityLabel="タスク追加を閉じる"
          accessibilityRole="button"
          className="h-8 w-8 items-center justify-center rounded-full active:bg-slate-100"
          hitSlop={8}
          onPress={onClose}
        >
          <Text className="text-lg font-bold text-slate-400">×</Text>
        </Pressable>
      </View>

      <Text className="mt-4 text-xs font-semibold text-slate-400">タイトル</Text>
      <TextInput
        className="mt-1 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-900"
        onChangeText={setTitle}
        placeholder="タスク名を入力"
        placeholderTextColor="#94a3b8"
        value={title}
      />

      <Text className="mt-4 text-xs font-semibold text-slate-400">カテゴリ</Text>
      <View className="mt-1 flex-row gap-2">
        {categories.map((c) => {
          const isSelected = c === category;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              className={`flex-1 items-center rounded-xl py-2.5 ${
                isSelected ? "bg-slate-900" : "bg-slate-50"
              }`}
              key={c}
              onPress={() => setCategory(c)}
            >
              <Text className={`text-sm font-semibold ${isSelected ? "text-white" : "text-slate-500"}`}>
                {QUEST_CATEGORY_LABELS[c]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="mt-4 text-xs font-semibold text-slate-400">ポイント</Text>
      <TextInput
        className="mt-1 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-900"
        keyboardType="numeric"
        onChangeText={setRewardAmount}
        placeholder="0"
        placeholderTextColor="#94a3b8"
        value={rewardAmount}
      />

      <Text className="mt-4 text-xs font-semibold text-slate-400">詳細</Text>
      <TextInput
        className="mt-1 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-900"
        multiline
        numberOfLines={3}
        onChangeText={setDescription}
        placeholder="やることを入力"
        placeholderTextColor="#94a3b8"
        style={{ minHeight: 72, textAlignVertical: "top" }}
        value={description}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
        className={`mt-4 items-center rounded-xl py-3 ${canSubmit ? "bg-slate-900 active:bg-slate-700" : "bg-slate-200"}`}
        disabled={!canSubmit}
        onPress={handleSubmit}
      >
        <Text className={`text-sm font-bold ${canSubmit ? "text-white" : "text-slate-400"}`}>追加</Text>
      </Pressable>
      {errorMessage ? (
        <Text className="mt-2 text-center text-[11px] text-rose-500">{errorMessage}</Text>
      ) : !isLive ? (
        <Text className="mt-2 text-center text-[11px] text-slate-300">
          ※ プレビュー中はボタンを操作できません
        </Text>
      ) : null}
    </View>
  );
}
