import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_TRANSACTIONS } from "../constants/mockData";
import { classifyCashFlow } from "../lib/transactionClassification";
import { fetchTransactions } from "../lib/transactions";
import { useCurrentUser, useDataAccess } from "../store";
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

/**
 * 次に切り替える集計の粒度を返す（日→週→月→年→日の順に循環する）。
 * @param current - 現在の粒度
 * @returns 次の粒度
 */
function nextGranularity(current: HistoryGranularity): HistoryGranularity {
  const index = GRANULARITY_ORDER.indexOf(current);
  return GRANULARITY_ORDER[(index + 1) % GRANULARITY_ORDER.length];
}

/**
 * 取引履歴の一覧に出す日付ラベルを作る（例: "8/2"）。
 * @param isoDate - ISO形式の日時文字列
 * @returns 月日の短縮ラベル
 */
function formatDate(isoDate: string) {
  return formatShortPeriodLabel(getPeriodKey(isoDate, "day"), "day");
}

/**
 * 金額の表示色を取引種別から決める。
 * 振替（預入・引き出し・借り入れ・返済）と未知の種別は、収入・支出と取り違えないよう
 * 中立色にする。符号（＋−）は財布の増減としてそのまま表示する（Issue #143）。
 */
function amountColorClass(transactionType: string): string {
  const cashFlowClass = classifyCashFlow(transactionType);

  if (cashFlowClass === "income") return "text-emerald-600";
  if (cashFlowClass === "expense") return "text-rose-600";
  return "text-slate-500";
}

/**
 * 読み上げ用に、振替であることを補う語を返す。
 * 収入・支出との違いを色だけで表すと読み上げでは伝わらないため、文言でも区別する。
 */
function amountSuffixLabel(transactionType: string): string {
  return classifyCashFlow(transactionType) === "transfer" ? "（振替）" : "";
}

/**
 * 取引履歴の画面。収支グラフと取引の一覧を、ログイン中の利用者について表示する。
 *
 * 取引は Supabase から取得する（モックアカウントで入った場合だけモックデータを使う）。
 * 収支グラフの粒度は日・週・月・年から選べ、金額の表示は取引種別の分類に従う。
 */
export default function HistoryScreen() {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const [granularity, setGranularity] = useState<HistoryGranularity>("month");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    // ユーザー切替時、フェッチ完了までグラフ等に前のユーザーの取引が残らないようにクリアする
    setTransactions([]);
    setErrorMessage(null);

    // 利用者のIDで引く取得なので、IDがUUIDでないときは呼びに行かず
    // モックデータを表示する（#174。判定の理由は useDataAccess の説明を参照）。
    if (!canUseRealData) {
      setTransactions(filterTransactionsByUser(MOCK_TRANSACTIONS, currentUser.id));
      setIsLoading(false);
      return;
    }

    // ここは reload を外へ返さず、この effect の中でしか取得しない。そのため
    // 他のフック（useQuests など）が使う createStaleGuard ではなく、
    // アンマウント時の後始末も兼ねられる isCancelled を使う。
    let isCancelled = false;
    setIsLoading(true);

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
  }, [canUseRealData, currentUser]);

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
                  }${transaction.amount}ポイント${amountSuffixLabel(transaction.type)}`}
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
                  <Text className={`text-base font-bold ${amountColorClass(transaction.type)}`}>
                    {transaction.amount >= 0 ? "+" : ""}
                    {transaction.amount}P
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {currentUser.role === "parent" && <AdultBottomNav activeKey="history" />}
    </SafeAreaView>
  );
}
