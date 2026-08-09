import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { clampPageIndex, getBarHeight, getPageIndexFromScrollOffset, getPageScrollOffset } from "./chartMath";
import type { CumulativePoint, PeriodSummary } from "./historyUtils";

type HistoryChartProps = {
  periods: PeriodSummary[];
  cumulativeSeries: CumulativePoint[];
};

const CHART_HEIGHT = 120;
const LINE_COLOR = "#0ea5e9";

const CHART_PAGES = [
  { key: "line", title: "累計ポイントの推移" },
  { key: "bar", title: "期間ごとの取得・利用" },
] as const;

function LineChartView({ points, width, height }: { points: CumulativePoint[]; width: number; height: number }) {
  const latest = points[points.length - 1];
  const values = points.map((point) => point.balance);
  const maxValue = Math.max(...values, 0);
  const minValue = Math.min(...values, 0);
  const range = Math.max(1, maxValue - minValue);
  const padding = 10;
  const plotWidth = Math.max(0, width - padding * 2);
  const plotHeight = Math.max(0, height - padding * 2);
  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  const coords = points.map((point, index) => ({
    x: padding + (points.length > 1 ? index * stepX : plotWidth / 2),
    y: padding + plotHeight - ((point.balance - minValue) / range) * plotHeight,
  }));

  return (
    <View>
      <View style={{ height, width }}>
        {coords.slice(0, -1).map((point, index) => {
          const next = coords[index + 1];
          const dx = next.x - point.x;
          const dy = next.y - point.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

          return (
            <View
              key={`segment-${points[index].key}`}
              style={{
                backgroundColor: LINE_COLOR,
                height: 2,
                left: point.x,
                position: "absolute",
                top: point.y,
                transform: [{ rotate: `${angle}deg` }],
                transformOrigin: "0 0",
                width: length,
              }}
            />
          );
        })}

        {coords.map((point, index) => (
          <View
            accessibilityLabel={`${points[index].label} 累計${points[index].balance >= 0 ? "+" : ""}${
              points[index].balance
            }ポイント`}
            accessible
            key={`dot-${points[index].key}`}
            style={{
              backgroundColor: LINE_COLOR,
              borderRadius: 5,
              height: 10,
              left: point.x - 5,
              position: "absolute",
              top: point.y - 5,
              width: 10,
            }}
          />
        ))}
      </View>

      <View className="mt-2 flex-row items-center justify-between px-1">
        <Text className="text-[10px] text-slate-400">{points[0]?.shortLabel}</Text>
        <Text className="text-sm font-bold text-sky-600">
          {latest && latest.balance >= 0 ? "+" : ""}
          {latest?.balance ?? 0}P
        </Text>
        {points.length > 1 && (
          <Text className="text-[10px] text-slate-400">{points[points.length - 1]?.shortLabel}</Text>
        )}
      </View>
    </View>
  );
}

function BarChartView({ periods, width, height }: { periods: PeriodSummary[]; width: number; height: number }) {
  const maxValue = Math.max(1, ...periods.flatMap((period) => [period.income, period.expense]));
  const columnWidth = width / periods.length;
  const barGap = 2;
  const barWidth = Math.max(2, Math.min(8, (columnWidth - barGap) / 2));

  return (
    <View>
      <View className="flex-row items-end" style={{ height, width }}>
        {periods.map((period) => (
          <View
            accessibilityLabel={`${period.label} 取得+${period.income}ポイント 利用-${period.expense}ポイント`}
            accessible
            className="items-center"
            key={period.key}
            style={{ width: columnWidth }}
          >
            <View className="flex-row items-end" style={{ gap: barGap, height }}>
              <View
                className="rounded-t bg-emerald-400"
                style={{ height: getBarHeight(period.income, maxValue, height), width: barWidth }}
              />
              <View
                className="rounded-t bg-rose-400"
                style={{ height: getBarHeight(period.expense, maxValue, height), width: barWidth }}
              />
            </View>
          </View>
        ))}
      </View>

      <View className="mt-2 flex-row" style={{ width }}>
        {periods.map((period) => (
          <Text
            className="text-center text-[10px] text-slate-400"
            key={period.key}
            numberOfLines={1}
            style={{ width: columnWidth }}
          >
            {period.shortLabel}
          </Text>
        ))}
      </View>

      <View className="mt-3 flex-row items-center justify-center gap-4">
        <View className="flex-row items-center gap-1">
          <View className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <Text className="text-xs text-slate-500">取得</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <Text className="text-xs text-slate-500">利用</Text>
        </View>
      </View>
    </View>
  );
}

