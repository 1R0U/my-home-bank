import { useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { changeQuestDeadlinePart, formatQuestDeadlineParts, questDeadlineDaysInMonth } from "../../lib/questDeadline";
import type { QuestDeadlineParts } from "../../lib/questDeadline";

type Part = keyof QuestDeadlineParts;
const PARTS: Part[] = ["year", "month", "day", "hour", "minute"];
const LABELS: Record<Part, string> = { year: "年", month: "月", day: "日", hour: "時", minute: "分" };
const YEARS = Array.from({ length: 9999 }, (_, index) => index + 1);
const OPTION_HEIGHT = 48;

/** 年月日時分を分けて選ぶ。候補の変更は「この日時にする」で確定するまで親へ渡さない。 */
export default function QuestDeadlinePicker({ initial, onCancel, onConfirm }: {
  initial: QuestDeadlineParts;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [part, setPart] = useState<Part | null>(null);
  const max = part === "day" ? questDeadlineDaysInMonth(draft.year, draft.month)
    : part === "month" ? 12 : part === "hour" ? 24 : 60;
  const start = part === "hour" || part === "minute" ? 0 : 1;
  const options = part === "year" ? YEARS : Array.from({ length: max }, (_, index) => index + start);

  return (
    <Modal animationType="fade" onRequestClose={() => part ? setPart(null) : onCancel()} transparent visible>
      <View className="flex-1 justify-center bg-black/50 px-4">
        <View accessibilityViewIsModal className="rounded-2xl bg-white p-5">
          <View className="mb-4 flex-row items-center justify-between">
            <Text accessibilityRole="header" className="text-lg font-bold text-slate-900">
              {part ? `${LABELS[part]}を選択` : "期限を選択"}
            </Text>
            <Pressable accessibilityRole="button" className="px-2 py-3" onPress={onCancel}>
              <Text className="font-semibold text-slate-600">キャンセル</Text>
            </Pressable>
          </View>
          {part ? (
            <>
              <FlatList
                data={options}
                getItemLayout={(_, index) => ({ length: OPTION_HEIGHT, offset: OPTION_HEIGHT * index, index })}
                initialScrollIndex={Math.max(0, options.indexOf(draft[part]) - 2)}
                key={part}
                keyExtractor={(item) => String(item)}
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityLabel={`${item}${LABELS[part]}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: item === draft[part] }}
                    className={`items-center justify-center rounded-lg ${item === draft[part] ? "bg-slate-900" : "active:bg-slate-100"}`}
                    onPress={() => { setDraft(changeQuestDeadlinePart(draft, part, item)); setPart(null); }}
                    style={{ height: OPTION_HEIGHT }}
                  >
                    <Text className={`text-base font-semibold ${item === draft[part] ? "text-white" : "text-slate-900"}`}>
                      {item}{LABELS[part]}
                    </Text>
                  </Pressable>
                )}
                style={{ height: OPTION_HEIGHT * 6 }}
              />
              <Pressable accessibilityRole="button" className="mt-3 items-center py-3" onPress={() => setPart(null)}>
                <Text className="font-semibold text-slate-600">日時の選択に戻る</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text className="mb-3 text-xs text-slate-600">日本時間・24時間表記</Text>
              <View className="flex-row gap-1">
                {PARTS.map((key) => (
                  <View className="flex-1" key={key}>
                    <Text className="mb-1 text-center text-xs font-semibold text-slate-500">{LABELS[key]}</Text>
                    <Pressable
                      accessibilityLabel={`期限の${LABELS[key]}`}
                      accessibilityRole="button"
                      accessibilityValue={{ text: `${draft[key]}${LABELS[key]}` }}
                      className="items-center rounded-lg bg-slate-100 px-1 py-3 active:bg-slate-200"
                      onPress={() => setPart(key)}
                    >
                      <Text adjustsFontSizeToFit className="text-base font-bold text-slate-900" numberOfLines={1}>
                        {key === "year" ? draft[key] : String(draft[key]).padStart(2, "0")}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                className="mt-5 items-center rounded-xl bg-slate-900 py-3"
                onPress={() => onConfirm(formatQuestDeadlineParts(draft))}
              >
                <Text className="font-bold text-white">この日時にする</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
