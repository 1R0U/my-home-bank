import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_BANK_ACCOUNTS, MOCK_USERS } from "../constants/mockData";
import AdultBottomNav from "./nav/AdultBottomNav";

const childAccounts = MOCK_USERS.filter((user) => user.role === "child").map((user) => ({
  user,
  account: MOCK_BANK_ACCOUNTS.find((account) => account.user_id === user.id),
}));

export default function ParentLoanScreen() {
  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-1 px-6 pb-4 pt-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-slate-900">ローン</Text>

          <View
            accessibilityLabel="通知"
            className="h-14 w-14 items-center justify-center rounded-full bg-white"
          >
            <Ionicons color="#0f172a" name="notifications" size={28} />
          </View>
        </View>

        <View className="mt-4 overflow-hidden rounded-2xl bg-white p-4">
          <Text className="text-sm font-semibold text-slate-500">現在のローン状況</Text>

          <View className="mt-3 overflow-hidden rounded-xl border border-slate-100">
            <View className="flex-row bg-slate-50 px-4 py-2">
              <Text className="flex-1 text-xs font-semibold text-slate-400">誰が</Text>
              <Text className="flex-1 text-xs font-semibold text-slate-400">用途</Text>
              <Text className="text-xs font-semibold text-slate-400">借りてる</Text>
            </View>

            {childAccounts.map(({ user, account }, index) => (
              <View
                accessibilityLabel={`${user.name}、用途 ${account?.loan_purpose ?? "なし"}、借入残高 ${
                  account?.loan_balance ?? 0
                }pt`}
                accessible
                className={`flex-row items-center px-4 py-3 ${
                  index !== childAccounts.length - 1 ? "border-b border-slate-100" : ""
                }`}
                key={user.id}
              >
                <Text className="flex-1 text-sm font-semibold text-slate-900">{user.name}</Text>
                <Text className="flex-1 text-xs text-slate-500" numberOfLines={1}>
                  {account?.loan_purpose ?? "-"}
                </Text>
                <Text className="text-sm font-bold text-rose-600">{account?.loan_balance ?? 0}pt</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <AdultBottomNav activeKey="loan" />
    </SafeAreaView>
  );
}
