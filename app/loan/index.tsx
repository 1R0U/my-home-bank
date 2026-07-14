import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  MOCK_CURRENT_USER,
  MOCK_BANK_ACCOUNTS,
  MOCK_LOAN_APPLICATIONS,
} from "@/constants/mockData";
import type { LoanApplication, LoanStatus } from "@/types";

const STATUS_LABEL: Record<LoanStatus, string> = {
  pending: "審査中",
  approved: "承認済",
  rejected: "却下",
  repaid: "完済",
};

const STATUS_COLOR: Record<LoanStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  repaid: "bg-slate-100 text-slate-500",
};

export default function LoanApplicationScreen() {
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [termWeeks, setTermWeeks] = useState("4");
  const [applications, setApplications] = useState<LoanApplication[]>(
    MOCK_LOAN_APPLICATIONS.filter(
      (loan) => loan.user_id === MOCK_CURRENT_USER.id
    )
  );

  const bankAccount = MOCK_BANK_ACCOUNTS.find(
    (acc) => acc.user_id === MOCK_CURRENT_USER.id
  );

  const LOAN_RATE = bankAccount?.loan_rate ?? 0.1;

  const calculateWeeklyPayment = (
    principal: number,
    weeks: number,
    rate: number
  ) => {
    const totalWithInterest = principal * (1 + rate);
    return Math.ceil(totalWithInterest / weeks);
  };

  const handleSubmit = () => {
    const parsedAmount = parseInt(amount, 10);
    const parsedWeeks = parseInt(termWeeks, 10);

    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert("エラー", "金額を正しく入力してください");
      return;
    }
    if (parsedAmount > 500) {
      Alert.alert("エラー", "借入上限は500 $HMC です");
      return;
    }
    if (!purpose.trim()) {
      Alert.alert("エラー", "目的を入力してください");
      return;
    }
    if (!parsedWeeks || parsedWeeks < 1 || parsedWeeks > 12) {
      Alert.alert("エラー", "返済期間は1〜12週で選んでください");
      return;
    }

    const weekly = calculateWeeklyPayment(parsedAmount, parsedWeeks, LOAN_RATE);
    const newApplication: LoanApplication = {
      id: `loan-${Date.now()}`,
      user_id: MOCK_CURRENT_USER.id,
      amount: parsedAmount,
      purpose: purpose.trim(),
      status: "pending",
      interest_rate: LOAN_RATE,
      term_weeks: parsedWeeks,
      weekly_payment: weekly,
      remaining_balance: parsedAmount,
      applied_at: new Date().toISOString(),
      approved_at: null,
    };

    setApplications((prev) => [newApplication, ...prev]);
    setAmount("");
    setPurpose("");
    setTermWeeks("4");
    Alert.alert("申請完了", "ローン申請を送信しました。審査をお待ちください。");
  };

  const previewAmount = parseInt(amount, 10) || 0;
  const previewWeeks = parseInt(termWeeks, 10) || 4;
  const previewWeekly = calculateWeeklyPayment(
    previewAmount,
    previewWeeks,
    LOAN_RATE
  );
  const previewTotal = previewWeekly * previewWeeks;

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="mb-6">
          <Text className="text-2xl font-bold text-slate-800">
            ローン申請
          </Text>
          <Text className="text-sm text-slate-500 mt-1">
            金利 {LOAN_RATE * 100}% で $HMC を借りられます
          </Text>
        </View>

        {/* Current Loan Summary */}
        {bankAccount && bankAccount.loan_balance > 0 && (
          <View className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
            <Text className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">
              現在の借入残高
            </Text>
            <Text className="text-3xl font-bold text-amber-700">
              {bankAccount.loan_balance} $HMC
            </Text>
            <Text className="text-xs text-amber-500 mt-1">
              適用金利: {(bankAccount.loan_rate * 100).toFixed(0)}%
            </Text>
          </View>
        )}

        {/* Application Form */}
        <View className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 shadow-sm">
          <Text className="text-lg font-bold text-slate-800 mb-4">
            新規申請
          </Text>

          {/* Amount */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-slate-600 mb-1">
              借入金額 ($HMC)
            </Text>
            <TextInput
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-lg text-slate-800"
              value={amount}
              onChangeText={setAmount}
              placeholder="金額を入力（上限 500）"
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>

          {/* Purpose */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-slate-600 mb-1">
              借入目的
            </Text>
            <TextInput
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800"
              value={purpose}
              onChangeText={setPurpose}
              placeholder="何に使いますか？"
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Term */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-slate-600 mb-1">
              返済期間（週）
            </Text>
            <View className="flex-row gap-2">
              {["2", "4", "6", "8"].map((w) => (
                <TouchableOpacity
                  key={w}
                  onPress={() => setTermWeeks(w)}
                  className={`flex-1 py-2.5 rounded-xl border items-center ${
                    termWeeks === w
                      ? "bg-indigo-600 border-indigo-600"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      termWeeks === w ? "text-white" : "text-slate-600"
                    }`}
                  >
                    {w}週
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Preview */}
          {previewAmount > 0 && (
            <View className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-4">
              <Text className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-2">
                返済シミュレーション
              </Text>
              <View className="flex-row justify-between mb-1">
                <Text className="text-sm text-indigo-700">毎週の返済額</Text>
                <Text className="text-sm font-bold text-indigo-800">
                  {previewWeekly} $HMC
                </Text>
              </View>
              <View className="flex-row justify-between mb-1">
                <Text className="text-sm text-indigo-700">返済総額</Text>
                <Text className="text-sm font-bold text-indigo-800">
                  {previewTotal} $HMC
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-sm text-indigo-700">利息</Text>
                <Text className="text-sm font-bold text-indigo-800">
                  {previewTotal - previewAmount} $HMC
                </Text>
              </View>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit}
            className="bg-indigo-600 rounded-xl py-3.5 items-center shadow-lg shadow-indigo-200 active:bg-indigo-700"
          >
            <Text className="text-white font-bold text-base">
              申請を送信する
            </Text>
          </TouchableOpacity>
        </View>

        {/* Loan History */}
        <View className="mb-8">
          <Text className="text-lg font-bold text-slate-800 mb-3">
            申請履歴
          </Text>

          {applications.length === 0 ? (
            <View className="bg-white rounded-2xl border border-slate-200 p-6 items-center">
              <Text className="text-slate-400 text-sm">
                まだローン申請はありません
              </Text>
            </View>
          ) : (
            <View className="space-y-3 gap-3">
              {applications.map((loan) => (
                <View
                  key={loan.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm"
                >
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-slate-800">
                        {loan.purpose}
                      </Text>
                      <Text className="text-xs text-slate-400 mt-0.5">
                        {new Date(loan.applied_at).toLocaleDateString("ja-JP")}
                      </Text>
                    </View>
                    <View
                      className={`px-2.5 py-1 rounded-full ${STATUS_COLOR[loan.status]}`}
                    >
                      <Text className="text-xs font-bold">
                        {STATUS_LABEL[loan.status]}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row justify-between border-t border-slate-100 pt-2 mt-2">
                    <View>
                      <Text className="text-[10px] text-slate-400 uppercase tracking-wider">
                        借入額
                      </Text>
                      <Text className="text-sm font-bold text-slate-700">
                        {loan.amount} $HMC
                      </Text>
                    </View>
                    <View>
                      <Text className="text-[10px] text-slate-400 uppercase tracking-wider">
                        毎週返済
                      </Text>
                      <Text className="text-sm font-bold text-slate-700">
                        {loan.weekly_payment} $HMC
                      </Text>
                    </View>
                    <View>
                      <Text className="text-[10px] text-slate-400 uppercase tracking-wider">
                        残高
                      </Text>
                      <Text className="text-sm font-bold text-slate-700">
                        {loan.remaining_balance} $HMC
                      </Text>
                    </View>
                    <View>
                      <Text className="text-[10px] text-slate-400 uppercase tracking-wider">
                        期間
                      </Text>
                      <Text className="text-sm font-bold text-slate-700">
                        {loan.term_weeks}週
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
