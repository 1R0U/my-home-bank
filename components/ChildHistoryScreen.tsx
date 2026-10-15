import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatGol, formatGolForSpeech } from "../lib/amount";
import { playSoundEffect } from "../lib/audio";
import { useCurrentUser } from "../store";
import { CHILD_THEME } from "./childTheme";
import Furigana from "./Furigana";
import HistoryChart from "./history/HistoryChart";
import { CHILD_AMOUNT_COLORS, childHistoryStyles as styles } from "./history/childHistoryStyles";
import {
  GRANULARITY_LABELS,
  amountSign,
  amountSuffixLabel,
  amountTone,
  formatTransactionDate,
} from "./history/historyDisplay";
import type { HistoryGranularity } from "./history/historyUtils";
import { useHistoryView } from "./history/useHistoryView";

/** 粒度の切り替えボタンに出す文言（ふりがな付き） */
const GRANULARITY_FURIGANA: Record<HistoryGranularity, string> = {
  day: "{日|にち}",
  week: "{週|しゅう}",
  month: "{月|つき}",
  year: "{年|ねん}",
};

/**
 * 子供用の取引履歴の画面（Issue #438）。町の履歴の建物や銀行から入ってくる。
 *
 * 出すもの（収支グラフと取引の一覧）は大人用（`AdultHistoryScreen`）と同じで、
 * 取得と集計は `useHistoryView` を共有する。見た目だけを、タスク・ストアと同じ
 * 木と羊皮紙の世界観（`StyleSheet` + `CHILD_THEME`）にしている。
 */
export default function ChildHistoryScreen() {
  const currentUser = useCurrentUser();
  const {
    cumulativeSeries,
    cycleGranularity,
    errorMessage,
    granularity,
    periods,
    reload,
    showLoading,
    sortedTransactions,
  } = useHistoryView();

  const handleBack = () => {
    playSoundEffect("cancel");
    router.back();
  };

  const handleCycleGranularity = () => {
    playSoundEffect("confirm");
    cycleGranularity();
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>MY HOME BANK</Text>
        <Text accessibilityRole="header" style={styles.screenTitle}>
          {currentUser ? `${currentUser.name}のりれき` : "りれき"}
        </Text>
      </View>

      <View style={styles.boardFrame}>
        {!currentUser ? (
          <View style={styles.loading}>
            <Text style={styles.loginText}>ログインしてね</Text>
          </View>
        ) : showLoading ? (
          <View
            accessibilityLabel="りれきを読み込み中"
            accessibilityRole="progressbar"
            accessibilityState={{ busy: true }}
            accessible
            style={styles.loading}
            testID="loading-spinner"
          >
            <ActivityIndicator color={CHILD_THEME.parchment} size="large" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Furigana style={styles.panelTitle}>{"{収支|しゅうし}グラフ"}</Furigana>
                <Pressable
                  accessibilityLabel={`表示期間: ${GRANULARITY_LABELS[granularity]}単位。タップで切り替え`}
                  accessibilityRole="button"
                  onPress={handleCycleGranularity}
                  style={({ pressed }) => [styles.granularityButton, pressed && styles.pressed]}
                >
                  <Ionicons color={CHILD_THEME.darkWood} name="swap-horizontal" size={14} />
                  <Furigana noWrap style={styles.granularityText}>
                    {`${GRANULARITY_FURIGANA[granularity]}ごと`}
                  </Furigana>
                </Pressable>
              </View>

              <View style={styles.chartArea}>
                <HistoryChart cumulativeSeries={cumulativeSeries} periods={periods} />
              </View>
            </View>

            <View style={styles.panel}>
              <Furigana style={styles.panelTitle}>{"{取引|とりひき}のきろく"}</Furigana>
              {errorMessage ? (
                <>
                  <Furigana accessibilityRole="alert" style={styles.messageText}>
                    {"りれきの{取得|しゅとく}に{失敗|しっぱい}しました"}
                  </Furigana>
                  <Pressable
                    accessibilityLabel="りれきの取得を再試行"
                    accessibilityRole="button"
                    onPress={reload}
                    style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
                  >
                    <Furigana noWrap style={styles.retryButtonText}>{"{再試行|さいしこう}"}</Furigana>
                  </Pressable>
                </>
              ) : sortedTransactions.length === 0 ? (
                <Text style={styles.messageText}>まだりれきがありません</Text>
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
                      key={transaction.id}
                      style={[styles.row, index !== sortedTransactions.length - 1 && styles.rowDivider]}
                    >
                      <View style={styles.rowText}>
                        <Text style={styles.description}>{transaction.description}</Text>
                        <Text style={styles.date}>{dateLabel}</Text>
                      </View>
                      <Text style={[styles.amount, { color: CHILD_AMOUNT_COLORS[amountTone(transaction.type)] }]}>
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
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityLabel="前の画面に戻る"
          accessibilityRole="button"
          onPress={handleBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backArrow}>‹</Text>
          <Furigana noWrap style={styles.backText}>{"{戻|もど}る"}</Furigana>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
