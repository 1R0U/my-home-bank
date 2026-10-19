import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ERROR_TEXT_CLASS, NOTICE_TEXT_CLASS } from "../../constants/ui";
import { parseQuestDeadlineInput, questDeadlineParts } from "../../lib/questDeadline";
import QuestDeadlinePicker from "./QuestDeadlinePicker";

export function questDeadlineInputError(value: string): string | null {
  try {
    parseQuestDeadlineInput(value);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/** 作成・編集で同じ日時選択を使う。確定前のキャンセルでは値を変更しない。 */
export default function QuestDeadlineField({ value, onChange, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (disabled) setPicking(false);
  }, [disabled]);
  const error = questDeadlineInputError(value);
  return (
    <View className="mt-4">
      <Text className="text-xs font-semibold text-slate-500">期限（任意・日本時間）</Text>
      <Pressable
        accessibilityLabel="限定タスクの期限"
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityValue={{ text: value || "期限なし" }}
        className={`mt-1 rounded-xl bg-slate-50 px-4 py-3 ${disabled ? "opacity-50" : ""}`}
        disabled={disabled}
        onPress={() => setPicking(true)}
      >
        <Text className="text-sm font-semibold text-slate-900">{value || "日時を選ぶ"}</Text>
      </Pressable>
      {picking && !disabled ? (
        <QuestDeadlinePicker
          initial={questDeadlineParts(value)}
          onCancel={() => setPicking(false)}
          onConfirm={(text) => { onChange(text); setPicking(false); }}
        />
      ) : null}
      {value ? (
        <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => onChange("")}>
          <Text className="mt-2 text-xs font-semibold text-slate-600">期限なしにする</Text>
        </Pressable>
      ) : null}
      <Text className={`mt-2 text-xs ${NOTICE_TEXT_CLASS}`}>
        空欄なら期限なし。設定日時になると受注・完了申請を締め切ります。過去の日時なら、すぐに期限切れになります。
      </Text>
      {error ? <Text className={`mt-1 text-xs ${ERROR_TEXT_CLASS}`}>{error}</Text> : null}
    </View>
  );
}
