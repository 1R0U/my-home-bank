import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import BankAmountModal, { type BankOperation } from "../components/bank/BankAmountModal";
import ChildLoanPanel from "../components/loan/ChildLoanPanel";
import { formatYen as yen } from "../lib/bank";
import { bankDeposit, bankWithdraw, type BankOperationResult } from "../lib/bankService";
import { canDeposit, canWithdraw } from "../lib/bankUtils";
import { classifySupabaseError, describeAppError } from "../lib/errors";
import { useBankAccount } from "../lib/useBankAccount";
import { useLiveBalance } from "../lib/useLiveBalance";
import { useCurrentUser } from "../store";

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
  const canOperate = !accountError;

  /**
   * 口座の金額を表示用の文字列にする。
   *
   * 取得に失敗したときに `¥0` と出すと、**預金が0円だと誤解させる**（Issue #212）。
   * 分からないものは分からないと出す。
   * @param value - 表示する金額
   * @returns 金額の文字列。取得に失敗している場合は「—」
   */
  const formatAccountBalance = (value: number) => (accountError ? "—" : yen(value));

  /** 金額入力モーダルを閉じる。送信中は閉じさせない。 */
  const closeModal = () => {
    if (isSubmitting) return;
    setActiveOperation(null);
    setErrorMessage(null);
  };

  /** 口座と財布の残高を取り直す。どちらも内部で失敗を扱うため、ここでは投げない。 */
  const refreshBalances = () => Promise.all([reload(), reloadBalance()]);

  /** 選ばれた操作に対応する銀行の関数を呼ぶ。失敗しても例外は投げず Result が返る。 */
  const runOperation = (operation: BankOperation, amount: number): Promise<BankOperationResult> => {
    switch (operation) {
      case "deposit":
        return bankDeposit(user.id, amount);
      case "withdraw":
        return bankWithdraw(user.id, amount);
      case "borrow":
      case "repay":
        throw new Error("借り入れと返済は金利付きローンから操作してください");
    }
  };

  /**
   * モーダルで金額が確定されたときの処理。
   * 結果の種類に応じて、表示文言・残高の取り直し・モーダルを閉じるかを決める。
   */
  const handleConfirm = async (amount: number) => {
    if (!activeOperation) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const result = await runOperation(activeOperation, amount);

      if (result.status === "failure") {
        // 失敗の種類から表示文言を決める。DBのメッセージを直接読まない。
        setErrorMessage(describeAppError(result.error));
        // 結果が不明な場合、DB側は成功しているかもしれない。
        // モーダルを閉じずに残高を取り直し、反映されたかを確認できるようにする。
        if (result.error.code === "OUTCOME_UNKNOWN") {
          await refreshBalances();
        }
        return;
      }

      // 残高の再取得が完了するまでモーダルと isSubmitting を維持し、
      // 古い残高で次の操作が有効になるのを防ぐ。
      await refreshBalances();
      setActiveOperation(null);
    } catch (e) {
      // ここへ来るのは、操作そのものではなく残高の取り直しなどで
      // 想定外の例外が起きた場合。操作が失敗したとは断定しない。
      setErrorMessage(describeAppError(classifySupabaseError(e, "read")));
    } finally {
      setIsSubmitting(false);
    }
  };

  /** 操作ごとに、その金額を確定してよいかを判定する関数を返す。 */
  const canSubmitFor = (operation: BankOperation) => (amount: number) => {
    switch (operation) {
      case "deposit":
        return canDeposit(amount, walletBalance, isLive);
      case "withdraw":
        return canWithdraw(amount, depositBalance, isLive);
      case "borrow":
      case "repay":
        return false;
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
          <Text accessibilityRole="alert" className="mb-3 text-sm text-rose-500">
            口座の情報を取得できませんでした
          </Text>
        ) : null}
        <View className="mb-4 rounded-2xl bg-slate-50 p-4">
          <Text className="text-sm text-slate-500">現在の所持金（お財布）</Text>
          <Text accessibilityLabel="現在の所持金" className="mt-2 text-4xl font-semibold text-slate-900">
            {yen(walletBalance)}
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
        <View className="flex-row justify-between gap-4">
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canOperate }} disabled={!canOperate} onPress={() => setActiveOperation("deposit")} className={`flex-1 rounded-2xl px-4 py-5 ${canOperate ? "bg-blue-600" : "bg-slate-300"}`} android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">預入</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canOperate }} disabled={!canOperate} onPress={() => setActiveOperation("withdraw")} className={`flex-1 rounded-2xl px-4 py-5 ${canOperate ? "bg-slate-800" : "bg-slate-300"}`} android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">引き出し</Text>
          </Pressable>
        </View>
      </View>

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
