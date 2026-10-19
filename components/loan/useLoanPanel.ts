import { useMemo, useRef, useState } from "react";
import { getAmountInputError, getAmountInputLimit, parseAmountInput } from "../../lib/bankUtils";
import { classifySupabaseError, describeAppError } from "../../lib/errors";
import { calculateLoanInterest, calculateLoanTotal, getLoanRemaining, isLoanOverdue } from "../../lib/loan";
import { repayLoan, requestLoan } from "../../lib/loanService";
import { useLoans } from "../../lib/useLoans";
import { useLoanRepaymentStore } from "../../store/loanRepaymentStore";
import type { Loan } from "../../types";

type Options = {
  userId: string;
  walletBalance: number;
  onBalanceChanged: () => Promise<unknown>;
};

/** 契約・申請1件ぶんの、画面に出す値と返済の入力の状態。 */
export type LoanRow = {
  loan: Loan;
  /** 状態の表示名（延滞・承認待ち・完済・却下・契約中） */
  statusLabel: string;
  isOverdue: boolean;
  /** 承認待ちのときだけ、申請時の条件で計算した利息 */
  pendingInterest: number | null;
  /** 残額。承認待ちは申請額と利息の合計 */
  displayedRemaining: number;
  repayText: string;
  repayMaximum: number;
  repayError: string | null;
  canRepay: boolean;
  isSending: boolean;
};

/** 本人と操作対象を含むキーを作り、同じ返済の照合には生成済みキーを使う。 */
function createOperationKey(prefix: string, userId: string, target = "new") {
  return `${prefix}:${userId}:${target}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

/** 契約・申請の状態の表示名。延滞は契約中より優先する。 */
function getLoanStatusLabel(loan: Loan): string {
  if (isLoanOverdue(loan)) return "延滞";
  if (loan.status === "pending") return "承認待ち";
  if (loan.status === "paid") return "完済";
  if (loan.status === "rejected") return "却下";
  return "契約中";
}

/**
 * 子供のローンの申請・返済（Issue #437）。
 *
 * 大人用の銀行画面の欄（`AdultLoanPanel`）と子供用の欄（`ChildLoanPanel`）で共有し、
 * 処理を二重に書かない。見た目はそれぞれの部品が持つ。
 * 送信中と結果未確認の返済は `useLoanRepaymentStore` に置き、画面を離れても二重に返済しない。
 */
export function useLoanPanel({ userId, walletBalance, onBalanceChanged }: Options) {
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

  /** 送信中・結果未確認の間は入力を変えさせない。 */
  const canEdit = () => !submittingRef.current && !inputsLocked;

  const changeAmountText = (value: string) => {
    if (!canEdit()) return;
    setAmountText(value);
    requestKeyRef.current = null;
  };

  const changePurpose = (value: string) => {
    if (!canEdit()) return;
    setPurpose(value);
    requestKeyRef.current = null;
  };

  const fillRequestMaximum = () => {
    if (!canEdit()) return;
    setAmountText(String(requestMaximum));
    requestKeyRef.current = null;
  };

  const cancelRequest = () => {
    if (!canEdit()) return;
    setAmountText("");
    setPurpose("");
    setMessage(null);
    requestKeyRef.current = null;
  };

  const changeRepayText = (loanId: string, value: string) => {
    if (!canEdit()) return;
    setRepayAmounts((current) => ({ ...current, [loanId]: value }));
  };

  const cancelRepay = (loanId: string) => {
    if (!canEdit()) return;
    setRepayAmounts((current) => ({ ...current, [loanId]: "" }));
    setMessage(null);
  };

  /** 金額・用途・貸出条件を確認して申請し、失敗時は条件を取り直す。 */
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

  /** 新規返済は残高を検証し、結果未確認の返済は元の金額とキーで照合する。 */
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

  const fillRepayMaximum = (row: LoanRow) => {
    if (!canEdit()) return;
    setRepayAmounts((current) => ({ ...current, [row.loan.id]: String(row.repayMaximum) }));
  };

  const rows: LoanRow[] = sortedLoans.map((loan) => {
    const remaining = getLoanRemaining(loan);
    const pendingInterest = loan.status === "pending"
      ? calculateLoanInterest(loan.requested_amount, loan.monthly_interest_rate, loan.term_days)
      : null;
    const retained = pendingRepayment?.loanId === loan.id ? pendingRepayment
      : sendingRepayment?.loanId === loan.id ? sendingRepayment : null;
    const repayText = retained ? String(retained.amount) : repayAmounts[loan.id] ?? "";
    const repayAmount = parseAmountInput(repayText);
    const repayMaximum = getAmountInputLimit(Math.min(remaining, walletBalance));
    const repayError = retained ? null : getAmountInputError(repayText, repayMaximum, walletBalance < remaining
      ? "所持金を超える金額は返済できません。" : "ローンの残額を超える金額は返済できません。");
    return {
      loan,
      statusLabel: getLoanStatusLabel(loan),
      isOverdue: isLoanOverdue(loan),
      pendingInterest,
      displayedRemaining: pendingInterest === null ? remaining : loan.requested_amount + pendingInterest,
      repayText,
      repayMaximum,
      repayError,
      canRepay: loan.status === "active" && repayAmount !== null && !repayError && canOperate,
      isSending: sendingRepayment?.loanId === loan.id,
    };
  });

  return {
    offer,
    loading,
    error,
    isLive,
    amount,
    amountText,
    purpose,
    message,
    pendingLoan,
    pendingRepayment,
    requestMaximum,
    offerReady,
    requestError,
    isSubmitting,
    inputsLocked,
    canOperate,
    canRequest,
    previewInterest,
    previewTotal,
    rows,
    changeAmountText,
    changePurpose,
    fillRequestMaximum,
    cancelRequest,
    handleRequest,
    changeRepayText,
    fillRepayMaximum,
    cancelRepay,
    handleRepay,
  };
}
