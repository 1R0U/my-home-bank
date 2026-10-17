import { router, Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import BankAmountModal from "./bank/BankAmountModal";
import AdultLoanPanel from "./loan/AdultLoanPanel";
import { formatGol } from "../lib/amount";
import { useBankOperations } from "../lib/useBankOperations";
import { useTravelArrival } from "../lib/useTravelArrival";
import { ERROR_TEXT_CLASS } from "../constants/ui";

/**
 * 大人用の銀行画面（Issue #437）。残高と手動預金を表示する。
 *
 * 預入・引き出しの処理は子供用（`ChildBankScreen`）と共通の `useBankOperations` に置き、
 * ここは見た目（NativeWind）だけを持つ。
 */
export default function AdultBankScreen() {
  const bank = useBankOperations();
  const { user, accountError, walletBalance, depositBalance, pending, isSubmitting, errorMessage, activeOperation, canOperate } = bank;
  // 我が家タウンから入ってきたときは、読み込み中の間「いどうちゅう」の画面を出しておく（Issue #261）
  useTravelArrival(!bank.accountLoading);

  // ルート名（bank-adult）がそのまま見出しに出ないよう、名前を付ける
  const header = <Stack.Screen options={{ title: "銀行" }} />;

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-100 p-6">
        {header}
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

  /**
   * 口座の金額を表示用の文字列にする。
   *
   * 取得に失敗したときに `0 gol` と出すと、**預金が0ゴルだと誤解させる**（Issue #212）。
   * 分からないものは分からないと出す。
   * @param value - 表示する金額
   * @returns 金額の文字列。取得に失敗している場合は「—」
   */
  const formatAccountBalance = (value: number) => (accountError ? "—" : formatGol(value));

  return (
    <ScrollView
      className="flex-1 bg-slate-100 px-4"
      contentContainerStyle={{ paddingVertical: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {header}
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
        {bank.isCorrupt ? (
          <View className="mb-4 rounded-2xl bg-amber-50 p-4">
            <Text accessibilityRole="alert" className="text-sm text-slate-700">
              前回の操作の結果を確認できません。残高と履歴を確認してから解除してください。
              解除後に同じ操作を行うと、二重に反映される可能性があります。
            </Text>
            {/* 履歴は今は大人・子供で同じ画面（#438 で分ける） */}
            <Pressable accessibilityRole="button" disabled={isSubmitting}
              accessibilityState={{ disabled: isSubmitting }}
              onPress={() => router.push("/history")} className="mt-2 py-2">
              <Text className="font-semibold text-blue-700">取引履歴を確認</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={isSubmitting}
              accessibilityState={{ disabled: isSubmitting }}
              onPress={bank.discardCorrupt} className="mt-2 py-2">
              <Text className="font-semibold text-blue-700">残高と履歴を確認したので解除</Text>
            </Pressable>
            {errorMessage ? <Text accessibilityRole="alert" className={`mt-2 text-sm ${ERROR_TEXT_CLASS}`}>{errorMessage}</Text> : null}
          </View>
        ) : pending ? (
          <View className="mb-4 rounded-2xl bg-amber-50 p-4">
            <Text className="text-sm text-slate-700">
              {pending.kind === "deposit" ? "預入" : "引き出し"} {formatGol(pending.amount)} の結果が確認待ちです。
            </Text>
            <Pressable accessibilityRole="button" disabled={isSubmitting || !bank.isLive}
              accessibilityState={{ disabled: isSubmitting || !bank.isLive }}
              onPress={() => bank.openOperation(pending.kind)} className="mt-2 py-2">
              <Text className="font-semibold text-blue-700">操作の結果を確認</Text>
            </Pressable>
          </View>
        ) : errorMessage && !activeOperation ? (
          <Text accessibilityRole="alert" className={`mb-3 text-sm ${ERROR_TEXT_CLASS}`}>{errorMessage}</Text>
        ) : null}
        <View className="flex-row justify-between gap-4">
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canOperate }} disabled={!canOperate} onPress={() => bank.openOperation("deposit")} className={`flex-1 rounded-2xl px-4 py-5 ${canOperate ? "bg-blue-600" : "bg-slate-300"}`} android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">預入</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canOperate }} disabled={!canOperate} onPress={() => bank.openOperation("withdraw")} className={`flex-1 rounded-2xl px-4 py-5 ${canOperate ? "bg-slate-800" : "bg-slate-300"}`} android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">引き出し</Text>
          </Pressable>
        </View>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push("/savings-adult")}
        className="mb-6 rounded-2xl bg-blue-700 p-5">
        <Text className="text-center font-semibold text-white">自動積立預金</Text>
      </Pressable>

      <AdultLoanPanel
        key={user.id}
        onBalanceChanged={bank.refreshBalances}
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
        walletBalance={walletBalance}
        depositBalance={depositBalance}
        fixedAmount={pending?.amount}
        canSubmit={activeOperation ? bank.canSubmitFor(activeOperation) : () => false}
        errorMessage={errorMessage}
        isLive={bank.isLive}
        isSubmitting={isSubmitting}
        onClose={bank.closeModal}
        onConfirm={bank.confirm}
        operation={activeOperation}
      />
    </ScrollView>
  );
}
