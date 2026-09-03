import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import BankAmountModal, { type BankOperation } from "../components/bank/BankAmountModal";
import { formatYen as yen } from "../lib/bank";
import { bankBorrow, bankDeposit, bankRepay, bankWithdraw } from "../lib/bankService";
import { canBorrow, canDeposit, canRepay, canWithdraw } from "../lib/bankUtils";
import { useBankAccount } from "../lib/useBankAccount";
import { fetchUserBalance } from "../lib/userService";
import { useCurrentUser } from "../store";

export default function BankScreen() {
  const user = useCurrentUser();
  const { account, isLive, reload } = useBankAccount();

  // ライブ接続中のお財布残高。ChildTasksScreen/ChildStoreScreenと同じパターンで、
  // 画面表示時・各操作完了後に再取得して最新化する。
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const reloadBalance = useCallback(() => {
    if (!isLive || !user) {
      setLiveBalance(null);
      return;
    }
    fetchUserBalance(user.id)
      .then(setLiveBalance)
      .catch(() => setLiveBalance(null));
  }, [isLive, user]);

  useEffect(() => {
    reloadBalance();
  }, [reloadBalance]);

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

  const walletBalance = isLive && liveBalance !== null ? liveBalance : user.balance;
  const depositBalance = account?.deposit_balance ?? 0;
  const loanBalance = account?.loan_balance ?? 0;

  const closeModal = () => {
    if (isSubmitting) return;
    setActiveOperation(null);
    setErrorMessage(null);
  };

  const handleConfirm = async (amount: number) => {
    if (!activeOperation) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      switch (activeOperation) {
        case "deposit":
          await bankDeposit(user.id, amount);
          break;
        case "withdraw":
          await bankWithdraw(user.id, amount);
          break;
        case "borrow":
          await bankBorrow(user.id, amount);
          break;
        case "repay":
          await bankRepay(user.id, amount);
          break;
      }
      setActiveOperation(null);
      reload();
      reloadBalance();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "操作に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmitFor = (operation: BankOperation) => (amount: number) => {
    switch (operation) {
      case "deposit":
        return canDeposit(amount, walletBalance, isLive);
      case "withdraw":
        return canWithdraw(amount, depositBalance, isLive);
      case "borrow":
        return canBorrow(amount, isLive);
      case "repay":
        return canRepay(amount, walletBalance, loanBalance, isLive);
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
        <View className="mb-4 rounded-2xl bg-slate-50 p-4">
          <Text className="text-sm text-slate-500">現在の所持金（お財布）</Text>
          <Text accessibilityLabel="現在の所持金" className="mt-2 text-4xl font-semibold text-slate-900">
            {yen(walletBalance)}
          </Text>
        </View>
        <View className="rounded-2xl bg-slate-50 p-4">
          <Text className="text-sm text-slate-500">銀行に預けているお金</Text>
          <Text accessibilityLabel="預金残高" className="mt-2 text-4xl font-semibold text-slate-900">
            {yen(depositBalance)}
          </Text>
        </View>
      </View>

      <View className="mb-6 rounded-3xl bg-white p-6 shadow-sm shadow-slate-200">
        <Text className="mb-4 text-xl font-semibold text-slate-900">預入 / 引き出し</Text>
        <View className="flex-row justify-between gap-4">
          <Pressable accessibilityRole="button" onPress={() => setActiveOperation("deposit")} className="flex-1 rounded-2xl bg-blue-600 px-4 py-5" android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">預入</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setActiveOperation("withdraw")} className="flex-1 rounded-2xl bg-slate-800 px-4 py-5" android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">引き出し</Text>
          </Pressable>
        </View>
      </View>

      <View className="mb-6 rounded-3xl bg-white p-6 shadow-sm shadow-slate-200">
        <Text className="mb-4 text-xl font-semibold text-slate-900">現在のローン</Text>
        <View className="rounded-2xl bg-slate-50 p-4">
          <Text className="text-sm text-slate-500">借入残高</Text>
          <Text accessibilityLabel="借入残高" className="mt-2 text-4xl font-semibold text-slate-900">
            {yen(loanBalance)}
          </Text>
        </View>
      </View>

      <View className="mb-8 rounded-3xl bg-white p-6 shadow-sm shadow-slate-200">
        <Text className="mb-4 text-xl font-semibold text-slate-900">借り入れ / 返済</Text>
        <View className="flex-row justify-between gap-4">
          <Pressable accessibilityRole="button" onPress={() => setActiveOperation("borrow")} className="flex-1 rounded-2xl bg-emerald-600 px-4 py-5" android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">借り入れ</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setActiveOperation("repay")} className="flex-1 rounded-2xl bg-amber-600 px-4 py-5" android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">返済</Text>
          </Pressable>
        </View>
      </View>

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
