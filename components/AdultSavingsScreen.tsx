import { router, Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ERROR_TEXT_CLASS, NOTICE_TEXT_CLASS } from "../constants/ui";
import { formatGol } from "../lib/amount";
import { describeSavingsRun, parseSavingsAmount } from "../lib/savings";
import { setSavingsDay } from "../lib/savingsService";
import { useSavings } from "../lib/useSavings";
import { useCurrentUser } from "../store";

/** 大人用の自動積立預金の画面。家族全員の積立状況を見て、家庭の積立日を変える（Issue #440）。 */
export default function AdultSavingsScreen() {
  const user = useCurrentUser();
  // ユーザー切替時は入力・通信結果をすべて破棄する。
  return <AdultSavingsContent key={user?.id ?? "signed-out"} />;
}

function AdultSavingsContent() {
  const { available, summary, loading, error, reload, busy, message, run, disabled } = useSavings();
  const [dayText, setDayText] = useState("");
  const day = parseSavingsAmount(dayText);

  const button = (label: string, onPress: () => void, inactive = disabled) => (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: inactive }} disabled={inactive}
      onPress={onPress} className={`mt-3 rounded-xl p-4 ${inactive ? "bg-slate-300" : "bg-blue-700"}`}>
      <Text className="text-center font-semibold text-white">{label}</Text>
    </Pressable>
  );
  return <ScrollView className="flex-1 bg-slate-100" contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
    {/* ルート名（savings-adult）がそのままヘッダーに出ないようにする */}
    <Stack.Screen options={{ title: "自動積立預金" }} />
    <Text className="mb-3 text-2xl font-bold text-slate-900">自動積立預金</Text>
    <Text className="mb-4 text-slate-600">手動の銀行預金とは別の口座です。子供はいつでも手数料なしでお財布へ引き出せます。</Text>
    {!available ? <Text>積立預金を利用するには家族に所属してログインしてください。</Text> : null}
    {loading ? <Text>読み込み中です</Text> : null}
    {error ? <Text accessibilityRole="alert" className={ERROR_TEXT_CLASS}>{error}</Text> : null}
    {message ? <Text accessibilityRole="alert" className="my-3 text-slate-800">{message}</Text> : null}
    {summary ? <>
      <Text>家庭の積立日：毎月{summary.transfer_day}日（その日がない月は月末）</Text>
      <Text>現在の月利：{Number((summary.monthly_rate * 100).toFixed(2))}%</Text>
      <Text className={`my-3 text-sm ${NOTICE_TEXT_CLASS}`}>利息は前月の平均残高から計算し、翌月初に支払います。1 gol未満は切り捨てます。見込額は現在の残高・金利が月末まで続く場合の額で、準備金不足の場合は支払われません。</Text>
      {summary.accounts.length === 0 ? <Text className={`my-3 ${NOTICE_TEXT_CLASS}`}>積立口座はありません</Text> : null}
      {summary.accounts.map((account) => <View key={account.user_id} className="my-3 rounded-2xl bg-white p-4">
        <Text className="text-lg font-bold">{account.name}</Text>
        <Text>積立預金残高：{formatGol(account.balance)}</Text>
        <Text>毎月の積立額：{formatGol(account.monthly_amount)}{account.monthly_amount === 0 ? "（停止中）" : ""}</Text>
        <Text>次回積立日：{account.next_transfer_date ?? "—"}</Text>
        <Text>今月分の利息見込：{formatGol(account.estimated_interest)}</Text>
        <Text className="mt-3 font-semibold">最近の処理結果</Text>
        {account.history.length === 0 ? <Text>まだ処理履歴はありません</Text> : account.history.map((item) =>
          <Text key={`${item.target_month}:${item.kind}`} className="mt-2 text-sm">{describeSavingsRun(item)}</Text>)}
      </View>)}
      <View className="my-3 rounded-2xl bg-white p-4">
        <Text className="font-bold">家庭の積立日を変更</Text>
        <TextInput accessibilityLabel="毎月の積立日" value={dayText} onChangeText={setDayText} editable={!busy}
          keyboardType="number-pad" placeholder="1〜31" className="mt-3 rounded-xl border border-slate-300 p-3" />
        <Text className={`mt-2 text-sm ${NOTICE_TEXT_CLASS}`}>今月まだ積み立てていない場合、変更後の日が過ぎていれば今すぐ積み立てます。</Text>
        {button("積立日を保存", () => void run(() => setSavingsDay(day!), "積立日を保存しました"), disabled || day === null || day < 1 || day > 31)}
      </View>
    </> : null}
    {button("再読み込み", () => void reload(), busy || loading || !available)}
    {button("戻る", () => router.back(), busy)}
  </ScrollView>;
}
