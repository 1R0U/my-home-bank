import { useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { formatGol } from "../../lib/amount";
import { getAmountInputError, getAmountInputLimit, parseAmountInput } from "../../lib/bankUtils";
import { classifySupabaseError, describeAppError } from "../../lib/errors";
import { calculateLoanInterest, calculateLoanTotal, formatMonthlyRate, getLoanRemaining, isLoanOverdue } from "../../lib/loan";
import { repayLoan, requestLoan } from "../../lib/loanService";
import { useLoans } from "../../lib/useLoans";
import { useLoanRepaymentStore } from "../../store/loanRepaymentStore";
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
  const pendingRepayment = useLoanRepaymentStore((state) => state.pendingByUser[userId]);
  const sendingRepayment = useLoanRepaymentStore((state) => state.sendingByUser[userId]);
  const requestKeyRef = useRef<string | null>(null);
  const submittingRef = useRef(false);

  const amount = parseAmountInput(amountText);
  const pendingLoan = loans.find((loan) => loan.status === "pending");
  const requestMaximum = getAmountInputLimit(offer?.available_amount ?? 0);
  const offerReady = Boolean(offer && !loading && !error);
  const requestError = getAmountInputError(amountText, offerReady ? requestMaximum : Number.MAX_SAFE_INTEGER,
    "借入可能額を超える金額は申請できません。");
  const isSubmitting = Boolean(submittingId || sendingRepayment);
  const inputsLocked = isSubmitting || Boolean(pendingRepayment);
  const canOperate = isLive && !loading && !error && !pendingRepayment && !sendingRepayment;
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
    // 未確認の返済は、現在の残高や契約状態によらず同じキー・金額で照合する。
    const retry = pendingRepayment?.loanId === loanId ? pendingRepayment : null;
    const repaymentAmount = retry?.amount ?? parseAmountInput(repayAmounts[loanId] ?? "");
    const loan = loans.find((item) => item.id === loanId);
    if (submittingRef.current || !isLive) return;
    if (!retry && (!canOperate || !loan || loan.status !== "active" || repaymentAmount === null ||
      repaymentAmount > getLoanRemaining(loan) || repaymentAmount > walletBalance)) return;
    const operation = retry ?? { loanId, amount: repaymentAmount, key: createOperationKey("loan-repay", userId, loanId) };
    const repaymentStore = useLoanRepaymentStore.getState();
    if (!repaymentStore.start(userId, operation)) return;
    submittingRef.current = true;
    setSubmittingId(loanId);
    setMessage(null);
    try {
      await repayLoan(loanId, userId, operation.amount, operation.key);
      repaymentStore.resolve(userId, operation);
      setRepayAmounts((current) => ({ ...current, [loanId]: "" }));
      setMessage("返済しました");
      await Promise.all([reload(), onBalanceChanged()]);
    } catch (e) {
      const classified = classifySupabaseError(e, "write");
      // SQLの明示的な拒否だけを未実行と判定し、応答不明のキーは残す。
      if (["OPERATION_REJECTED", "CONSTRAINT_VIOLATION"].includes(classified.code)) {
        repaymentStore.resolve(userId, operation);
      } else repaymentStore.retainUnknown(userId, operation);
      setMessage(describeAppError(classified));
    } finally {
      repaymentStore.finishSending(userId, operation);
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
        入力可能な最大金額 {offerReady ? formatGol(requestMaximum) : "—"}
      </Text>
      <TextInput
        accessibilityLabel="ローン申請額"
        className="mt-1 rounded-xl bg-slate-50 px-4 py-3 text-slate-900"
        keyboardType="number-pad"
        editable={!inputsLocked}
        onChangeText={(value) => { if (submittingRef.current || inputsLocked) return; setAmountText(value); requestKeyRef.current = null; }}
        placeholder="例: 100"
        placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
        value={amountText}
      />
      {requestError ? <Text accessibilityRole="alert" className="mt-2 text-xs text-rose-600">{requestError}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="借入可能な最大額を入力"
        accessibilityState={{ disabled: !canOperate || isSubmitting || requestMaximum === 0 }}
        disabled={!canOperate || isSubmitting || requestMaximum === 0}
        className="mt-2 py-2" onPress={() => {
          if (submittingRef.current || inputsLocked) return;
          setAmountText(String(requestMaximum)); requestKeyRef.current = null;
        }}>
        <Text className="text-sm font-semibold text-emerald-700">最大額を入力</Text>
      </Pressable>
      <Text className="mt-3 text-xs font-semibold text-slate-500">用途</Text>
      <TextInput
        accessibilityLabel="ローンの用途"
        className="mt-1 rounded-xl bg-slate-50 px-4 py-3 text-slate-900"
        maxLength={500}
        editable={!inputsLocked}
        onChangeText={(value) => { if (submittingRef.current || inputsLocked) return; setPurpose(value); requestKeyRef.current = null; }}
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
        accessibilityState={{ disabled: !canRequest || isSubmitting }}
        className={`mt-4 items-center rounded-xl py-3 ${canRequest && !isSubmitting ? "bg-emerald-600" : "bg-slate-200"}`}
        disabled={!canRequest || isSubmitting}
        onPress={handleRequest}
      >
        <Text className={`font-bold ${canRequest && !isSubmitting ? "text-white" : "text-slate-400"}`}>
          {pendingLoan ? "承認待ちの申請があります" : "内容を確認して申請"}
        </Text>
      </Pressable>

      <Pressable accessibilityRole="button" accessibilityLabel="ローン申請の入力をキャンセル"
        accessibilityState={{ disabled: inputsLocked }} disabled={inputsLocked}
        className="mt-2 items-center py-2" onPress={() => {
          if (submittingRef.current || inputsLocked) return;
          setAmountText(""); setPurpose(""); setMessage(null); requestKeyRef.current = null;
        }}>
        <Text className="text-sm font-semibold text-slate-500">入力をキャンセル</Text>
      </Pressable>

      {message ? <Text accessibilityRole="alert" className="mt-3 text-sm text-slate-600">{message}</Text> : null}
      {pendingRepayment ? (
        <View className="mt-3 rounded-xl bg-amber-50 p-3">
          <Text accessibilityRole="alert" className="text-sm text-slate-700">
            返済 {formatGol(pendingRepayment.amount)} の結果を確認しています。確認が済むまで金額の変更・キャンセルはできません。
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="返済の結果を確認"
            accessibilityState={{ disabled: isSubmitting || !isLive }}
            disabled={isSubmitting || !isLive} className="mt-2 py-2"
            onPress={() => handleRepay(pendingRepayment.loanId)}>
            <Text className="text-sm font-semibold text-amber-800">返済の結果を確認</Text>
          </Pressable>
        </View>
      ) : null}
      {!isLive ? <Text className="mt-2 text-xs text-slate-400">※ プレビュー中は申請・返済できません</Text> : null}

      <Text className="mt-6 text-base font-bold text-slate-900">契約・申請状況</Text>
      {sortedLoans.length === 0 ? <Text className="mt-2 text-sm text-slate-400">ローンはありません</Text> : null}
      {sortedLoans.map((loan) => {
        const remaining = getLoanRemaining(loan);
        const pendingInterest = loan.status === "pending"
          ? calculateLoanInterest(loan.requested_amount, loan.monthly_interest_rate, loan.term_days)
          : null;
        const displayedRemaining = pendingInterest === null ? remaining : loan.requested_amount + pendingInterest;
        const retained = pendingRepayment?.loanId === loan.id ? pendingRepayment
          : sendingRepayment?.loanId === loan.id ? sendingRepayment : null;
        const repayText = retained ? String(retained.amount) : repayAmounts[loan.id] ?? "";
        const repayAmount = parseAmountInput(repayText);
        const repayMaximum = getAmountInputLimit(Math.min(remaining, walletBalance));
        const repayError = retained ? null : getAmountInputError(repayText, repayMaximum, walletBalance < remaining
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
                  editable={!inputsLocked}
                  onChangeText={(value) => {
                    if (submittingRef.current || inputsLocked) return;
                    setRepayAmounts((current) => ({ ...current, [loan.id]: value }));
                  }}
                  placeholder={repayMaximum > 0 ? `1〜${repayMaximum}` : "0"}
                  placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                  value={repayText}
                />
                {repayError ? <Text accessibilityRole="alert" className="mt-2 text-xs text-rose-600">{repayError}</Text> : null}
                <Pressable accessibilityRole="button" accessibilityLabel={`${loan.purpose}の返済可能な最大額を入力`}
                  accessibilityState={{ disabled: !canOperate || isSubmitting || repayMaximum === 0 }}
                  disabled={!canOperate || isSubmitting || repayMaximum === 0}
                  className="mt-2 py-2" onPress={() => {
                    if (submittingRef.current || inputsLocked) return;
                    setRepayAmounts((current) => ({ ...current, [loan.id]: String(repayMaximum) }));
                  }}>
                  <Text className="text-sm font-semibold text-amber-700">最大額を入力</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`${loan.purpose}を返済する`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canRepay || isSubmitting }}
                  className={`mt-2 items-center rounded-xl py-3 ${canRepay && !isSubmitting ? "bg-amber-600" : "bg-slate-200"}`}
                  disabled={!canRepay || isSubmitting}
                  onPress={() => handleRepay(loan.id)}
                >
                  <Text className={`font-bold ${canRepay && !isSubmitting ? "text-white" : "text-slate-400"}`}>
                    {sendingRepayment?.loanId === loan.id ? "返済中…" : "返済する"}
                  </Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`${loan.purpose}の返済入力をキャンセル`}
                  accessibilityState={{ disabled: inputsLocked }} disabled={inputsLocked}
                  className="mt-2 items-center py-2" onPress={() => {
                    if (submittingRef.current || inputsLocked) return;
                    setRepayAmounts((current) => ({ ...current, [loan.id]: "" }));
                    setMessage(null);
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
