import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ERROR_TEXT_CLASS, PLACEHOLDER_TEXT_COLOR, PREVIEW_DISABLED_NOTICE } from "../constants/ui";
import { formatGol } from "../lib/amount";
import {
  calculateTreasuryMetrics,
  countLoanStatuses,
  ECONOMY_LOG_TYPE_LABELS,
  ECONOMY_TRANSACTION_LABELS,
  filterEconomyTransactions,
  findTransactionChildId,
  getPriceState,
  getReserveStatus,
  type EconomyLogPeriodFilter,
  type EconomyLogTypeFilter,
} from "../lib/economyDashboard";
import {
  fetchEconomyDashboard,
  type EconomyDashboardData,
} from "../lib/economyDashboardService";
import { describeAppError, classifySupabaseError } from "../lib/errors";
import { getLoanRemaining, isLoanOverdue } from "../lib/loan";
import { parseSavingsAmount } from "../lib/savings";
import { fetchEconomyTransactionPage, issueTreasuryGol } from "../lib/treasuryService";
import { useRefetchOnFocus } from "../lib/useRefetchOnFocus";
import { useCurrentUser, useDataAccess } from "../store";

const TYPE_FILTERS = Object.keys(ECONOMY_LOG_TYPE_LABELS) as EconomyLogTypeFilter[];
const PERIOD_LABELS: Record<EconomyLogPeriodFilter, string> = {
  "30d": "30日",
  "90d": "90日",
  all: "全期間",
};

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <View className="mt-5 rounded-2xl bg-white p-5">
      <Text className="text-lg font-bold text-slate-900">{title}</Text>
      {children}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="mt-3 flex-row items-center justify-between gap-3">
      <Text className="flex-1 text-sm text-slate-500">{label}</Text>
      <Text className="text-right font-semibold text-slate-900">{value}</Text>
    </View>
  );
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`mr-2 rounded-full px-4 py-2 ${active ? "bg-slate-900" : "bg-slate-100"}`}
      onPress={onPress}
    >
      <Text className={`text-xs font-semibold ${active ? "text-white" : "text-slate-600"}`}>{label}</Text>
    </Pressable>
  );
}

export default function ParentEconomyDashboard() {
  const user = useCurrentUser();
  return <EconomyDashboardContent key={user?.id ?? "signed-out"} />;
}

