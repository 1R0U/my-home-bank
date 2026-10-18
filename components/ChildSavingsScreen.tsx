import { router, Stack } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatGol } from "../lib/amount";
import { describeSavingsRun, parseSavingsAmount } from "../lib/savings";
import { setSavingsAmount, withdrawSavings } from "../lib/savingsService";
import { useSavings } from "../lib/useSavings";
import { useCurrentUser } from "../store";
import { childSavingsStyles as styles } from "./savings/childSavingsStyles";

/** 子供用の自動積立預金の画面。毎月の積立額を決め、お財布へ引き出す（Issue #440）。 */
export default function ChildSavingsScreen() {
  const user = useCurrentUser();
  // ユーザー切替時は入力・再送キー・通信結果をすべて破棄する。
  return <ChildSavingsContent key={user?.id ?? "signed-out"} />;
}

function ChildSavingsContent() {
  const { user, available, summary, loading, error, reload, busy, message, run, disabled } = useSavings();
  const [amountText, setAmountText] = useState("");
  const [withdrawText, setWithdrawText] = useState("");
  // 結果が分からなかった引き出しは、同じ金額・同じキーで再送して二重実行を防ぐ
  const pendingWithdrawal = useRef<{ amount: number; key: string } | null>(null);
  const forgetPendingWithdrawal = () => { pendingWithdrawal.current = null; };

  const amount = parseSavingsAmount(amountText);
  const withdrawal = pendingWithdrawal.current?.amount ?? parseSavingsAmount(withdrawText);
  const own = summary?.accounts.find((a) => a.user_id === user?.id);

  const button = (label: string, onPress: () => void, inactive = disabled) => (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: inactive }} disabled={inactive}
      onPress={onPress} style={[styles.button, inactive && styles.buttonDisabled]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
  return <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
    {/* 見出しと戻るボタンは画面の中に持つため、ネイティブのヘッダーは出さない（他の子供用画面と同じ） */}
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>自動積立預金</Text>
      <Text style={styles.lead}>手動の銀行預金とは別の口座です。いつでも手数料なしでお財布へ引き出せます。</Text>
      {!available ? <View style={styles.card}><Text style={styles.text}>積立預金を利用するには家族に所属してログインしてください。</Text></View> : null}
      {loading ? <Text style={styles.lead}>読み込み中です</Text> : null}
      {error ? <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{error}</Text></View> : null}
      {message ? <View style={styles.card}><Text accessibilityRole="alert" style={styles.message}>{message}</Text></View> : null}
      {summary ? <>
        <View style={styles.card}>
          <Text style={styles.text}>家庭の積立日：毎月{summary.transfer_day}日（その日がない月は月末）</Text>
          <Text style={styles.text}>現在の月利：{Number((summary.monthly_rate * 100).toFixed(2))}%</Text>
          <Text style={styles.note}>利息は前月の平均残高から計算し、翌月初に支払います。1 gol未満は切り捨てます。見込額は現在の残高・金利が月末まで続く場合の額で、準備金不足の場合は支払われません。</Text>
        </View>
        {summary.accounts.map((account) => <View key={account.user_id} style={styles.card}>
          <Text style={styles.text}>積立預金残高：{formatGol(account.balance)}</Text>
          <Text style={styles.text}>毎月の積立額：{formatGol(account.monthly_amount)}{account.monthly_amount === 0 ? "（停止中）" : ""}</Text>
          <Text style={styles.text}>次回積立日：{account.next_transfer_date ?? "—"}</Text>
          <Text style={styles.text}>今月分の利息見込：{formatGol(account.estimated_interest)}</Text>
          <Text style={[styles.cardTitle, styles.historyTitle]}>最近の処理結果</Text>
          {account.history.length === 0 ? <Text style={styles.text}>まだ処理履歴はありません</Text> : account.history.map((item) =>
            <Text key={`${item.target_month}:${item.kind}`} style={styles.historyItem}>{describeSavingsRun(item)}</Text>)}
        </View>)}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>毎月の積立額（gol）</Text>
          <TextInput accessibilityLabel="毎月の積立額" value={amountText} onChangeText={setAmountText} editable={!busy}
            keyboardType="number-pad" placeholder="0で停止" style={styles.input} />
          <Text style={styles.note}>残高不足の場合は移動できる額だけ積み立てます。初めての設定が積立日当日なら、その場で積み立てます。</Text>
          {button("積立額を保存", () => void run(() => setSavingsAmount(amount!), "積立額を保存しました"), disabled || amount === null)}
          {button("自動積立を停止", () => void run(() => setSavingsAmount(0), "自動積立を停止しました"), disabled || !own?.monthly_amount)}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>お財布へ引き出す（gol）</Text>
          <TextInput accessibilityLabel="積立預金の引き出し額" value={withdrawText} onChangeText={setWithdrawText}
            editable={!busy && !pendingWithdrawal.current} keyboardType="number-pad" style={styles.input} />
          {button(pendingWithdrawal.current ? "同じ引き出しを再確認" : "お財布へ引き出す", () => void run(async () => {
            pendingWithdrawal.current ??= { amount: withdrawal!, key: `${Date.now()}:${Math.random().toString(36).slice(2)}` };
            await withdrawSavings(pendingWithdrawal.current.amount, pendingWithdrawal.current.key);
            pendingWithdrawal.current = null;
            setWithdrawText("");
          }, "お財布へ引き出しました", { onRejected: forgetPendingWithdrawal }),
          disabled || withdrawal === null || withdrawal <= 0 || (!pendingWithdrawal.current && withdrawal > (own?.balance ?? 0)))}
        </View>
      </> : null}
      {button("再読み込み", () => void reload(), busy || loading || !available)}
      {button("戻る", () => router.back(), busy)}
    </ScrollView>
  </SafeAreaView>;
}
