import { Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_BANK_ACCOUNTS, MOCK_USERS } from "../constants/mockData";
import AdultBottomNav from "./nav/AdultBottomNav";
import ScreenHeader from "./ScreenHeader";

type BalanceTab = "deposit" | "loan";

const childAccounts = MOCK_USERS.filter((user) => user.role === "child").map((user) => ({
  user,
  account: MOCK_BANK_ACCOUNTS.find((account) => account.user_id === user.id),
}));

function formatRatePercent(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}

type BalanceTabButtonProps = {
  active: boolean;
  label: string;
  onPress: () => void;
};

function BalanceTabButton({ active, label, onPress }: BalanceTabButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`flex-1 items-center rounded-t-xl border px-3 py-2 ${
        active ? "border-slate-200 border-b-white bg-white" : "border-transparent bg-slate-100"
      }`}
      onPress={onPress}
    >
      <Text className={`text-sm font-semibold ${active ? "text-slate-900" : "text-slate-400"}`}>{label}</Text>
    </Pressable>
  );
}

function DepositList() {
  return (
    <View className="rounded-b-2xl rounded-tr-2xl bg-white p-4">
      <Text className="text-sm font-semibold text-slate-500">現在の預金状況</Text>

      <View className="mt-3 overflow-hidden rounded-xl border border-slate-100">
        {childAccounts.map(({ user, account }, index) => (
          <View
            accessibilityLabel={`${user.name}、預金残高 ${account?.deposit_balance ?? 0}pt、金利 ${formatRatePercent(
              account?.interest_rate ?? 0,
            )}`}
            accessible
            className={`flex-row items-center justify-between px-4 py-3 ${
              index !== childAccounts.length - 1 ? "border-b border-slate-100" : ""
            }`}
            key={user.id}
          >
            <Text className="text-sm font-semibold text-slate-900">{user.name}</Text>
            <View className="items-end">
              <Text className="text-sm font-bold text-blue-600">{account?.deposit_balance ?? 0}pt</Text>
              <Text className="mt-0.5 text-xs text-slate-400">
                金利 {formatRatePercent(account?.interest_rate ?? 0)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function LoanList() {
  return (
    <View className="rounded-b-2xl rounded-tr-2xl bg-white p-4">
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
  );
}

export default function ParentBalanceScreen() {
  const [tab, setTab] = useState<BalanceTab>("deposit");

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScreenHeader title="所持金" />

      <ScrollView contentContainerClassName="px-4 pb-10" showsVerticalScrollIndicator={false}>
        <View className="flex-row gap-2">
          <BalanceTabButton active={tab === "deposit"} label="預金" onPress={() => setTab("deposit")} />
          <BalanceTabButton active={tab === "loan"} label="ローン" onPress={() => setTab("loan")} />
        </View>

        {tab === "deposit" ? <DepositList /> : <LoanList />}
      </ScrollView>

      <AdultBottomNav activeKey={null} />
    </SafeAreaView>
  );
}