export default function HistoryChart({ periods, cumulativeSeries }: HistoryChartProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const pageIndexRef = useRef(pageIndex);
  pageIndexRef.current = pageIndex;

  const handleLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  // 画面回転や分割画面でcontainerWidthが変わった際、表示中のページとスクロール位置がずれないよう再同期する
  useEffect(() => {
    if (containerWidth > 0) {
      scrollRef.current?.scrollTo({
        x: getPageScrollOffset(pageIndexRef.current, containerWidth),
        animated: false,
      });
    }
  }, [containerWidth]);

  const scrollToIndex = (index: number) => {
    const clamped = clampPageIndex(index, CHART_PAGES.length);
    scrollRef.current?.scrollTo({ x: getPageScrollOffset(clamped, containerWidth), animated: true });
    setPageIndex(clamped);
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (containerWidth === 0) {
      return;
    }
    setPageIndex(
      getPageIndexFromScrollOffset(event.nativeEvent.contentOffset.x, containerWidth, CHART_PAGES.length),
    );
  };

  if (periods.length === 0) {
    return (
      <View className="items-center justify-center py-10">
        <Text className="text-sm text-slate-400">表示できる履歴がありません</Text>
      </View>
    );
  }

  return (
    <View onLayout={handleLayout}>
      <Text className="text-center text-sm font-semibold text-slate-500">{CHART_PAGES[pageIndex].title}</Text>

      <ScrollView
        horizontal
        onMomentumScrollEnd={handleMomentumScrollEnd}
        pagingEnabled
        ref={scrollRef}
        showsHorizontalScrollIndicator={false}
      >
        <View className="mt-4" style={{ width: containerWidth }}>
          <LineChartView height={CHART_HEIGHT} points={cumulativeSeries} width={containerWidth} />
        </View>
        <View className="mt-4" style={{ width: containerWidth }}>
          <BarChartView height={CHART_HEIGHT} periods={periods} width={containerWidth} />
        </View>
      </ScrollView>

      <View className="mt-3 flex-row items-center justify-between px-2">
        <Pressable
          accessibilityLabel="前のグラフ"
          accessibilityRole="button"
          className="h-8 w-8 items-center justify-center rounded-full active:bg-slate-100"
          disabled={pageIndex === 0}
          onPress={() => scrollToIndex(pageIndex - 1)}
        >
          <Ionicons color={pageIndex === 0 ? "#cbd5e1" : "#64748b"} name="chevron-back" size={20} />
        </Pressable>

        <View className="flex-row gap-1.5">
          {CHART_PAGES.map((page, index) => (
            <View
              className={`h-1.5 w-1.5 rounded-full ${index === pageIndex ? "bg-slate-600" : "bg-slate-200"}`}
              key={page.key}
            />
          ))}
        </View>

        <Pressable
          accessibilityLabel="次のグラフ"
          accessibilityRole="button"
          className="h-8 w-8 items-center justify-center rounded-full active:bg-slate-100"
          disabled={pageIndex === CHART_PAGES.length - 1}
          onPress={() => scrollToIndex(pageIndex + 1)}
        >
          <Ionicons
            color={pageIndex === CHART_PAGES.length - 1 ? "#cbd5e1" : "#64748b"}
            name="chevron-forward"
            size={20}
          />
        </Pressable>
      </View>
    </View>
  );
}
