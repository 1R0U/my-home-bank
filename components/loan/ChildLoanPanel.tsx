import { useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { AMOUNT_UNITS, formatAmountWithUnit } from "../../lib/amount";
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

  const amount = Number(amountText);
  const pendingLoan = loans.find((loan) => loan.status === "pending");
  const activeLoans = loans.filter((loan) => loan.status === "active");
  const previewInterest = offer ? calculateLoanInterest(amount, offer.monthly_interest_rate, offer.term_days) : 0;
  const previewTotal = offer ? calculateLoanTotal(amount, offer.monthly_interest_rate, offer.term_days) : 0;
  const canRequest = Boolean(
    isLive &&
      offer &&
      !offer.has_overdue &&
      !pendingLoan &&
      Number.isSafeInteger(amount) &&
      amount > 0 &&
      amount <= offer.available_amount &&
      purpose.trim(),
  );

  const sortedLoans = useMemo(
    () => [...loans].sort((a, b) => b.requested_at.localeCompare(a.requested_at)),
    [loans],
  );

  const handleRequest = async () => {
    if (!canRequest || submittingId) return;
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
      setSubmittingId(null);
    }
  };

  const handleRepay = async (loanId: string) => {
    const repaymentAmount = Number(repayAmounts[loanId]);
    if (!Number.isSafeInteger(repaymentAmount) || repaymentAmount <= 0 || submittingId) return;
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
      setSubmittingId(null);
    }
  };

  return (
    <View className="mb-8 rounded-3xl bg-white p-6 shadow-sm shadow-slate-200">
      <Text className="text-xl font-semibold text-slate-900">金利付きローン</Text>
      {loading ? <Text className="mt-3 text-sm text-slate-400">ローン情報を読み込み中です</Text> : null}
      {error ? <Text className="mt-3 text-sm text-rose-600">{error}</Text> : null}

      {offer ? (
        <View className="mt-4 rounded-2xl bg-emerald-50 p-4">
          <Text className="text-sm text-emerald-800">借入可能額</Text>
          <Text accessibilityLabel="借入可能額" className="mt-1 text-3xl font-bold text-emerald-900">
            {formatAmountWithUnit(offer.available_amount, AMOUNT_UNITS.pt)}
          </Text>
          <Text className="mt-2 text-xs text-emerald-700">
            月利 {formatMonthlyRate(offer.monthly_interest_rate)} ／ 期限 {offer.term_days}日
          </Text>
          <Text className="mt-1 text-xs text-emerald-700">
            個人限度額 {formatAmountWithUnit(offer.loan_limit, AMOUNT_UNITS.pt)} ／ 未返済元本 {formatAmountWithUnit(offer.outstanding_principal, AMOUNT_UNITS.pt)}
          </Text>
          {offer.has_overdue ? <Text className="mt-2 text-xs font-bold text-rose-600">延滞中のため新規借入はできません</Text> : null}
        </View>
      ) : null}

      <Text className="mt-4 text-xs font-semibold text-slate-500">借りる金額</Text>
      <TextInput
        accessibilityLabel="ローン申請額"
        className="mt-1 rounded-xl bg-slate-50 px-4 py-3 text-slate-900"
        keyboardType="number-pad"
        onChangeText={(value) => { setAmountText(value.replace(/[^0-9]/g, "")); requestKeyRef.current = null; }}
        placeholder="例: 100"
        placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
        value={amountText}
      />
      <Text className="mt-3 text-xs font-semibold text-slate-500">用途</Text>
      <TextInput
        accessibilityLabel="ローンの用途"
        className="mt-1 rounded-xl bg-slate-50 px-4 py-3 text-slate-900"
        maxLength={500}
        onChangeText={(value) => { setPurpose(value); requestKeyRef.current = null; }}
        placeholder="何に使うか入力"
        placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
        value={purpose}
      />
      {Number.isSafeInteger(amount) && amount > 0 && offer ? (
        <View className="mt-3 rounded-xl bg-slate-50 p-3">
          <Text className="text-xs text-slate-600">元本 {amount} HMC ＋ 利息 {previewInterest} HMC</Text>
          <Text className="mt-1 text-sm font-bold text-slate-900">返済予定額 {previewTotal} HMC</Text>
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
        const repayAmount = Number(repayAmounts[loan.id]);
        const canRepay = loan.status === "active" && Number.isSafeInteger(repayAmount) && repayAmount > 0 && repayAmount <= remaining && repayAmount <= walletBalance && isLive;
        return (
          <View className="mt-3 rounded-2xl border border-slate-100 p-4" key={loan.id}>
            <View className="flex-row justify-between">
              <Text className="flex-1 font-semibold text-slate-900">{loan.purpose}</Text>
              <Text className={`text-xs font-bold ${isLoanOverdue(loan) ? "text-rose-600" : "text-slate-500"}`}>
                {isLoanOverdue(loan) ? "延滞" : loan.status === "pending" ? "承認待ち" : loan.status === "paid" ? "完済" : loan.status === "rejected" ? "却下" : "契約中"}
              </Text>
            </View>
            <Text className="mt-2 text-xs text-slate-600">
              元本 {loan.principal_amount ?? loan.requested_amount} HMC ／ 利息 {loan.interest_amount ?? pendingInterest} HMC
            </Text>
            <Text className="mt-1 text-sm font-bold text-slate-900">残額 {displayedRemaining} HMC</Text>
            {loan.due_at ? <Text className="mt-1 text-xs text-slate-500">期限 {new Date(loan.due_at).toLocaleDateString("ja-JP")}</Text> : null}
            {loan.status === "active" ? (
              <View className="mt-3">
                <TextInput
                  accessibilityLabel={`${loan.purpose}の返済額`}
                  className="rounded-xl bg-slate-50 px-4 py-3 text-slate-900"
                  keyboardType="number-pad"
                  onChangeText={(value) => {
                    setRepayAmounts((current) => ({ ...current, [loan.id]: value.replace(/[^0-9]/g, "") }));
                    delete repaymentKeysRef.current[loan.id];
                  }}
                  placeholder={`1〜${remaining}`}
                  placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                  value={repayAmounts[loan.id] ?? ""}
                />
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
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
