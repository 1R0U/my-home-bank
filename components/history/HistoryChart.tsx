import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { PeriodSummary } from "./historyUtils";

type HistoryChartProps = {
  periods: PeriodSummary[];
};

const CHART_HEIGHT = 140;
const CARD_HORIZONTAL_INSET = 32; // 履歴画面のカード内側の左右余白ぶんを差し引く

export default function HistoryChart({ periods }: HistoryChartProps) {
  const { width } = useWindowDimensions();
  const pageWidth = width - CARD_HORIZONTAL_INSET;
  const scrollRef = useRef<ScrollView>(null);
  const [pageIndex, setPageIndex] = useState(Math.max(periods.length - 1, 0));

  const maxValue = Math.max(1, ...periods.flatMap((period) => [period.income, period.expense]));

  const scrollToIndex = (index: number) => {
    const clamped = Math.min(Math.max(index, 0), periods.length - 1);
    scrollRef.current?.scrollTo({ x: clamped * pageWidth, animated: true });
    setPageIndex(clamped);
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setPageIndex(Math.min(Math.max(index, 0), periods.length - 1));
  };

  if (periods.length === 0) {
    return (
      <View className="items-center justify-center py-10">
        <Text className="text-sm text-slate-400">表示できる履歴がありません</Text>
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        contentOffset={{ x: pageIndex * pageWidth, y: 0 }}
        horizontal
        onMomentumScrollEnd={handleMomentumScrollEnd}
        pagingEnabled
        ref={scrollRef}
        showsHorizontalScrollIndicator={false}
      >
        {periods.map((period) => (
          <View className="items-center" key={period.key} style={{ width: pageWidth }}>
            <Text className="text-sm font-semibold text-slate-500">{period.label}</Text>

            <View className="mt-4 flex-row items-end gap-10" style={{ height: CHART_HEIGHT }}>
              <View className="items-center">
                <View
                  className="w-10 rounded-t-lg bg-emerald-400"
                  style={{ height: Math.max(4, (period.income / maxValue) * CHART_HEIGHT) }}
                />
                <Text className="mt-2 text-xs text-slate-500">収入</Text>
                <Text className="text-sm font-bold text-emerald-600">+{period.income}P</Text>
              </View>

              <View className="items-center">
                <View
                  className="w-10 rounded-t-lg bg-rose-400"
                  style={{ height: Math.max(4, (period.expense / maxValue) * CHART_HEIGHT) }}
                />
                <Text className="mt-2 text-xs text-slate-500">支出</Text>
                <Text className="text-sm font-bold text-rose-600">-{period.expense}P</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      <View className="mt-3 flex-row items-center justify-between px-2">
        <Pressable
          accessibilityLabel="前の期間"
          accessibilityRole="button"
          className="h-8 w-8 items-center justify-center rounded-full active:bg-slate-100"
          disabled={pageIndex === 0}
          onPress={() => scrollToIndex(pageIndex - 1)}
        >
          <Ionicons color={pageIndex === 0 ? "#cbd5e1" : "#64748b"} name="chevron-back" size={20} />
        </Pressable>

        <View className="flex-row gap-1.5">
          {periods.map((period, index) => (
            <View
              className={`h-1.5 w-1.5 rounded-full ${index === pageIndex ? "bg-slate-600" : "bg-slate-200"}`}
              key={period.key}
            />
          ))}
        </View>

        <Pressable
          accessibilityLabel="次の期間"
          accessibilityRole="button"
          className="h-8 w-8 items-center justify-center rounded-full active:bg-slate-100"
          disabled={pageIndex === periods.length - 1}
          onPress={() => scrollToIndex(pageIndex + 1)}
        >
          <Ionicons
            color={pageIndex === periods.length - 1 ? "#cbd5e1" : "#64748b"}
            name="chevron-forward"
            size={20}
          />
        </Pressable>
      </View>
    </View>
  );
}
