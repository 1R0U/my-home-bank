import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useCurrentUser, useDataAccess } from "../store";
import { formatGol } from "../lib/amount";
import { parseSavingsAmount } from "../lib/savings";
import { fetchSavingsSummary, setSavingsAmount, setSavingsDay, withdrawSavings, type SavingsSummary, type SavingsRun } from "../lib/savingsService";
import { useRefetchOnFocus } from "../lib/useRefetchOnFocus";
import { classifySupabaseError, describeAppError, isBusinessRejection } from "../lib/errors";

const STATUS: Record<SavingsRun["status"], string> = {
  completed: "完了", partial: "残高不足のため一部積立", empty: "積立可能残高がないためスキップ",
  stopped: "積立停止中", reserve: "最低準備金を守るため利息支払いなし", rounded_zero: "利息は1 gol未満",
};

export default function SavingsScreen() {
  const user = useCurrentUser();
  // ユーザー切替時は入力・再送キー・通信結果をすべて破棄する。
  return <SavingsContent key={user?.id ?? "signed-out"} />;
}

function SavingsContent() {
  const user = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const [summary, setSummary] = useState<SavingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [withdrawText, setWithdrawText] = useState("");
  const [dayText, setDayText] = useState("");
  const request = useRef(0);
  const submitting = useRef(false);
  const pendingWithdrawal = useRef<{ amount: number; key: string } | null>(null);
  const parent = user?.role === "parent";

  const reload = useCallback(async () => {
    const id = ++request.current;
    if (!canUseRealData || !user?.family_id) {
      setLoading(false);
      setSummary(null);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchSavingsSummary();
      if (id !== request.current) return;
      setSummary(next);
      setError(null);
    } catch {
      if (id === request.current) {
        setSummary(null);
        setError("積立預金を取得できませんでした。再読み込みしてください。");
      }
    } finally { if (id === request.current) setLoading(false); }
  }, [canUseRealData, user?.family_id]);
  useRefetchOnFocus(reload);

  const run = async (action: () => Promise<void>, success: string) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (cause) {
      const failure = classifySupabaseError(cause, "write");
      if (isBusinessRejection(failure) || failure.code === "CONSTRAINT_VIOLATION") {
        pendingWithdrawal.current = null;
        setMessage(describeAppError(failure));
      } else {
        setMessage("処理結果を確認できませんでした。残高・履歴を確認してください。引き出しは同じ額で再試行しても二重実行されません。");
      }
    } finally {
      await reload();
      submitting.current = false;
      setBusy(false);
    }
  };
  const amount = parseSavingsAmount(amountText);
  const withdrawal = pendingWithdrawal.current?.amount ?? parseSavingsAmount(withdrawText);
  const day = parseSavingsAmount(dayText);
  const own = summary?.accounts.find((a) => a.user_id === user?.id);
  const disabled = busy || loading || !summary || !canUseRealData;
  const button = (label: string, onPress: () => void, inactive = disabled) => (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: inactive }} disabled={inactive}
      onPress={onPress} className={`mt-3 rounded-xl p-4 ${inactive ? "bg-slate-300" : "bg-blue-700"}`}>
      <Text className="text-center font-semibold text-white">{label}</Text>
    </Pressable>
  );
  return <ScrollView className="flex-1 bg-slate-100" contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
    <Text className="mb-3 text-2xl font-bold text-slate-900">自動積立預金</Text>
    <Text className="mb-4 text-slate-600">手動の銀行預金とは別の口座です。いつでも手数料なしでお財布へ引き出せます。</Text>
    {!canUseRealData || !user?.family_id ? <Text>積立預金を利用するには家族に所属してログインしてください。</Text> : null}
    {loading ? <Text>読み込み中です</Text> : null}
    {error ? <Text accessibilityRole="alert" className="text-rose-700">{error}</Text> : null}
    {message ? <Text accessibilityRole="alert" className="my-3 text-slate-800">{message}</Text> : null}
    {summary ? <>
      <Text>家庭の積立日：毎月{summary.transfer_day}日（その日がない月は月末）</Text>
      <Text>現在の月利：{Number((summary.monthly_rate * 100).toFixed(2))}%</Text>
      <Text className="my-3 text-sm text-slate-600">利息は前月の平均残高から計算し、翌月初に支払います。1 gol未満は切り捨てます。見込額は現在の残高・金利が月末まで続く場合の額で、準備金不足の場合は支払われません。</Text>
      {summary.accounts.map((account) => <View key={account.user_id} className="my-3 rounded-2xl bg-white p-4">
        {parent ? <Text className="text-lg font-bold">{account.name}</Text> : null}
        <Text>積立預金残高：{formatGol(account.balance)}</Text>
        <Text>毎月の積立額：{formatGol(account.monthly_amount)}{account.monthly_amount === 0 ? "（停止中）" : ""}</Text>
        <Text>次回積立日：{account.next_transfer_date ?? "—"}</Text>
        <Text>今月分の利息見込：{formatGol(account.estimated_interest)}</Text>
        <Text className="mt-3 font-semibold">最近の処理結果</Text>
        {account.history.length === 0 ? <Text>まだ処理履歴はありません</Text> : account.history.map((item) =>
          <Text key={`${item.target_month}:${item.kind}`} className="mt-2 text-sm">
            {item.target_month.slice(0, 7)} {item.kind === "transfer" ? "積立" : "利息"}：{formatGol(item.amount)}／{STATUS[item.status]}
          </Text>)}
      </View>)}
      {parent ? <View className="my-3 rounded-2xl bg-white p-4">
        <Text className="font-bold">家庭の積立日を変更</Text>
        <TextInput accessibilityLabel="毎月の積立日" value={dayText} onChangeText={setDayText} editable={!busy}
          keyboardType="number-pad" placeholder="1〜31" className="mt-3 rounded-xl border border-slate-300 p-3" />
        <Text className="mt-2 text-sm text-slate-600">今月まだ積み立てていない場合、変更後の日が過ぎていれば今すぐ積み立てます。</Text>
        {button("積立日を保存", () => void run(() => setSavingsDay(day!), "積立日を保存しました"), disabled || day === null || day < 1 || day > 31)}
      </View> : <>
        <View className="my-3 rounded-2xl bg-white p-4">
          <Text className="font-bold">毎月の積立額（gol）</Text>
          <TextInput accessibilityLabel="毎月の積立額" value={amountText} onChangeText={setAmountText} editable={!busy}
            keyboardType="number-pad" placeholder="0で停止" className="mt-3 rounded-xl border border-slate-300 p-3" />
          <Text className="mt-2 text-sm text-slate-600">残高不足の場合は移動できる額だけ積み立てます。初めての設定が積立日当日なら、その場で積み立てます。</Text>
          {button("積立額を保存", () => void run(() => setSavingsAmount(amount!), "積立額を保存しました"), disabled || amount === null)}
          {button("自動積立を停止", () => void run(() => setSavingsAmount(0), "自動積立を停止しました"), disabled || !own?.monthly_amount)}
        </View>
        <View className="my-3 rounded-2xl bg-white p-4">
          <Text className="font-bold">お財布へ引き出す（gol）</Text>
          <TextInput accessibilityLabel="積立預金の引き出し額" value={withdrawText} onChangeText={setWithdrawText}
            editable={!busy && !pendingWithdrawal.current} keyboardType="number-pad"
            className="mt-3 rounded-xl border border-slate-300 p-3" />
          {button(pendingWithdrawal.current ? "同じ引き出しを再確認" : "お財布へ引き出す", () => void run(async () => {
            pendingWithdrawal.current ??= { amount: withdrawal!, key: `${Date.now()}:${Math.random().toString(36).slice(2)}` };
            await withdrawSavings(pendingWithdrawal.current.amount, pendingWithdrawal.current.key);
            pendingWithdrawal.current = null;
            setWithdrawText("");
          }, "お財布へ引き出しました"), disabled || withdrawal === null || withdrawal <= 0 || (!pendingWithdrawal.current && withdrawal > (own?.balance ?? 0)))}
        </View>
      </>}
    </> : null}
    {button("再読み込み", () => void reload(), busy || loading || !canUseRealData || !user?.family_id)}
    {button("戻る", () => router.back(), busy)}
  </ScrollView>;
}
