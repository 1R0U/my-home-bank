import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_CURRENT_PARENT_USER, MOCK_CURRENT_USER, MOCK_TRANSACTIONS } from "../constants/mockData";
import { useActiveRole } from "../store";
import ScreenHeader from "./ScreenHeader";
import HistoryChart from "./history/HistoryChart";
import {
  buildCumulativeSeries,
  formatShortPeriodLabel,
  getPeriodKey,
  groupTransactionsByPeriod,
  type HistoryGranularity,
} from "./history/historyUtils";

const GRANULARITY_ORDER: HistoryGranularity[] = ["day", "week", "month", "year"];

const GRANULARITY_LABELS: Record<HistoryGranularity, string> = {
  day: "日",
  week: "週",
  month: "月",
  year: "年",
};

function nextGranularity(current: HistoryGranularity): HistoryGranularity {
  const index = GRANULARITY_ORDER.indexOf(current);
  return GRANULARITY_ORDER[(index + 1) % GRANULARITY_ORDER.length];
}

function formatDate(isoDate: string) {
  return formatShortPeriodLabel(getPeriodKey(isoDate, "day"), "day");
}

export default function HistoryScreen() {
  const role = useActiveRole();
  const currentUser = role === "parent" ? MOCK_CURRENT_PARENT_USER : MOCK_CURRENT_USER;
  const [granularity, setGranularity] = useState<HistoryGranularity>("month");

  const transactions = useMemo(
    () =>
      MOCK_TRANSACTIONS.filter((transaction) => transaction.user_id === currentUser.id).sort((a, b) =>
        a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
      ),
    [currentUser.id],
  );

  const periods = useMemo(
    () => groupTransactionsByPeriod(transactions, granularity),
    [transactions, granularity],
  );

  const cumulativeSeries = useMemo(() => buildCumulativeSeries(periods), [periods]);

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScreenHeader title={`${currentUser.name}のりれき`} />

      <ScrollView contentContainerClassName="px-6 pb-10" showsVerticalScrollIndicator={false}>
        <View className="mt-2 rounded-2xl bg-white px-4 py-5">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-slate-400">収支グラフ</Text>
            <Pressable
              accessibilityLabel={`表示期間: ${GRANULARITY_LABELS[granularity]}単位。タップで切り替え`}
              accessibilityRole="button"
              className="flex-row items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 active:bg-slate-200"
              onPress={() => setGranularity((current) => nextGranularity(current))}
            >
              <Ionicons color="#475569" name="swap-horizontal" size={14} />
              <Text className="text-xs font-semibold text-slate-600">{GRANULARITY_LABELS[granularity]}単位</Text>
            </Pressable>
          </View>

          <View className="mt-2">
            <HistoryChart cumulativeSeries={cumulativeSeries} periods={periods} />
          </View>
        </View>

        <Text className="mt-6 text-sm font-semibold text-slate-500">取引履歴</Text>
        <View className="mt-2 overflow-hidden rounded-2xl bg-white">
          {transactions.length === 0 ? (
            <Text className="px-4 py-6 text-center text-sm text-slate-400">まだ履歴がありません</Text>
          ) : (
            transactions.map((transaction, index) => {
              const dateLabel = formatDate(transaction.created_at);

              return (
                <View
                  accessibilityLabel={`${dateLabel} ${transaction.description} ${
                    transaction.amount >= 0 ? "+" : ""
                  }${transaction.amount}ポイント`}
                  accessible
                  className={`flex-row items-center justify-between px-4 py-4 ${
                    index !== transactions.length - 1 ? "border-b border-slate-100" : ""
                  }`}
                  key={transaction.id}
                >
                  <View className="flex-1 pr-3">
                    <Text className="text-sm font-medium text-slate-900">{transaction.description}</Text>
                    <Text className="mt-0.5 text-xs text-slate-400">{dateLabel}</Text>
                  </View>
                  <Text
                    className={`text-base font-bold ${
                      transaction.amount >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {transaction.amount >= 0 ? "+" : ""}
                    {transaction.amount}P
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
