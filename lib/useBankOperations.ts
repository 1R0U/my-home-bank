import { useEffect, useRef, useState } from "react";
import { bankDeposit, bankWithdraw, type BankOperationResult } from "./bankService";
import { canDeposit, canWithdraw, isValidBankOperationAmount } from "./bankUtils";
import { clearPendingBankOperation, CorruptPendingBankOperationError, createBankOperationId,
  discardCorruptPendingBankOperation, loadPendingBankOperation,
  savePendingBankOperation, type PendingBankOperation } from "./bankOperation";
import { classifySupabaseError, describeAppError } from "./errors";
import { useBankAccount } from "./useBankAccount";
import { useLiveBalance } from "./useLiveBalance";
import { useCurrentUser } from "../store";

/** 銀行画面で選べる操作（預入・引き出し）。 */
export type BankOperation = PendingBankOperation["kind"];

/** 選ばれた操作に対応する銀行の関数を呼ぶ。失敗しても例外は投げず Result が返る。 */
function runOperation(operation: PendingBankOperation): Promise<BankOperationResult> {
  switch (operation.kind) {
    case "deposit":
      return bankDeposit(operation.userId, operation.amount, operation.operationId);
    case "withdraw":
      return bankWithdraw(operation.userId, operation.amount, operation.operationId);
  }
}

/**
 * 銀行画面の残高表示と預入・引き出しの処理（Issue #437）。
 *
 * 大人用（`AdultBankScreen`）と子供用（`ChildBankScreen`）で見た目だけを分け、
 * 確認待ちの操作の保存・照合や二重送信の防止はここに1つだけ置く。
 * 画面ごとに書くと、片方だけ直して少しずつずれる（AGENTS.md「コードの書き方」）。
 */
