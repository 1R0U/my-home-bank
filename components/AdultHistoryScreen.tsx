import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCurrentUser } from "../store";
import LoadingSpinner from "./LoadingSpinner";
import ScreenHeader from "./ScreenHeader";
import HistoryChart from "./history/HistoryChart";
import {
  GRANULARITY_LABELS,
  amountSign,
  amountSuffixLabel,
  amountTone,
  formatTransactionDate,
  type AmountTone,
} from "./history/historyDisplay";
import { useHistoryView } from "./history/useHistoryView";
import { formatGol, formatGolForSpeech } from "../lib/amount";
import { ERROR_TEXT_CLASS, UI_COLORS } from "../constants/ui";

/** 金額の色（収入は緑、支出は赤、振替と未知の種別は中立色） */
const AMOUNT_TONE_CLASS: Record<AmountTone, string> = {
  expense: "text-rose-600",
  income: "text-emerald-600",
  neutral: "text-slate-500",
};

/**
 * 大人用の取引履歴の画面（Issue #438）。収支グラフと取引の一覧を、ログイン中の利用者について表示する。
 *
 * 大人用タブ（`(adult)` グループ）のルート画面なので、戻るボタンは出さない。
 * 子供用は `ChildHistoryScreen`。取得と集計は `useHistoryView` を共有する。
 */
export default function AdultHistoryScreen() {
  const currentUser = useCurrentUser();
  const { cumulativeSeries, cycleGranularity, errorMessage, granularity, periods, showLoading, sortedTransactions } =
    useHistoryView();

  if (!currentUser) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-100" edges={["top", "bottom"]}>
        <Text className="text-sm text-slate-400">ログインしてください</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <ScreenHeader hideBackButton title={`${currentUser.name}のりれき`} />

      {showLoading ? (
        <LoadingSpinner label="履歴を読み込み中" />
      ) : (
        <ScrollView contentContainerClassName="px-6 pb-10" showsVerticalScrollIndicator={false}>
          <View className="mt-2 rounded-2xl bg-white px-4 py-5">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold text-slate-400">収支グラフ</Text>
              <Pressable
                accessibilityLabel={`表示期間: ${GRANULARITY_LABELS[granularity]}単位。タップで切り替え`}
                accessibilityRole="button"
                className="flex-row items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 active:bg-slate-200"
                onPress={cycleGranularity}
              >
                <Ionicons color={UI_COLORS.slate600} name="swap-horizontal" size={14} />
                <Text className="text-xs font-semibold text-slate-600">{GRANULARITY_LABELS[granularity]}単位</Text>
              </Pressable>
            </View>

            <View className="mt-2">
              <HistoryChart cumulativeSeries={cumulativeSeries} periods={periods} />
            </View>
          </View>

          <Text className="mt-6 text-sm font-semibold text-slate-500">取引履歴</Text>
          <View className="mt-2 overflow-hidden rounded-2xl bg-white">
            {errorMessage ? (
              <Text className={`px-4 py-6 text-center text-sm ${ERROR_TEXT_CLASS}`}>{errorMessage}</Text>
            ) : sortedTransactions.length === 0 ? (
              <Text className="px-4 py-6 text-center text-sm text-slate-400">まだ履歴がありません</Text>
            ) : (
              sortedTransactions.map((transaction, index) => {
                const dateLabel = formatTransactionDate(transaction.created_at);
                const sign = amountSign(transaction.amount);

                return (
                  <View
                    accessibilityLabel={`${dateLabel} ${transaction.description} ${sign}${formatGolForSpeech(
                      transaction.amount,
                    )}${amountSuffixLabel(transaction.type)}`}
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
                    <Text className={`text-base font-bold ${AMOUNT_TONE_CLASS[amountTone(transaction.type)]}`}>
                      {sign}
                      {formatGol(transaction.amount)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
