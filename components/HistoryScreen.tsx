import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_CURRENT_USER, MOCK_TRANSACTIONS } from "../constants/mockData";
import HistoryChart from "./history/HistoryChart";
import { groupTransactionsByPeriod, type HistoryGranularity } from "./history/historyUtils";

const GRANULARITY_OPTIONS: { value: HistoryGranularity; label: string }[] = [
  { value: "week", label: "週" },
  { value: "month", label: "月" },
  { value: "year", label: "年" },
];

function formatDate(isoDate: string) {
  const date = new Date(isoDate);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function HistoryScreen() {
  const [granularity, setGranularity] = useState<HistoryGranularity>("month");

  const transactions = useMemo(
    () =>
      MOCK_TRANSACTIONS.filter((transaction) => transaction.user_id === MOCK_CURRENT_USER.id).sort(
        (a, b) => (a.created_at < b.created_at ? 1 : -1),
      ),
    [],
  );

  const periods = useMemo(
    () => groupTransactionsByPeriod(transactions, granularity),
    [transactions, granularity],
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-row items-center px-4 py-3">
        <Pressable
          accessibilityLabel="前の画面に戻る"
          accessibilityRole="button"
          className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-200"
          onPress={() => router.back()}
        >
          <Ionicons color="#0f172a" name="chevron-back" size={24} />
        </Pressable>
        <Text className="ml-1 text-2xl font-bold text-slate-900">{MOCK_CURRENT_USER.name}のりれき</Text>
      </View>

      <ScrollView contentContainerClassName="px-6 pb-10" showsVerticalScrollIndicator={false}>
        <View className="mt-2 items-center rounded-2xl bg-white px-4 py-5">
          <View className="flex-row self-start rounded-full bg-slate-100 p-1">
            {GRANULARITY_OPTIONS.map((option) => (
              <Pressable
                accessibilityLabel={`${option.label}ごとに表示`}
                accessibilityRole="button"
                accessibilityState={{ selected: granularity === option.value }}
                className={`rounded-full px-4 py-1.5 ${
                  granularity === option.value ? "bg-white shadow-sm" : ""
                }`}
                key={option.value}
                onPress={() => setGranularity(option.value)}
              >
                <Text
                  className={`text-sm font-medium ${
                    granularity === option.value ? "text-slate-900" : "text-slate-400"
                  }`}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="mt-4 w-full">
            <HistoryChart key={granularity} periods={periods} />
          </View>
        </View>

        <Text className="mt-6 text-sm font-semibold text-slate-500">取引履歴</Text>
        <View className="mt-2 overflow-hidden rounded-2xl bg-white">
          {transactions.length === 0 ? (
            <Text className="px-4 py-6 text-center text-sm text-slate-400">まだ履歴がありません</Text>
          ) : (
            transactions.map((transaction, index) => (
              <View
                accessibilityLabel={`${formatDate(transaction.created_at)} ${transaction.description} ${
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
                  <Text className="mt-0.5 text-xs text-slate-400">{formatDate(transaction.created_at)}</Text>
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
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
