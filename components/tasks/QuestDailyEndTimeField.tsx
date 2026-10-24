import { useEffect, useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { ERROR_TEXT_CLASS } from "../../constants/ui";
import { parseQuestDailyEndTime } from "../../lib/questPeriod";

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const OPTION_HEIGHT = 48;
const pad = (value: number) => String(value).padStart(2, "0");

/** 日本時間の時・分を選択し、確定するまでフォームの値を変更しない。 */
export default function QuestDailyEndTimeField({ value, onChange, disabled }: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  useEffect(() => {
    if (disabled) setDraft(null);
  }, [disabled]);
  const minutes = parseQuestDailyEndTime(value);

  return <View className="mt-4">
    <Text className="text-xs font-semibold text-slate-500">デイリーの終了時刻（日本時間）</Text>
    <Pressable
      accessibilityLabel="デイリーの終了時刻" accessibilityRole="button"
      accessibilityState={{ disabled }} accessibilityValue={{ text: value || "未設定" }}
      disabled={disabled} onPress={() => setDraft(minutes ?? 0)}
      className={`mt-1 rounded-xl bg-slate-50 px-4 py-3 ${disabled ? "opacity-50" : ""}`}
    >
      <Text className="text-sm font-semibold text-slate-900">{minutes === null ? "時刻を選ぶ" : value}</Text>
      <Text className="mt-1 text-xs text-slate-600">タップして時・分を選択</Text>
    </Pressable>
    {minutes === null ? <Text className={`mt-1 text-xs ${ERROR_TEXT_CLASS}`}>終了時刻を選択してください</Text> : null}
    {draft !== null && !disabled ? <Modal animationType="fade" transparent visible testID="daily-end-time-picker" onRequestClose={() => setDraft(null)}>
      <View className="flex-1 justify-center bg-black/50 px-4">
        <View accessibilityViewIsModal className="rounded-2xl bg-white p-5">
          <View className="mb-3 flex-row items-center justify-between">
            <Text accessibilityRole="header" className="text-lg font-bold text-slate-900">終了時刻を選択</Text>
            <Pressable accessibilityRole="button" className="px-2 py-3" onPress={() => setDraft(null)}>
              <Text className="font-semibold text-slate-600">キャンセル</Text>
            </Pressable>
          </View>
          <Text className="mb-3 text-xs text-slate-600">日本時間・24時間表記</Text>
          <View className="flex-row gap-3">
            {(["hour", "minute"] as const).map((part) => {
              const isHour = part === "hour";
              const selected = isHour ? Math.floor(draft / 60) : draft % 60;
              const unit = isHour ? "時" : "分";
              return <View className="flex-1" key={part}>
                <Text className="mb-1 text-center text-xs font-semibold text-slate-500">{unit}</Text>
                <FlatList
                  accessibilityLabel={`終了時刻の${unit}`} data={isHour ? HOURS : MINUTES}
                  extraData={selected}
                  getItemLayout={(_, index) => ({ length: OPTION_HEIGHT, offset: OPTION_HEIGHT * index, index })}
                  initialScrollIndex={Math.max(0, selected - 2)}
                  keyExtractor={(item) => String(item)}
                  style={{ height: OPTION_HEIGHT * 5 }}
                  renderItem={({ item }) => <Pressable
                    accessibilityRole="button" accessibilityLabel={`${item}${unit}`}
                    accessibilityState={{ selected: item === selected }}
                    className={`items-center justify-center rounded-lg ${item === selected ? "bg-slate-900" : "active:bg-slate-100"}`}
                    style={{ height: OPTION_HEIGHT }}
                    onPress={() => setDraft((current) => current === null ? null
                      : isHour ? item * 60 + current % 60 : Math.floor(current / 60) * 60 + item)}
                  >
                    <Text className={`text-base font-semibold ${item === selected ? "text-white" : "text-slate-900"}`}>{pad(item)}{unit}</Text>
                  </Pressable>}
                />
              </View>;
            })}
          </View>
          <Pressable accessibilityRole="button" className="mt-5 items-center rounded-xl bg-slate-900 py-3"
            onPress={() => { onChange(`${pad(Math.floor(draft / 60))}:${pad(draft % 60)}`); setDraft(null); }}
          >
            <Text className="font-bold text-white">この時刻にする</Text>
          </Pressable>
        </View>
      </View>
    </Modal> : null}
  </View>;
}
