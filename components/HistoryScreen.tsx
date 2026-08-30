import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_TRANSACTIONS } from "../constants/mockData";
import { DEV_ROLE_OVERRIDE } from "../lib/devRole";
import { fetchTransactions } from "../lib/transactions";
import { useCurrentUser } from "../store";
import type { Transaction } from "../types";
import AdultBottomNav from "./nav/AdultBottomNav";
import ScreenHeader from "./ScreenHeader";
import HistoryChart from "./history/HistoryChart";
import {
  buildCumulativeSeries,
  filterTransactionsByUser,
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
  const currentUser = useCurrentUser();
  const [granularity, setGranularity] = useState<HistoryGranularity>("month");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    // 開発用のロールプレビュー中は実ログインしていないため、他画面と同様にモックデータを使う
    if (DEV_ROLE_OVERRIDE) {
      setTransactions(filterTransactionsByUser(MOCK_TRANSACTIONS, currentUser.id));
      setErrorMessage(null);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    fetchTransactions(currentUser.id)
      .then((data) => {
        if (!isCancelled) setTransactions(data);
      })
      .catch((error: Error) => {
        if (!isCancelled) setErrorMessage(error.message);
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [currentUser]);

  const sortedTransactions = useMemo(
    () =>
      [...transactions].sort((a, b) =>
        a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
      ),
    [transactions],
  );

  const periods = useMemo(
    () => groupTransactionsByPeriod(sortedTransactions, granularity),
    [sortedTransactions, granularity],
  );

  const cumulativeSeries = useMemo(() => buildCumulativeSeries(periods), [periods]);

  if (!currentUser) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-100" edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text className="text-sm text-slate-400">ログインしてください</Text>
      </SafeAreaView>
    );
  }

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
          {isLoading ? (
            <View className="items-center px-4 py-10">
              <ActivityIndicator color="#475569" />
            </View>
          ) : errorMessage ? (
            <Text className="px-4 py-6 text-center text-sm text-rose-500">{errorMessage}</Text>
          ) : sortedTransactions.length === 0 ? (
            <Text className="px-4 py-6 text-center text-sm text-slate-400">まだ履歴がありません</Text>
          ) : (
            sortedTransactions.map((transaction, index) => {
              const dateLabel = formatDate(transaction.created_at);

              return (
                <View
                  accessibilityLabel={`${dateLabel} ${transaction.description} ${
                    transaction.amount >= 0 ? "+" : ""
                  }${transaction.amount}ポイント`}
                  accessible
                  className={`flex-row items-center justify-between px-4 py-4 ${
                    index !== sortedTransactions.length - 1 ? "border-b border-slate-100" : ""
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

      <AdultBottomNav activeKey="history" />
    </SafeAreaView>
  );
}
