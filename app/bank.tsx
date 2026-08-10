import { Link, router } from "expo-router";
import { Pressable, ScrollView, Text, View, Alert } from "react-native";
import { MOCK_CURRENT_USER, MOCK_BANK_ACCOUNTS } from "../constants/mockData";

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n);
}

export default function BankScreen() {
  const user = MOCK_CURRENT_USER;
  const account = MOCK_BANK_ACCOUNTS.find((a) => a.user_id === user.id);

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
          <Text className="mt-2 text-4xl font-semibold text-slate-900">{yen(user.balance)}</Text>
        </View>
        <View className="rounded-2xl bg-slate-50 p-4">
          <Text className="text-sm text-slate-500">銀行に預けているお金</Text>
          <Text className="mt-2 text-4xl font-semibold text-slate-900">{yen(account?.deposit_balance ?? 0)}</Text>
        </View>
      </View>

      <View className="mb-6 rounded-3xl bg-white p-6 shadow-sm shadow-slate-200">
        <Text className="mb-4 text-xl font-semibold text-slate-900">預入 / 引き出し</Text>
        <View className="flex-row justify-between gap-4">
          <Pressable onPress={handleDeposit} className="flex-1 rounded-2xl bg-blue-600 px-4 py-5" android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">預入</Text>
          </Pressable>
          <Pressable onPress={handleWithdraw} className="flex-1 rounded-2xl bg-slate-800 px-4 py-5" android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">引き出し</Text>
          </Pressable>
        </View>
      </View>

      <View className="mb-6 rounded-3xl bg-white p-6 shadow-sm shadow-slate-200">
        <Text className="mb-4 text-xl font-semibold text-slate-900">現在のローン</Text>
        <View className="rounded-2xl bg-slate-50 p-4">
          <Text className="text-sm text-slate-500">借入残高</Text>
          <Text className="mt-2 text-4xl font-semibold text-slate-900">{yen(account?.loan_balance ?? 0)}</Text>
        </View>
      </View>

      <View className="mb-8 rounded-3xl bg-white p-6 shadow-sm shadow-slate-200">
        <Text className="mb-4 text-xl font-semibold text-slate-900">借り入れ / 返済</Text>
        <View className="flex-row justify-between gap-4">
          <Pressable onPress={handleBorrow} className="flex-1 rounded-2xl bg-emerald-600 px-4 py-5" android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">借り入れ</Text>
          </Pressable>
          <Pressable onPress={handleRepay} className="flex-1 rounded-2xl bg-amber-600 px-4 py-5" android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
            <Text className="text-center text-base font-semibold text-white">返済</Text>
          </Pressable>
        </View>
      </View>

      <Link href="/" asChild>
        <Pressable className="rounded-3xl bg-slate-900 px-6 py-4 shadow-sm shadow-slate-400">
          <Text className="text-center text-base font-semibold text-white">戻る</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

