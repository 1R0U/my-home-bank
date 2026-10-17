import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { UI_COLORS } from "../constants/ui";
import { buildMonthGrid, formatRestDay, isSelectableRestDay, restDayRange, shiftMonth } from "../lib/questRestDays";

type YearMonth = { year: number; month: number };

type Props = {
  /** 日本時間の今日（`YYYY-MM-DD`） */
  today: string;
  month: YearMonth;
  onChangeMonth: (month: YearMonth) => void;
  /** 選んでいる日付 */
  selectedDays: ReadonlySet<string>;
  /** 日付ごとの、選んでいる子供のうちお休みの人数 */
  restCounts: ReadonlyMap<string, number>;
  /** 選んでいる子供の人数（全員お休みかどうかの表示に使う） */
  childCount: number;
  onToggleDay: (day: string) => void;
};

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 家事をしなくていい日を選ぶカレンダー（Issue #396）。
 *
 * 日付を押すと選ぶ／選ぶのをやめる。選べるのは1週間前から1年先まで。
 * お休みになっている日には、選んでいる子供のうち何人がお休みかを小さく出す。
 */
export default function RestDayCalendar({
  today,
  month,
  onChangeMonth,
  selectedDays,
  restCounts,
  childCount,
  onToggleDay,
}: Props) {
  const { min, max } = restDayRange(today);
  const monthKey = `${month.year}-${String(month.month).padStart(2, "0")}`;
  const canGoBack = monthKey > min.slice(0, 7);
  const canGoForward = monthKey < max.slice(0, 7);

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityLabel="前の月"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoBack }}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100"
          disabled={!canGoBack}
          onPress={() => onChangeMonth(shiftMonth(month, -1))}
        >
          <Ionicons color={canGoBack ? UI_COLORS.slate700 : UI_COLORS.slate300} name="chevron-back" size={20} />
        </Pressable>
        <Text accessibilityRole="header" className="text-base font-bold text-slate-900">
          {month.year}年{month.month}月
        </Text>
        <Pressable
          accessibilityLabel="次の月"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoForward }}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100"
          disabled={!canGoForward}
          onPress={() => onChangeMonth(shiftMonth(month, 1))}
        >
          <Ionicons color={canGoForward ? UI_COLORS.slate700 : UI_COLORS.slate300} name="chevron-forward" size={20} />
        </Pressable>
      </View>

      <View className="flex-row">
        {WEEKDAY_LABELS.map((label) => (
          <Text className="flex-1 text-center text-xs font-semibold text-slate-500" key={label}>
            {label}
          </Text>
        ))}
      </View>

      {buildMonthGrid(month.year, month.month).map((week, weekIndex) => (
        <View className="flex-row" key={weekIndex}>
          {week.map((day, dayIndex) => {
            if (!day) return <View className="h-12 flex-1" key={dayIndex} />;
            const selectable = isSelectableRestDay(day, today);
            const selected = selectedDays.has(day);
            const restCount = restCounts.get(day) ?? 0;
            const allRest = childCount > 0 && restCount >= childCount;
            const restLabel = restCount === 0 ? "" : allRest ? "、お休み" : `、${restCount}人お休み`;
            return (
              <Pressable
                accessibilityLabel={`${formatRestDay(day)}${day === today ? "、今日" : ""}${restLabel}`}
                accessibilityRole="button"
                // 範囲を出た日でも、選んだままなら外せるようにする（日付が変わったときに選んだまま残らないように）
                accessibilityState={{ disabled: !selectable && !selected, selected }}
                className={`m-0.5 h-12 flex-1 items-center justify-center rounded-lg ${
                  selected ? "bg-blue-600" : allRest ? "bg-orange-100" : restCount > 0 ? "bg-orange-50" : ""
                } ${day === today && !selected ? "border border-slate-400" : ""}`}
                disabled={!selectable && !selected}
                key={day}
                onPress={() => onToggleDay(day)}
                testID={`rest-day-${day}`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    selected ? "text-white" : selectable ? "text-slate-900" : "text-slate-400"
                  }`}
                >
                  {Number(day.slice(8, 10))}
                </Text>
                {restCount > 0 ? (
                  <Text className={`text-[10px] font-bold ${selected ? "text-white" : "text-orange-700"}`}>
                    {allRest ? "休" : `休${restCount}`}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
