import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

type AdultTaskCreateFormProps = {
  onClose: () => void;
};

export default function AdultTaskCreateForm({ onClose }: AdultTaskCreateFormProps) {
  const [title, setTitle] = useState("");
  const [rewardAmount, setRewardAmount] = useState("");
  const [description, setDescription] = useState("");

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
        accessibilityState={{ disabled: true }}
        className="mt-4 items-center rounded-xl bg-slate-200 py-3"
        disabled
      >
        <Text className="text-sm font-bold text-slate-400">追加</Text>
      </Pressable>
      <Text className="mt-2 text-center text-[11px] text-slate-300">
        ※ ボタンの動作は今後実装予定です
      </Text>
    </View>
  );
}
