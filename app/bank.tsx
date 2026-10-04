import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import BankAmountModal, { type BankOperation } from "../components/bank/BankAmountModal";
import ChildLoanPanel from "../components/loan/ChildLoanPanel";
import { formatGol } from "../lib/amount";
import { bankDeposit, bankWithdraw, type BankOperationResult } from "../lib/bankService";
import { canDeposit, canWithdraw } from "../lib/bankUtils";
import { clearPendingBankOperation, createBankOperationId, loadPendingBankOperation,
  savePendingBankOperation, type PendingBankOperation } from "../lib/bankOperation";
import { classifySupabaseError, describeAppError } from "../lib/errors";
import { useBankAccount } from "../lib/useBankAccount";
import { useLiveBalance } from "../lib/useLiveBalance";
import { useCurrentUser } from "../store";
import { ERROR_TEXT_CLASS } from "../constants/ui";

export default function BankScreen() {
  const user = useCurrentUser();
  const { account, isLive, reload, error: accountError } = useBankAccount();

  // お財布残高は画面表示時と各操作の完了後に取り直す。古い応答での上書きと、
  // ユーザー切替直後に前のユーザーの残高を見せてしまう問題は useLiveBalance が
  // 引き受ける（Issue #147）。
  const { balance: liveBalance, reload: reloadBalance } = useLiveBalance(user?.id, isLive);

  const [activeOperation, setActiveOperation] = useState<BankOperation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingOperation, setPendingOperation] = useState<PendingBankOperation | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const currentUserIdRef = useRef(user?.id);
  currentUserIdRef.current = user?.id;

  useEffect(() => {
    let cancelled = false;
    setActiveOperation(null);
    setPendingOperation(null);
    setErrorMessage(null);
    setLoadedUserId(null);
    if (user?.id) {
      loadPendingBankOperation(user.id).then((pending) => {
        if (cancelled) return;
        setPendingOperation(pending);
        setLoadedUserId(user.id);
      }).catch(() => {
        if (!cancelled) setErrorMessage("確認待ちの操作を読み込めませんでした。画面を開き直してください。");
      });
    }
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-100 p-6">
        <Text className="text-center text-base text-slate-600">
          銀行を利用するにはログインしてください。
        </Text>
        <Pressable
          accessibilityRole="button"
          className="mt-6 rounded-2xl bg-slate-900 px-8 py-4"
          onPress={() => router.back()}
        >
          <Text className="text-base font-semibold text-white">戻る</Text>
        </Pressable>
      </View>
    );
  }

  const walletBalance = liveBalance ?? user.balance;
  const depositBalance = account?.deposit_balance ?? 0;

  // 口座が取れていないと、預金・借入の額が分からない。分からないまま操作させると
  // 「確定が押せないが理由が分からない」形になる（canWithdraw などが0で判定するため）。
  // 取得できるまで操作自体を止める（Issue #212）。
  const pending = pendingOperation?.userId === user.id ? pendingOperation : null;
  const canOperate = !accountError && loadedUserId === user.id && !pending && !isSubmitting;

  /**
   * 口座の金額を表示用の文字列にする。
   *
   * 取得に失敗したときに `0 gol` と出すと、**預金が0ゴルだと誤解させる**（Issue #212）。
   * 分からないものは分からないと出す。
   * @param value - 表示する金額
   * @returns 金額の文字列。取得に失敗している場合は「—」
   */
  const formatAccountBalance = (value: number) => (accountError ? "—" : formatGol(value));

  /** 金額入力モーダルを閉じる。送信中は閉じさせない。 */
  const closeModal = () => {
    if (isSubmitting) return;
    setActiveOperation(null);
    setErrorMessage(null);
  };

  /** 口座と財布の残高を取り直す。どちらも内部で失敗を扱うため、ここでは投げない。 */
  const refreshBalances = () => Promise.all([reload(), reloadBalance()]);

  /** 選ばれた操作に対応する銀行の関数を呼ぶ。失敗しても例外は投げず Result が返る。 */
  const runOperation = (operation: PendingBankOperation): Promise<BankOperationResult> => {
    switch (operation.kind) {
      case "deposit":
        return bankDeposit(operation.userId, operation.amount, operation.operationId);
      case "withdraw":
        return bankWithdraw(operation.userId, operation.amount, operation.operationId);
    }
  };

  /**
   * モーダルで金額が確定されたときの処理。
   * 結果の種類に応じて、表示文言・残高の取り直し・モーダルを閉じるかを決める。
   */
  const handleConfirm = async (amount: number) => {
    if (!activeOperation || submittingRef.current || loadedUserId !== user.id) return;
    submittingRef.current = true;
    const operation = pending ?? {
      operationId: createBankOperationId(), userId: user.id, kind: activeOperation, amount,
    };
    const isCurrentUser = () => currentUserIdRef.current === operation.userId;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      // 保存に失敗した場合はRPCを送らない。結果不明のIDは閉じる・再起動でも保持する。
      await savePendingBankOperation(operation);
      if (!isCurrentUser()) return;
      setPendingOperation(operation);
      const result = await runOperation(operation);
      if (!isCurrentUser()) return;

      if (result.status === "failure") {
        // 失敗の種類から表示文言を決める。DBのメッセージを直接読まない。
        setErrorMessage(result.error.code === "OUTCOME_UNKNOWN"
          ? "結果を確認できませんでした。同じ操作の結果を確認するには、もう一度確定を押してください。二重には反映されません。"
          : describeAppError(result.error));
        // 結果が不明な場合、DB側は成功しているかもしれない。
        // モーダルを閉じずに残高を取り直し、反映されたかを確認できるようにする。
        if (result.error.code === "OUTCOME_UNKNOWN") {
          await refreshBalances();
        } else if (!pending || ["INSUFFICIENT_BALANCE", "INSUFFICIENT_DEPOSIT", "ACCOUNT_NOT_FOUND"].includes(result.error.code)) {
          // 初回の確定的な拒否なら未実行と分かる。結果不明後の再送が
          // 認証などで拒否されても、最初の送信の結果までは確定しない。
          // 残高・口座の拒否は、ロック後の操作記録確認を経た未実行の結果。
          await clearPendingBankOperation(operation.userId);
          if (isCurrentUser()) setPendingOperation(null);
        }
        return;
      }

      // 残高の再取得が完了するまでモーダルと isSubmitting を維持し、
      // 古い残高で次の操作が有効になるのを防ぐ。
      await refreshBalances();
      await clearPendingBankOperation(operation.userId);
      if (isCurrentUser()) {
        setPendingOperation(null);
        setActiveOperation(null);
      }
    } catch (e) {
      // ここへ来るのは、操作そのものではなく残高の取り直しなどで
      // 想定外の例外が起きた場合。操作が失敗したとは断定しない。
      if (isCurrentUser()) setErrorMessage(describeAppError(classifySupabaseError(e, "read")));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  /** 操作ごとに、その金額を確定してよいかを判定する関数を返す。 */
  const canSubmitFor = (operation: BankOperation) => (amount: number) => {
    if (loadedUserId !== user.id) return false;
    // 確定済みかもしれない再送は、更新後の残高不足で止めない。
    if (pending) return isLive && pending.kind === operation && pending.amount === amount;
    switch (operation) {
      case "deposit":
        return canDeposit(amount, walletBalance, isLive);
      case "withdraw":
        return canWithdraw(amount, depositBalance, isLive);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-slate-100 px-4"
      contentContainerStyle={{ paddingVertical: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="mb-6 rounded-3xl bg-white p-6 shadow-sm shadow-slate-200">
        <Text className="mb-3 text-3xl font-bold text-slate-900">銀行</Text>
        {accountError ? (
          <Text accessibilityRole="alert" className={`mb-3 text-sm ${ERROR_TEXT_CLASS}`}>
            口座の情報を取得できませんでした
          </Text>
        ) : null}
        <View className="mb-4 rounded-2xl bg-slate-50 p-4">
          <Text className="text-sm text-slate-500">現在の所持金（お財布）</Text>
          <Text accessibilityLabel="現在の所持金" className="mt-2 text-4xl font-semibold text-slate-900">
            {formatGol(walletBalance)}
          </Text>
        </View>
        <View className="rounded-2xl bg-slate-50 p-4">
          <Text className="text-sm text-slate-500">銀行に預けているお金</Text>
          <Text accessibilityLabel="預金残高" className="mt-2 text-4xl font-semibold text-slate-900">
            {formatAccountBalance(depositBalance)}
          </Text>
        </View>
      </View>

      <View className="mb-6 rounded-3xl bg-white p-6 shadow-sm shadow-slate-200">
        <Text className="mb-4 text-xl font-semibold text-slate-900">預入 / 引き出し</Text>
        {pending ? (
          <View className="mb-4 rounded-2xl bg-amber-50 p-4">
            <Text className="text-sm text-slate-700">
              {pending.kind === "deposit" ? "預入" : "引き出し"} {formatGol(pending.amount)} の結果が確認待ちです。
            </Text>
            <Pressable accessibilityRole="button" disabled={isSubmitting || !isLive}
              accessibilityState={{ disabled: isSubmitting || !isLive }}
              onPress={() => setActiveOperation(pending.kind)} className="mt-2 py-2">
              <Text className="font-semibold text-blue-700">操作の結果を確認</Text>
            </Pressable>
          </View>
        ) : errorMessage && !activeOperation ? (
          <Text accessibilityRole="alert" className={`mb-3 text-sm ${ERROR_TEXT_CLASS}`}>{errorMessage}</Text>
        ) : null}
        <View className="flex-row justify-between gap-4">
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canOperate }} disabled={!canOperate} onPress={() => setActiveOperation("deposit")} className={`flex-1 rounded-2xl px-4 py-5 ${canOperate ? "bg-blue-600" : "bg-slate-300"}`} android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">預入</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canOperate }} disabled={!canOperate} onPress={() => setActiveOperation("withdraw")} className={`flex-1 rounded-2xl px-4 py-5 ${canOperate ? "bg-slate-800" : "bg-slate-300"}`} android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">引き出し</Text>
          </Pressable>
        </View>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push("/savings")}
        className="mb-6 rounded-2xl bg-blue-700 p-5">
        <Text className="text-center font-semibold text-white">自動積立預金</Text>
      </Pressable>

      <ChildLoanPanel
        onBalanceChanged={refreshBalances}
        userId={user.id}
        walletBalance={walletBalance}
      />

      <Pressable
        accessibilityRole="button"
        className="rounded-3xl bg-slate-900 px-6 py-4 shadow-sm shadow-slate-400"
        onPress={() => router.back()}
      >
        <Text className="text-center text-base font-semibold text-white">戻る</Text>
      </Pressable>

      <BankAmountModal
        fixedAmount={pending?.amount}
        canSubmit={activeOperation ? canSubmitFor(activeOperation) : () => false}
        errorMessage={errorMessage}
        isLive={isLive}
        isSubmitting={isSubmitting}
        onClose={closeModal}
        onConfirm={handleConfirm}
        operation={activeOperation}
      />
    </ScrollView>
  );
}
