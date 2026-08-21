import { router } from "expo-router";
import { Pressable, ScrollView, Text, View, Alert } from "react-native";
import { MOCK_BANK_ACCOUNTS } from "../constants/mockData";
import { findBankAccount, formatYen as yen } from "../lib/bank";
import { useCurrentUser } from "../store";

export default function BankScreen() {
  const user = useCurrentUser();

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

  const account = findBankAccount(MOCK_BANK_ACCOUNTS, user.id);

  const handleDeposit = () => Alert.alert("預入", "テスト: 預入を実行しました");
  const handleWithdraw = () => Alert.alert("引き出し", "テスト: 引き出しを実行しました");
  const handleBorrow = () => Alert.alert("借り入れ", "テスト: 借り入れを実行しました");
  const handleRepay = () => Alert.alert("返済", "テスト: 返済を実行しました");

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
            {yen(user.balance)}
          </Text>
        </View>
        <View className="rounded-2xl bg-slate-50 p-4">
          <Text className="text-sm text-slate-500">銀行に預けているお金</Text>
          <Text accessibilityLabel="預金残高" className="mt-2 text-4xl font-semibold text-slate-900">
            {yen(account?.deposit_balance ?? 0)}
          </Text>
        </View>
      </View>

      <View className="mb-6 rounded-3xl bg-white p-6 shadow-sm shadow-slate-200">
        <Text className="mb-4 text-xl font-semibold text-slate-900">預入 / 引き出し</Text>
        <View className="flex-row justify-between gap-4">
          <Pressable accessibilityRole="button" onPress={handleDeposit} className="flex-1 rounded-2xl bg-blue-600 px-4 py-5" android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">預入</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={handleWithdraw} className="flex-1 rounded-2xl bg-slate-800 px-4 py-5" android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">引き出し</Text>
          </Pressable>
        </View>
      </View>

      <View className="mb-6 rounded-3xl bg-white p-6 shadow-sm shadow-slate-200">
        <Text className="mb-4 text-xl font-semibold text-slate-900">現在のローン</Text>
        <View className="rounded-2xl bg-slate-50 p-4">
          <Text className="text-sm text-slate-500">借入残高</Text>
          <Text accessibilityLabel="借入残高" className="mt-2 text-4xl font-semibold text-slate-900">
            {yen(account?.loan_balance ?? 0)}
          </Text>
        </View>
      </View>

      <View className="mb-8 rounded-3xl bg-white p-6 shadow-sm shadow-slate-200">
        <Text className="mb-4 text-xl font-semibold text-slate-900">借り入れ / 返済</Text>
        <View className="flex-row justify-between gap-4">
          <Pressable accessibilityRole="button" onPress={handleBorrow} className="flex-1 rounded-2xl bg-emerald-600 px-4 py-5" android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">借り入れ</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={handleRepay} className="flex-1 rounded-2xl bg-amber-600 px-4 py-5" android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
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
    </ScrollView>
  );
}
