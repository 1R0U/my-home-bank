import { useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { formatGol } from "../../lib/amount";
import { getAmountInputError, getAmountInputLimit, parseAmountInput } from "../../lib/bankUtils";
import { calculateLoanInterest, calculateLoanTotal, formatMonthlyRate, getLoanRemaining, isLoanOverdue } from "../../lib/loan";
import { repayLoan, requestLoan } from "../../lib/loanService";
import { useLoans } from "../../lib/useLoans";
import { PLACEHOLDER_TEXT_COLOR } from "../../constants/ui";

type Props = {
  userId: string;
  walletBalance: number;
  onBalanceChanged: () => Promise<unknown>;
};

function createOperationKey(prefix: string, userId: string, target = "new") {
  return `${prefix}:${userId}:${target}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export default function ChildLoanPanel({ userId, walletBalance, onBalanceChanged }: Props) {
  const { loans, offer, loading, error, isLive, reload } = useLoans();
  const [amountText, setAmountText] = useState("");
  const [purpose, setPurpose] = useState("");
  const [repayAmounts, setRepayAmounts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const requestKeyRef = useRef<string | null>(null);
  const repaymentKeysRef = useRef<Record<string, string>>({});
  const submittingRef = useRef(false);

  const amount = parseAmountInput(amountText);
  const pendingLoan = loans.find((loan) => loan.status === "pending");
  const requestMaximum = getAmountInputLimit(offer?.available_amount ?? 0);
  const requestError = getAmountInputError(amountText, requestMaximum, "借入可能額を超える金額は申請できません。");
  const canOperate = isLive && !loading && !error;
  const previewInterest = offer ? calculateLoanInterest(amount ?? 0, offer.monthly_interest_rate, offer.term_days) : 0;
  const previewTotal = offer ? calculateLoanTotal(amount ?? 0, offer.monthly_interest_rate, offer.term_days) : 0;
  const canRequest = Boolean(
    canOperate &&
      offer &&
      !offer.has_overdue &&
      !pendingLoan &&
      amount !== null &&
      !requestError &&
      purpose.trim(),
  );

  const sortedLoans = useMemo(
    () => [...loans].sort((a, b) => b.requested_at.localeCompare(a.requested_at)),
    [loans],
  );

  const handleRequest = async () => {
    if (!canRequest || submittingRef.current) return;
    submittingRef.current = true;
    setSubmittingId("request");
    setMessage(null);
    try {
      requestKeyRef.current ??= createOperationKey("loan-request", userId);
      await requestLoan(
        userId,
        amount,
        purpose,
        offer!.monthly_interest_rate,
        offer!.term_days,
        requestKeyRef.current,
      );
      requestKeyRef.current = null;
      setAmountText("");
      setPurpose("");
      setMessage("ローンを申請しました");
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "ローンの申請に失敗しました");
      await reload();
    } finally {
      submittingRef.current = false;
      setSubmittingId(null);
    }
  };

  const handleRepay = async (loanId: string) => {
    const repaymentAmount = parseAmountInput(repayAmounts[loanId] ?? "");
    const loan = loans.find((item) => item.id === loanId);
    if (!canOperate || !loan || loan.status !== "active" || repaymentAmount === null ||
      repaymentAmount > getLoanRemaining(loan) || repaymentAmount > walletBalance || submittingRef.current) return;
    submittingRef.current = true;
    setSubmittingId(loanId);
    setMessage(null);
    try {
      repaymentKeysRef.current[loanId] ??= createOperationKey("loan-repay", userId, loanId);
      await repayLoan(loanId, userId, repaymentAmount, repaymentKeysRef.current[loanId]);
      delete repaymentKeysRef.current[loanId];
      setRepayAmounts((current) => ({ ...current, [loanId]: "" }));
      setMessage("返済しました");
      await Promise.all([reload(), onBalanceChanged()]);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "ローンの返済に失敗しました");
    } finally {
      submittingRef.current = false;
      setSubmittingId(null);
    }
  };

  return (
    <View className="mb-8 rounded-3xl bg-white p-6 shadow-sm shadow-slate-200">
      <Text className="text-xl font-semibold text-slate-900">金利付きローン</Text>
      <Text className="mt-2 text-sm text-slate-600">現在の所持金 {formatGol(walletBalance)}</Text>
      <Text className="mt-1 text-xs text-slate-500">借り入れは親の承認後に実行されます。</Text>
      {loading ? <Text className="mt-3 text-sm text-slate-400">ローン情報を読み込み中です</Text> : null}
      {error ? <Text className="mt-3 text-sm text-rose-600">{error}</Text> : null}

      {offer ? (
        <View className="mt-4 rounded-2xl bg-emerald-50 p-4">
          <Text className="text-sm text-emerald-800">借入可能額</Text>
          <Text accessibilityLabel="借入可能額" className="mt-1 text-3xl font-bold text-emerald-900">
            {formatGol(offer.available_amount)}
          </Text>
          <Text className="mt-2 text-xs text-emerald-700">
            月利 {formatMonthlyRate(offer.monthly_interest_rate)} ／ 期限 {offer.term_days}日
          </Text>
          <Text className="mt-1 text-xs text-emerald-700">
            個人限度額 {formatGol(offer.loan_limit)} ／ 未返済元本 {formatGol(offer.outstanding_principal)}
          </Text>
          {offer.has_overdue ? <Text className="mt-2 text-xs font-bold text-rose-600">延滞中のため新規借入はできません</Text> : null}
        </View>
      ) : null}

      <Text className="mt-4 text-xs font-semibold text-slate-500">借りる金額</Text>
      <Text accessibilityLabel="ローン申請の最大金額" className="mt-1 text-xs text-slate-600">
        入力可能な最大金額 {formatGol(requestMaximum)}
      </Text>
      <TextInput
        accessibilityLabel="ローン申請額"
        className="mt-1 rounded-xl bg-slate-50 px-4 py-3 text-slate-900"
        keyboardType="number-pad"
        editable={!submittingId}
        onChangeText={(value) => { if (submittingRef.current) return; setAmountText(value); requestKeyRef.current = null; }}
        placeholder="例: 100"
        placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
        value={amountText}
      />
      {requestError ? <Text accessibilityRole="alert" className="mt-2 text-xs text-rose-600">{requestError}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="借入可能な最大額を入力"
        accessibilityState={{ disabled: !canOperate || Boolean(submittingId) || requestMaximum === 0 }}
        disabled={!canOperate || Boolean(submittingId) || requestMaximum === 0}
        className="mt-2 py-2" onPress={() => {
          if (submittingRef.current) return;
          setAmountText(String(requestMaximum)); requestKeyRef.current = null;
        }}>
        <Text className="text-sm font-semibold text-emerald-700">最大額を入力</Text>
      </Pressable>
      <Text className="mt-3 text-xs font-semibold text-slate-500">用途</Text>
      <TextInput
        accessibilityLabel="ローンの用途"
        className="mt-1 rounded-xl bg-slate-50 px-4 py-3 text-slate-900"
        maxLength={500}
        editable={!submittingId}
        onChangeText={(value) => { if (submittingRef.current) return; setPurpose(value); requestKeyRef.current = null; }}
        placeholder="何に使うか入力"
        placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
        value={purpose}
      />
      {amount !== null && !requestError && offer ? (
        <View className="mt-3 rounded-xl bg-slate-50 p-3">
          <Text className="text-xs text-slate-600">元本 {formatGol(amount)} ＋ 利息 {formatGol(previewInterest)}</Text>
          <Text className="mt-1 text-sm font-bold text-slate-900">返済予定額 {formatGol(previewTotal)}</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityLabel="ローンを申請する"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canRequest || Boolean(submittingId) }}
        className={`mt-4 items-center rounded-xl py-3 ${canRequest && !submittingId ? "bg-emerald-600" : "bg-slate-200"}`}
        disabled={!canRequest || Boolean(submittingId)}
        onPress={handleRequest}
      >
        <Text className={`font-bold ${canRequest && !submittingId ? "text-white" : "text-slate-400"}`}>
          {pendingLoan ? "承認待ちの申請があります" : "内容を確認して申請"}
        </Text>
      </Pressable>

      <Pressable accessibilityRole="button" accessibilityLabel="ローン申請の入力をキャンセル"
        accessibilityState={{ disabled: Boolean(submittingId) }} disabled={Boolean(submittingId)}
        className="mt-2 items-center py-2" onPress={() => {
          if (submittingRef.current) return;
          setAmountText(""); setPurpose(""); setMessage(null); requestKeyRef.current = null;
        }}>
        <Text className="text-sm font-semibold text-slate-500">入力をキャンセル</Text>
      </Pressable>

      {message ? <Text accessibilityRole="alert" className="mt-3 text-sm text-slate-600">{message}</Text> : null}
      {!isLive ? <Text className="mt-2 text-xs text-slate-400">※ プレビュー中は申請・返済できません</Text> : null}

      <Text className="mt-6 text-base font-bold text-slate-900">契約・申請状況</Text>
      {sortedLoans.length === 0 ? <Text className="mt-2 text-sm text-slate-400">ローンはありません</Text> : null}
      {sortedLoans.map((loan) => {
        const remaining = getLoanRemaining(loan);
        const pendingInterest = loan.status === "pending"
          ? calculateLoanInterest(loan.requested_amount, loan.monthly_interest_rate, loan.term_days)
          : null;
        const displayedRemaining = pendingInterest === null ? remaining : loan.requested_amount + pendingInterest;
        const repayText = repayAmounts[loan.id] ?? "";
        const repayAmount = parseAmountInput(repayText);
        const repayMaximum = getAmountInputLimit(Math.min(remaining, walletBalance));
        const repayError = getAmountInputError(repayText, repayMaximum, walletBalance < remaining
          ? "所持金を超える金額は返済できません。" : "ローンの残額を超える金額は返済できません。");
        const canRepay = loan.status === "active" && repayAmount !== null && !repayError && canOperate;
        return (
          <View className="mt-3 rounded-2xl border border-slate-100 p-4" key={loan.id}>
            <View className="flex-row justify-between">
              <Text className="flex-1 font-semibold text-slate-900">{loan.purpose}</Text>
              <Text className={`text-xs font-bold ${isLoanOverdue(loan) ? "text-rose-600" : "text-slate-500"}`}>
                {isLoanOverdue(loan) ? "延滞" : loan.status === "pending" ? "承認待ち" : loan.status === "paid" ? "完済" : loan.status === "rejected" ? "却下" : "契約中"}
              </Text>
            </View>
            <Text className="mt-2 text-xs text-slate-600">
              元本 {formatGol(loan.principal_amount ?? loan.requested_amount)} ／ 利息 {formatGol(loan.interest_amount ?? pendingInterest)}
            </Text>
            <Text className="mt-1 text-sm font-bold text-slate-900">残額 {formatGol(displayedRemaining)}</Text>
            {loan.due_at ? <Text className="mt-1 text-xs text-slate-500">期限 {new Date(loan.due_at).toLocaleDateString("ja-JP")}</Text> : null}
            {loan.status === "active" ? (
              <View className="mt-3">
                <Text accessibilityLabel={`${loan.purpose}の返済可能な最大金額`} className="mb-2 text-xs text-slate-600">
                  返済可能な最大金額 {formatGol(repayMaximum)}
                </Text>
                <TextInput
                  accessibilityLabel={`${loan.purpose}の返済額`}
                  className="rounded-xl bg-slate-50 px-4 py-3 text-slate-900"
                  keyboardType="number-pad"
                  editable={!submittingId}
                  onChangeText={(value) => {
                    if (submittingRef.current) return;
                    setRepayAmounts((current) => ({ ...current, [loan.id]: value }));
                    delete repaymentKeysRef.current[loan.id];
                  }}
                  placeholder={repayMaximum > 0 ? `1〜${repayMaximum}` : "0"}
                  placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                  value={repayAmounts[loan.id] ?? ""}
                />
                {repayError ? <Text accessibilityRole="alert" className="mt-2 text-xs text-rose-600">{repayError}</Text> : null}
                <Pressable accessibilityRole="button" accessibilityLabel={`${loan.purpose}の返済可能な最大額を入力`}
                  accessibilityState={{ disabled: !canOperate || Boolean(submittingId) || repayMaximum === 0 }}
                  disabled={!canOperate || Boolean(submittingId) || repayMaximum === 0}
                  className="mt-2 py-2" onPress={() => {
                    if (submittingRef.current) return;
                    setRepayAmounts((current) => ({ ...current, [loan.id]: String(repayMaximum) }));
                    delete repaymentKeysRef.current[loan.id];
                  }}>
                  <Text className="text-sm font-semibold text-amber-700">最大額を入力</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`${loan.purpose}を返済する`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canRepay || Boolean(submittingId) }}
                  className={`mt-2 items-center rounded-xl py-3 ${canRepay && !submittingId ? "bg-amber-600" : "bg-slate-200"}`}
                  disabled={!canRepay || Boolean(submittingId)}
                  onPress={() => handleRepay(loan.id)}
                >
                  <Text className={`font-bold ${canRepay && !submittingId ? "text-white" : "text-slate-400"}`}>返済する</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`${loan.purpose}の返済入力をキャンセル`}
                  accessibilityState={{ disabled: Boolean(submittingId) }} disabled={Boolean(submittingId)}
                  className="mt-2 items-center py-2" onPress={() => {
                    if (submittingRef.current) return;
                    setRepayAmounts((current) => ({ ...current, [loan.id]: "" }));
                    setMessage(null); delete repaymentKeysRef.current[loan.id];
                  }}>
                  <Text className="text-sm font-semibold text-slate-500">入力をキャンセル</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