function EconomyDashboardContent() {
  const user = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const [data, setData] = useState<EconomyDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [issueText, setIssueText] = useState("");
  const [pendingIssue, setPendingIssue] = useState<{ amount: number; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typeFilter, setTypeFilter] = useState<EconomyLogTypeFilter>("all");
  const [childFilter, setChildFilter] = useState<string | "all">("all");
  const [periodFilter, setPeriodFilter] = useState<EconomyLogPeriodFilter>("30d");
  const requestId = useRef(0);
  const submitting = useRef(false);

  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (user?.role !== "parent" || !user.family_id || !canUseRealData) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchEconomyDashboard(user.family_id);
      if (currentRequest !== requestId.current) return;
      setData(next);
      setError(null);
    } catch (cause) {
      console.warn("経済ダッシュボードの取得に失敗しました", cause);
      if (currentRequest === requestId.current) {
        setError("家庭内経済の情報を取得できませんでした。再試行してください。");
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [canUseRealData, user?.family_id, user?.role]);
  useRefetchOnFocus(reload);

  const issueAmount = parseSavingsAmount(issueText);
  const metrics = data ? calculateTreasuryMetrics(data.treasury) : null;
  const reserveStatus = data ? getReserveStatus(data.treasury) : null;
  const monthlyFlow = data?.monthlyFlow ?? { inflow: 0, outflow: 0 };
  const loanStatuses = useMemo(
    () => countLoanStatuses(data?.loans ?? []),
    [data?.loans],
  );
  const loanStandard = useMemo(() => {
    const offers = data?.borrowers.flatMap((borrower) => borrower.offer ? [borrower.offer] : []) ?? [];
    if (offers.length === 0) return { rate: "未設定", term: "未設定" };
    const first = offers[0];
    const sameRate = offers.every((offer) => offer.monthly_interest_rate === first.monthly_interest_rate);
    const sameTerm = offers.every((offer) => offer.term_days === first.term_days);
    return {
      rate: sameRate ? `${Number((first.monthly_interest_rate * 100).toFixed(4))}%` : "子どもごとに設定",
      term: sameTerm ? `${first.term_days}日` : "子どもごとに設定",
    };
  }, [data?.borrowers]);
  const visibleTransactions = useMemo(
    () => filterEconomyTransactions(data?.transactions ?? [], {
      type: typeFilter,
      childId: childFilter,
      period: periodFilter,
    }),
    [childFilter, data?.transactions, periodFilter, typeFilter],
  );
  const childNames = useMemo(
    () => new Map(data?.borrowers.map((borrower) => [borrower.id, borrower.name]) ?? []),
    [data?.borrowers],
  );
  const childIds = useMemo(() => new Set(childNames.keys()), [childNames]);

  if (user?.role !== "parent") {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-100 px-6">
        <Ionicons color="#be123c" name="lock-closed-outline" size={44} />
        <Text accessibilityRole="alert" className="mt-4 text-center text-lg font-bold text-slate-900">
          経済管理は親のみ利用できます
        </Text>
        <Pressable accessibilityRole="button" className="mt-5 rounded-xl bg-slate-900 px-6 py-3" onPress={() => router.back()}>
          <Text className="font-semibold text-white">戻る</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const startIssueConfirmation = () => {
    if (!issueAmount || issueAmount <= 0 || busy) return;
    setPendingIssue({
      amount: issueAmount,
      key: `economy-dashboard:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    });
    setMessage(null);
  };

  const confirmIssue = async () => {
    if (!pendingIssue || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await issueTreasuryGol(pendingIssue.amount, pendingIssue.key);
      setIssueText("");
      setPendingIssue(null);
      setMessage(`${formatGol(pendingIssue.amount)}を追加発行しました`);
      await reload();
    } catch (cause) {
      const failure = classifySupabaseError(cause, "write");
      setMessage(
        failure.code === "OUTCOME_UNKNOWN"
          ? "結果を確認できませんでした。再読み込み後、同じ確認画面から再試行してください。"
          : describeAppError(failure),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const accountUser = (transaction: EconomyDashboardData["transactions"][number]) =>
    findTransactionChildId(transaction, childIds);

  const loadMoreTransactions = async () => {
    if (!data?.hasMoreTransactions || !user?.family_id || loadingMore) return;
    const lastTransaction = data.transactions[data.transactions.length - 1];
    if (!lastTransaction) return;
    setLoadingMore(true);
    try {
      const page = await fetchEconomyTransactionPage(user.family_id, {
        created_at: lastTransaction.created_at,
        id: lastTransaction.id,
      });
      setData((current) => {
        if (!current) return current;
        const seen = new Set(current.transactions.map((transaction) => transaction.id));
        return {
          ...current,
          transactions: [
            ...current.transactions,
            ...page.transactions.filter((transaction) => !seen.has(transaction.id)),
          ],
          hasMoreTransactions: page.hasMore,
        };
      });
    } catch (cause) {
      console.warn("経済ログの追加取得に失敗しました", cause);
      setMessage("経済ログを追加取得できませんでした。もう一度お試しください。");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <ScrollView contentContainerClassName="px-5 pb-10" showsVerticalScrollIndicator={false}>
        <View className="mt-4 flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-bold text-slate-900">家庭内経済</Text>
            <Text className="mt-1 text-sm text-slate-500">資金の流れと設定をまとめて管理</Text>
          </View>
          <Pressable
            accessibilityLabel="経済情報を再読み込み"
            accessibilityRole="button"
            accessibilityState={{ disabled: loading || busy }}
            className="h-12 w-12 items-center justify-center rounded-full bg-white"
            disabled={loading || busy}
            onPress={() => void reload()}
          >
            <Ionicons color="#0f172a" name="refresh" size={24} />
          </Pressable>
        </View>

        {!canUseRealData || !user.family_id ? (
          <Text className="mt-5 rounded-xl bg-white p-4 text-slate-600">
            家族に所属してログインすると経済情報を確認できます。{!canUseRealData ? `\n${PREVIEW_DISABLED_NOTICE}` : ""}
          </Text>
        ) : null}
        {loading ? <Text className="mt-8 text-center text-slate-500">経済情報を読み込み中です</Text> : null}
        {error ? (
          <View className="mt-5 rounded-2xl bg-white p-5">
            <Text accessibilityRole="alert" className={ERROR_TEXT_CLASS}>{error}</Text>
            <Pressable accessibilityRole="button" className="mt-4 rounded-xl bg-slate-900 py-3" onPress={() => void reload()}>
              <Text className="text-center font-semibold text-white">再試行</Text>
            </Pressable>
          </View>
        ) : null}
        {message ? <Text accessibilityRole="alert" className="mt-4 rounded-xl bg-white p-4 text-slate-700">{message}</Text> : null}

        {data && metrics ? (
          <>
            <Section title="ギルド金庫">
              <Metric label="現在残高" value={formatGol(data.treasury.balance)} />
              <Metric label="家庭総ゴル" value={formatGol(data.treasury.total_supply)} />
              <Metric label={`最低準備金（${Number((data.treasury.minimum_reserve_rate * 100).toFixed(2))}%）`} value={formatGol(metrics.minimumReserve)} />
              <Metric label="貸出可能額" value={formatGol(metrics.lendable)} />
              <Metric label="今月の入金" value={formatGol(monthlyFlow.inflow)} />
              <Metric label="今月の出金" value={formatGol(monthlyFlow.outflow)} />
              <Metric label="次回の報酬見込" value={formatGol(data.pendingRewardTotal)} />
              <Metric label="次回の預金利息見込" value={formatGol(data.savings.accounts.reduce((sum, account) => sum + account.estimated_interest, 0))} />
              {reserveStatus !== "safe" ? (
                <Text accessibilityRole="alert" className={`mt-4 rounded-xl p-3 text-sm font-semibold ${reserveStatus === "critical" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>
                  {reserveStatus === "critical"
                    ? "最低準備金に達しています。新しい貸出や利息支払いが制限されます。"
                    : "最低準備金に近づいています。今後の支払い予定を確認してください。"}
                </Text>
              ) : null}

              <View className="mt-5 border-t border-slate-100 pt-4">
                <Text className="font-semibold text-slate-900">ゴルを追加発行</Text>
                <TextInput
                  accessibilityLabel="追加発行額"
                  className="mt-3 rounded-xl bg-slate-100 px-4 py-3"
                  editable={!busy && !pendingIssue}
                  keyboardType="number-pad"
                  onChangeText={(text) => setIssueText(text.replace(/[^0-9]/g, ""))}
                  placeholder="発行額"
                  placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                  value={issueText}
                />
                {pendingIssue ? (
                  <View className="mt-3 rounded-xl bg-amber-50 p-4">
                    <Text className="font-semibold text-slate-900">{formatGol(pendingIssue.amount)}を追加発行しますか？</Text>
                    <Text className="mt-1 text-xs text-slate-600">家庭総ゴルと金庫残高が増えます。この操作は取り消せません。</Text>
                    <View className="mt-3 flex-row gap-2">
                      <Pressable accessibilityLabel="追加発行を確定" accessibilityRole="button" accessibilityState={{ disabled: busy }} className={`flex-1 rounded-xl py-3 ${busy ? "bg-slate-300" : "bg-rose-700"}`} disabled={busy} onPress={() => void confirmIssue()}>
                        <Text className="text-center font-bold text-white">発行する</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} className="flex-1 rounded-xl bg-white py-3" disabled={busy} onPress={() => setPendingIssue(null)}>
                        <Text className="text-center font-semibold text-slate-700">キャンセル</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy || !issueAmount || issueAmount <= 0 || !canUseRealData }}
                    className={`mt-3 rounded-xl py-3 ${busy || !issueAmount || issueAmount <= 0 || !canUseRealData ? "bg-slate-300" : "bg-slate-900"}`}
                    disabled={busy || !issueAmount || issueAmount <= 0 || !canUseRealData}
                    onPress={startIssueConfirmation}
                  >
                    <Text className="text-center font-semibold text-white">内容を確認</Text>
                  </Pressable>
                )}
              </View>
            </Section>

            <Section title="家庭内物価">
              <Metric label="現在の物価指数" value={`${data.price.current.price_index}（${getPriceState(data.price.current.price_index)}）`} />
              <Metric
                label="前月比"
                value={data.price.previous
                  ? `${data.price.current.price_index - data.price.previous.price_index >= 0 ? "+" : ""}${data.price.current.price_index - data.price.previous.price_index}`
                  : "比較データなし"}
              />
              <Metric
                label="前月の平均流通ゴル"
                value={data.price.current.calculation_basis.circulating_history_complete === false
                  ? "記録を収集中"
                  : data.price.current.calculation_basis.circulating_history_complete === true
                    ? formatGol(Math.floor(data.price.current.avg_circulating_gol))
                    : "平均の記録なし"}
              />
              <Metric label="適正流通ゴル" value={formatGol(data.price.current.target_gol)} />
              <Metric label="次回更新日" value={new Date(`${data.price.next_update_date}T00:00:00+09:00`).toLocaleDateString("ja-JP")} />
            </Section>

            <Section title="ローン">
              <Metric label="標準月利" value={loanStandard.rate} />
              <Metric label="標準期限" value={loanStandard.term} />
              <Metric label="承認待ち" value={`${loanStatuses.pending}件`} />
              <Metric label="契約中" value={`${loanStatuses.active}件`} />
              <Metric label="延滞中" value={`${loanStatuses.overdue}件`} />
              {data.loans.filter((loan) => loan.status === "pending").map((loan) => (
                <View className="mt-3 rounded-xl bg-amber-50 p-3" key={loan.id}>
                  <Text className="font-semibold text-slate-900">
                    承認待ち：{childNames.get(loan.borrower_id) ?? "不明"}
                  </Text>
                  <Text className="mt-1 text-xs text-slate-600">{formatGol(loan.requested_amount)} ／ {loan.purpose}</Text>
                </View>
              ))}
              {data.loans.filter((loan) => loan.status === "active" || loan.status === "paid").map((loan) => (
                <View className="mt-3 rounded-xl bg-slate-50 p-3" key={loan.id}>
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="font-semibold text-slate-900">{childNames.get(loan.borrower_id) ?? "不明"}</Text>
                    <Text className={`text-xs font-bold ${isLoanOverdue(loan) ? "text-rose-700" : "text-slate-500"}`}>
                      {isLoanOverdue(loan) ? "延滞中" : loan.status === "paid" ? "完済" : "契約中"}
                    </Text>
                  </View>
                  <Text className="mt-1 text-xs text-slate-600">
                    元本 {formatGol(loan.principal_amount ?? 0)} ／ 利息 {formatGol(loan.interest_amount ?? 0)}
                  </Text>
                  <Text className="mt-1 text-xs text-slate-600">
                    返済済み {formatGol(loan.principal_repaid + loan.interest_repaid)} ／ 残り {formatGol(getLoanRemaining(loan))}
                  </Text>
                </View>
              ))}
              {data.borrowers.length === 0 ? <Text className="mt-3 text-sm text-slate-400">設定対象の子どもはいません</Text> : null}
              {data.borrowers.map((borrower) => (
                <View className="mt-3 rounded-xl bg-slate-50 p-3" key={borrower.id}>
                  <Text className="font-semibold text-slate-900">{borrower.name}</Text>
                  {borrower.offer ? (
                    <Text className="mt-1 text-xs text-slate-600">
                      限度額 {formatGol(borrower.offer.loan_limit)} ／ 月利 {Number((borrower.offer.monthly_interest_rate * 100).toFixed(4))}% ／ {borrower.offer.term_days}日
                    </Text>
                  ) : <Text className={`mt-1 text-xs ${ERROR_TEXT_CLASS}`}>設定を取得できませんでした</Text>}
                </View>
              ))}
              <Pressable accessibilityRole="button" className="mt-4 rounded-xl bg-blue-700 py-3" onPress={() => router.push("/loan-management" as never)}>
                <Text className="text-center font-semibold text-white">申請・契約・設定を管理</Text>
              </Pressable>
            </Section>

            <Section title="自動積立預金">
              <Metric label="現在の変動金利" value={`${Number((data.savings.monthly_rate * 100).toFixed(2))}%`} />
              <Metric label="家庭の積立日" value={`毎月${data.savings.transfer_day}日`} />
              {data.savings.accounts.length === 0 ? <Text className="mt-3 text-sm text-slate-400">積立口座はありません</Text> : null}
              {data.savings.accounts.map((account) => (
                <View className="mt-3 rounded-xl bg-slate-50 p-3" key={account.user_id}>
                  <Text className="font-semibold text-slate-900">{account.name}</Text>
                  <Text className="mt-1 text-xs text-slate-600">残高 {formatGol(account.balance)} ／ 毎月 {formatGol(account.monthly_amount)}</Text>
                  <Text className="mt-1 text-xs text-slate-600">次回 {account.next_transfer_date ?? "—"} ／ 利息見込 {formatGol(account.estimated_interest)}</Text>
                </View>
              ))}
              <Pressable accessibilityRole="button" className="mt-4 rounded-xl bg-blue-700 py-3" onPress={() => router.push("/savings")}>
                <Text className="text-center font-semibold text-white">積立日を管理</Text>
              </Pressable>
            </Section>

            <Section title="経済ログ">
              <Text className="mt-3 text-xs font-semibold text-slate-500">種別</Text>
              <ScrollView className="mt-2" horizontal showsHorizontalScrollIndicator={false}>
                {TYPE_FILTERS.map((filter) => <Chip active={typeFilter === filter} key={filter} label={ECONOMY_LOG_TYPE_LABELS[filter]} onPress={() => setTypeFilter(filter)} />)}
              </ScrollView>
              <Text className="mt-4 text-xs font-semibold text-slate-500">子ども</Text>
              <ScrollView className="mt-2" horizontal showsHorizontalScrollIndicator={false}>
                <Chip active={childFilter === "all"} label="全員" onPress={() => setChildFilter("all")} />
                {data.borrowers.map((borrower) => <Chip active={childFilter === borrower.id} key={borrower.id} label={borrower.name} onPress={() => setChildFilter(borrower.id)} />)}
              </ScrollView>
              <Text className="mt-4 text-xs font-semibold text-slate-500">期間</Text>
              <View className="mt-2 flex-row">
                {(Object.keys(PERIOD_LABELS) as EconomyLogPeriodFilter[]).map((filter) => <Chip active={periodFilter === filter} key={filter} label={PERIOD_LABELS[filter]} onPress={() => setPeriodFilter(filter)} />)}
              </View>

              {visibleTransactions.length === 0 ? <Text className="mt-5 text-center text-sm text-slate-400">条件に合う取引はありません</Text> : null}
              {visibleTransactions.map((transaction) => {
                const relatedUserId = accountUser(transaction);
                return (
                  <View className="mt-3 border-t border-slate-100 pt-3" key={transaction.id}>
                    <View className="flex-row justify-between gap-3">
                      <View className="flex-1">
                        <Text className="font-semibold text-slate-900">{ECONOMY_TRANSACTION_LABELS[transaction.type]}</Text>
                        <Text className="mt-0.5 text-xs text-slate-500">
                          {relatedUserId ? childNames.get(relatedUserId) ?? "親・システム" : "システム"} ／ {new Date(transaction.created_at).toLocaleDateString("ja-JP")}
                        </Text>
                      </View>
                      <Text className="font-bold text-slate-900">{formatGol(transaction.amount)}</Text>
                    </View>
                    <Text className="mt-1 text-xs text-slate-600">{transaction.description}</Text>
                  </View>
                );
              })}
              {data.hasMoreTransactions ? (
                <Pressable
                  accessibilityRole="button"
                  className="mt-4 rounded-xl bg-slate-100 py-3"
                  disabled={loadingMore}
                  onPress={() => void loadMoreTransactions()}
                >
                  <Text className="text-center font-semibold text-slate-700">
                    {loadingMore ? "読み込み中..." : "さらに読み込む"}
                  </Text>
                </Pressable>
              ) : null}
            </Section>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