export function useBankOperations() {
  const user = useCurrentUser();
  const { account, isLive, reload, error: accountError, loading: accountLoading } = useBankAccount();

  // お財布残高は画面表示時と各操作の完了後に取り直す。古い応答での上書きと、
  // ユーザー切替直後に前のユーザーの残高を見せてしまう問題は useLiveBalance が
  // 引き受ける（Issue #147）。
  const { balance: liveBalance, reload: reloadBalance } = useLiveBalance(user?.id, isLive);

  const [activeOperation, setActiveOperation] = useState<BankOperation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingOperation, setPendingOperation] = useState<PendingBankOperation | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [corruptUserId, setCorruptUserId] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const currentUserIdRef = useRef(user?.id);
  currentUserIdRef.current = user?.id;

  useEffect(() => {
    let cancelled = false;
    setActiveOperation(null);
    setPendingOperation(null);
    setErrorMessage(null);
    setLoadedUserId(null);
    setCorruptUserId(null);
    if (user?.id) {
      loadPendingBankOperation(user.id).then((pending) => {
        if (cancelled) return;
        setPendingOperation(pending);
        setLoadedUserId(user.id);
      }).catch((error) => {
        if (cancelled) return;
        if (error instanceof CorruptPendingBankOperationError) setCorruptUserId(user.id);
        else setErrorMessage("確認待ちの操作を読み込めませんでした。画面を開き直してください。");
      });
    }
    return () => { cancelled = true; };
  }, [user?.id]);

  const walletBalance = liveBalance ?? user?.balance ?? 0;
  const depositBalance = account?.deposit_balance ?? 0;

  // 口座が取れていないと、預金・借入の額が分からない。分からないまま操作させると
  // 「確定が押せないが理由が分からない」形になる（canWithdraw などが0で判定するため）。
  // 取得できるまで操作自体を止める（Issue #212）。
  const pending = user && pendingOperation?.userId === user.id ? pendingOperation : null;
  const isCorrupt = Boolean(user) && corruptUserId === user?.id;
  const canOperate = Boolean(user) && !accountError && loadedUserId === user?.id && !pending && !isSubmitting;

  /** 金額入力モーダルを閉じる。送信中は閉じさせない。 */
  const closeModal = () => {
    if (isSubmitting) return;
    setActiveOperation(null);
    setErrorMessage(null);
  };

  /** 口座と財布の残高を取り直す。どちらも内部で失敗を扱うため、ここでは投げない。 */
  const refreshBalances = () => Promise.all([reload(), reloadBalance()]);

  /** 残高と履歴を確認した利用者が解除する。別画面で復元された正常な操作は残す。 */
  const discardCorrupt = async () => {
    if (!user || submittingRef.current || corruptUserId !== user.id) return;
    const userId = user.id;
    submittingRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await discardCorruptPendingBankOperation(userId);
      const restored = await loadPendingBankOperation(userId);
      await refreshBalances();
      if (currentUserIdRef.current !== userId) return;
      setPendingOperation(restored);
      setCorruptUserId(null);
      setLoadedUserId(userId);
    } catch {
      if (currentUserIdRef.current === userId) {
        setErrorMessage("記録を解除できませんでした。時間をおいて、もう一度お試しください。");
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  /**
   * モーダルで金額が確定されたときの処理。
   * 結果の種類に応じて、表示文言・残高の取り直し・モーダルを閉じるかを決める。
   */
  const confirm = async (amount: number) => {
    if (!user || !activeOperation || submittingRef.current || loadedUserId !== user.id) return;
    // 新規操作だけ保存前に検証する。保存済みの超過額はDBの未実行確認へ進める。
    if (!pending && !isValidBankOperationAmount(amount)) {
      setErrorMessage(describeAppError({ code: "INVALID_AMOUNT" }));
      return;
    }
    submittingRef.current = true;
    const operation = pending ?? {
      operationId: createBankOperationId(), userId: user.id, kind: activeOperation, amount,
    };
    /** 操作開始後に利用者が切り替わっていれば、現在の画面へ結果を反映しない。 */
    const isCurrentUser = () => currentUserIdRef.current === operation.userId;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      // 保存に失敗した場合はRPCを送らない。結果不明のIDは閉じる・再起動でも保持する。
      try {
        await savePendingBankOperation(operation);
      } catch (error) {
        // 別の画面が先に保存した操作を復元し、新しいIDでの送信を止める。
        const existing = await loadPendingBankOperation(operation.userId);
        if (isCurrentUser() && existing) {
          setPendingOperation(existing);
          setActiveOperation(null);
        }
        throw error;
      }
      if (!isCurrentUser()) return;
      setPendingOperation(operation);
      const result = await runOperation(operation);
      if (!isCurrentUser()) return;

      if (result.status === "failure") {
        // 金額不正は固定の入力では実行不可能。残高・口座の拒否はロック後の記録照合を経る。
        const notExecuted = ["INVALID_AMOUNT", "INSUFFICIENT_BALANCE", "INSUFFICIENT_DEPOSIT", "ACCOUNT_NOT_FOUND"].includes(result.error.code);
        // 失敗の種類から表示文言を決める。DBのメッセージを直接読まない。
        setErrorMessage(!notExecuted
          ? "結果を確認できませんでした。同じ操作の結果を確認するには、もう一度確定を押してください。二重には反映されません。"
          : describeAppError(result.error));
        // 結果が不明な場合、DB側は成功しているかもしれない。
        // モーダルを閉じずに残高を取り直し、反映されたかを確認できるようにする。
        if (!notExecuted) {
          await refreshBalances();
        } else {
          await clearPendingBankOperation(operation.userId, operation.operationId);
          if (isCurrentUser()) setPendingOperation(null);
        }
        return;
      }

      // 残高の再取得が完了するまでモーダルと isSubmitting を維持し、
      // 古い残高で次の操作が有効になるのを防ぐ。
      await refreshBalances();
      await clearPendingBankOperation(operation.userId, operation.operationId);
      if (isCurrentUser()) {
        setPendingOperation(null);
        setActiveOperation(null);
      }
    } catch (e) {
      // ここへ来るのは、操作そのものではなく残高の取り直しなどで
      // 想定外の例外が起きた場合。操作が失敗したとは断定しない。
      if (isCurrentUser()) {
        if (e instanceof CorruptPendingBankOperationError) {
          setCorruptUserId(operation.userId);
          setLoadedUserId(null);
          setActiveOperation(null);
          setPendingOperation(null);
        } else setErrorMessage(describeAppError(classifySupabaseError(e, "read")));
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  /** 操作ごとに、その金額を確定してよいかを判定する関数を返す。 */
  const canSubmitFor = (operation: BankOperation) => (amount: number) => {
    if (!user || loadedUserId !== user.id) return false;
    // 確定済みかもしれない再送は、更新後の残高不足で止めない。
    if (pending) return isLive && pending.kind === operation && pending.amount === amount;
    switch (operation) {
      case "deposit":
        return canDeposit(amount, walletBalance, isLive);
      case "withdraw":
        return canWithdraw(amount, depositBalance, isLive);
    }
  };

  return {
    user,
    isLive,
    accountError,
    accountLoading,
    walletBalance,
    depositBalance,
    activeOperation,
    /** 金額入力モーダルを開く。確認待ちの操作は保存済みの種類で開き直す。 */
    openOperation: setActiveOperation,
    closeModal,
    isSubmitting,
    errorMessage,
    pending,
    isCorrupt,
    canOperate,
    confirm,
    discardCorrupt,
    canSubmitFor,
    refreshBalances,
  };
}
