import { Pressable, Text, TextInput, View } from "react-native";
import { ERROR_TEXT_CLASS, NOTICE_TEXT_CLASS, PLACEHOLDER_TEXT_COLOR } from "../../constants/ui";
import { parseQuestDeadlineInput } from "../../lib/questDeadline";

export function questDeadlineInputError(value: string): string | null {
  try {
    parseQuestDeadlineInput(value);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/** 作成・編集で同じ入力形式と説明を使う。空欄への変更で期限を解除できる。 */
export default function QuestDeadlineField({ value, onChange, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const error = questDeadlineInputError(value);
  return (
    <View className="mt-4">
      <Text className="text-xs font-semibold text-slate-500">期限（任意・日本時間）</Text>
      <TextInput
        accessibilityLabel="限定タスクの期限"
        autoCapitalize="none"
        className="mt-1 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-900"
        editable={!disabled}
        onChangeText={onChange}
        placeholder="YYYY/MM/DD HH:mm"
        placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
        value={value}
      />
      {value ? (
        <Pressable accessibilityRole="button" disabled={disabled} onPress={() => onChange("")}>
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
