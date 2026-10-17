import { Pressable, Text, TextInput, View } from "react-native";
import { formatGol } from "../../lib/amount";
import { formatMonthlyRate } from "../../lib/loan";
import { PLACEHOLDER_TEXT_COLOR } from "../../constants/ui";
import { useLoanPanel } from "./useLoanPanel";

type Props = {
  userId: string;
  walletBalance: number;
  onBalanceChanged: () => Promise<unknown>;
};

/**
 * 大人用の銀行画面（`AdultBankScreen`）のローン欄。申請・返済を表示し、送信中と結果未確認の返済を区別して保持する。
 *
 * 処理は子供用（`ChildLoanPanel`）と共通の `useLoanPanel` に置き、ここは見た目（NativeWind）だけを持つ。
 */
export default function AdultLoanPanel({ userId, walletBalance, onBalanceChanged }: Props) {
  const panel = useLoanPanel({ userId, walletBalance, onBalanceChanged });
  const { offer, loading, error, isLive, amount, requestError, isSubmitting, inputsLocked, canOperate, canRequest, pendingRepayment } = panel;

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
        入力可能な最大金額 {panel.offerReady ? formatGol(panel.requestMaximum) : "—"}
      </Text>
      <TextInput
        accessibilityLabel="ローン申請額"
        className="mt-1 rounded-xl bg-slate-50 px-4 py-3 text-slate-900"
        keyboardType="number-pad"
        editable={!inputsLocked}
        onChangeText={panel.changeAmountText}
        placeholder="例: 100"
        placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
        value={panel.amountText}
      />
      {requestError ? <Text accessibilityRole="alert" className="mt-2 text-xs text-rose-600">{requestError}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="借入可能な最大額を入力"
        accessibilityState={{ disabled: !canOperate || isSubmitting || panel.requestMaximum === 0 }}
        disabled={!canOperate || isSubmitting || panel.requestMaximum === 0}
        className="mt-2 py-2" onPress={panel.fillRequestMaximum}>
        <Text className="text-sm font-semibold text-emerald-700">最大額を入力</Text>
      </Pressable>
      <Text className="mt-3 text-xs font-semibold text-slate-500">用途</Text>
      <TextInput
        accessibilityLabel="ローンの用途"
        className="mt-1 rounded-xl bg-slate-50 px-4 py-3 text-slate-900"
        maxLength={500}
        editable={!inputsLocked}
        onChangeText={panel.changePurpose}
        placeholder="何に使うか入力"
        placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
        value={panel.purpose}
      />
      {amount !== null && !requestError && offer ? (
        <View className="mt-3 rounded-xl bg-slate-50 p-3">
          <Text className="text-xs text-slate-600">元本 {formatGol(amount)} ＋ 利息 {formatGol(panel.previewInterest)}</Text>
          <Text className="mt-1 text-sm font-bold text-slate-900">返済予定額 {formatGol(panel.previewTotal)}</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityLabel="ローンを申請する"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canRequest || isSubmitting }}
        className={`mt-4 items-center rounded-xl py-3 ${canRequest && !isSubmitting ? "bg-emerald-600" : "bg-slate-200"}`}
        disabled={!canRequest || isSubmitting}
        onPress={panel.handleRequest}
      >
        <Text className={`font-bold ${canRequest && !isSubmitting ? "text-white" : "text-slate-400"}`}>
          {panel.pendingLoan ? "承認待ちの申請があります" : "内容を確認して申請"}
        </Text>
      </Pressable>

      <Pressable accessibilityRole="button" accessibilityLabel="ローン申請の入力をキャンセル"
        accessibilityState={{ disabled: inputsLocked }} disabled={inputsLocked}
        className="mt-2 items-center py-2" onPress={panel.cancelRequest}>
        <Text className="text-sm font-semibold text-slate-500">入力をキャンセル</Text>
      </Pressable>

      {panel.message ? <Text accessibilityRole="alert" className="mt-3 text-sm text-slate-600">{panel.message}</Text> : null}
      {pendingRepayment ? (
        <View className="mt-3 rounded-xl bg-amber-50 p-3">
          <Text accessibilityRole="alert" className="text-sm text-slate-700">
            返済 {formatGol(pendingRepayment.amount)} の結果を確認しています。確認が済むまで金額の変更・キャンセルはできません。
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="返済の結果を確認"
            accessibilityState={{ disabled: isSubmitting || !isLive }}
            disabled={isSubmitting || !isLive} className="mt-2 py-2"
            onPress={() => panel.handleRepay(pendingRepayment.loanId)}>
            <Text className="text-sm font-semibold text-amber-800">返済の結果を確認</Text>
          </Pressable>
        </View>
      ) : null}
      {!isLive ? <Text className="mt-2 text-xs text-slate-400">※ プレビュー中は申請・返済できません</Text> : null}

      <Text className="mt-6 text-base font-bold text-slate-900">契約・申請状況</Text>
      {panel.rows.length === 0 ? <Text className="mt-2 text-sm text-slate-400">ローンはありません</Text> : null}
      {panel.rows.map((row) => {
        const { loan } = row;
        return (
          <View className="mt-3 rounded-2xl border border-slate-100 p-4" key={loan.id}>
            <View className="flex-row justify-between">
              <Text className="flex-1 font-semibold text-slate-900">{loan.purpose}</Text>
              <Text className={`text-xs font-bold ${row.isOverdue ? "text-rose-600" : "text-slate-500"}`}>
                {row.statusLabel}
              </Text>
            </View>
            <Text className="mt-2 text-xs text-slate-600">
              元本 {formatGol(loan.principal_amount ?? loan.requested_amount)} ／ 利息 {formatGol(loan.interest_amount ?? row.pendingInterest)}
            </Text>
            <Text className="mt-1 text-sm font-bold text-slate-900">残額 {formatGol(row.displayedRemaining)}</Text>
            {loan.due_at ? <Text className="mt-1 text-xs text-slate-500">期限 {new Date(loan.due_at).toLocaleDateString("ja-JP")}</Text> : null}
            {loan.status === "active" ? (
              <View className="mt-3">
                <Text accessibilityLabel={`${loan.purpose}の返済可能な最大金額`} className="mb-2 text-xs text-slate-600">
                  返済可能な最大金額 {formatGol(row.repayMaximum)}
                </Text>
                <TextInput
                  accessibilityLabel={`${loan.purpose}の返済額`}
                  className="rounded-xl bg-slate-50 px-4 py-3 text-slate-900"
                  keyboardType="number-pad"
                  editable={!inputsLocked}
                  onChangeText={(value) => panel.changeRepayText(loan.id, value)}
                  placeholder={row.repayMaximum > 0 ? `1〜${row.repayMaximum}` : "0"}
                  placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                  value={row.repayText}
                />
                {row.repayError ? <Text accessibilityRole="alert" className="mt-2 text-xs text-rose-600">{row.repayError}</Text> : null}
                <Pressable accessibilityRole="button" accessibilityLabel={`${loan.purpose}の返済可能な最大額を入力`}
                  accessibilityState={{ disabled: !canOperate || isSubmitting || row.repayMaximum === 0 }}
                  disabled={!canOperate || isSubmitting || row.repayMaximum === 0}
                  className="mt-2 py-2" onPress={() => panel.fillRepayMaximum(row)}>
                  <Text className="text-sm font-semibold text-amber-700">最大額を入力</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`${loan.purpose}を返済する`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !row.canRepay || isSubmitting }}
                  className={`mt-2 items-center rounded-xl py-3 ${row.canRepay && !isSubmitting ? "bg-amber-600" : "bg-slate-200"}`}
                  disabled={!row.canRepay || isSubmitting}
                  onPress={() => panel.handleRepay(loan.id)}
                >
                  <Text className={`font-bold ${row.canRepay && !isSubmitting ? "text-white" : "text-slate-400"}`}>
                    {row.isSending ? "返済中…" : "返済する"}
                  </Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`${loan.purpose}の返済入力をキャンセル`}
                  accessibilityState={{ disabled: inputsLocked }} disabled={inputsLocked}
                  className="mt-2 items-center py-2" onPress={() => panel.cancelRepay(loan.id)}>
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
