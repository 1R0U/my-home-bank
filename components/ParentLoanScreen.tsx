import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_BANK_ACCOUNTS, MOCK_LOAN_REQUESTS, MOCK_USERS } from "../constants/mockData";
import LoanRequestDetail from "./loan/LoanRequestDetail";
import AdultBottomNav from "./nav/AdultBottomNav";

type LoanTab = "approval" | "status";

const TAB_LABELS: Record<LoanTab, string> = {
  approval: "承認",
  status: "状況",
};

const childAccounts = MOCK_USERS.filter((user) => user.role === "child").map((user) => ({
  user,
  account: MOCK_BANK_ACCOUNTS.find((account) => account.user_id === user.id),
}));

function findRequester(userId: string) {
  return MOCK_USERS.find((user) => user.id === userId);
}

export default function ParentLoanScreen() {
  const [activeTab, setActiveTab] = useState<LoanTab>("approval");
  const [selectedRequestId, setSelectedRequestId] = useState<string>();

  const pendingRequests = useMemo(
    () => MOCK_LOAN_REQUESTS.filter((request) => request.status === "pending"),
    [],
  );
  const selectedRequest = pendingRequests.find((request) => request.id === selectedRequestId);

  const changeTab = (tab: LoanTab) => {
    setActiveTab(tab);
    setSelectedRequestId(undefined);
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-row items-center justify-between px-6 pt-4">
        <Text className="text-lg font-bold text-slate-900">ローン</Text>

        <View
          accessibilityLabel="通知"
          className="h-14 w-14 items-center justify-center rounded-full bg-white"
        >
          <Ionicons color="#0f172a" name="notifications" size={28} />
        </View>
      </View>

      <View accessibilityRole="tablist" className="flex-row gap-2 px-6 pb-3 pt-4">
        {(Object.keys(TAB_LABELS) as LoanTab[]).map((tab) => {
          const isActive = tab === activeTab;
          const label =
            tab === "approval" && pendingRequests.length > 0
              ? `${TAB_LABELS[tab]} (${pendingRequests.length})`
              : TAB_LABELS[tab];

          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className={`flex-1 items-center rounded-full py-2 ${isActive ? "bg-slate-900" : "bg-white"}`}
              key={tab}
              onPress={() => changeTab(tab)}
            >
              <Text className={`text-sm font-semibold ${isActive ? "text-white" : "text-slate-500"}`}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-6 pb-6" showsVerticalScrollIndicator={false}>
        {activeTab === "approval" ? (
          <>
            <View className="overflow-hidden rounded-2xl bg-white">
              {pendingRequests.length === 0 ? (
                <Text className="px-4 py-6 text-center text-sm text-slate-400">
                  承認待ちのローン申請はありません
                </Text>
              ) : (
                pendingRequests.map((request, index) => {
                  const isSelected = request.id === selectedRequestId;
                  const requester = findRequester(request.user_id);

                  return (
                    <Pressable
                      accessibilityHint="タップすると下に詳細が表示されます"
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      className={`flex-row items-center justify-between px-4 py-4 ${
                        index !== pendingRequests.length - 1 ? "border-b border-slate-100" : ""
                      } ${isSelected ? "bg-slate-50" : ""}`}
                      key={request.id}
                      onPress={() => setSelectedRequestId(isSelected ? undefined : request.id)}
                    >
                      <View className="flex-1 pr-3">
                        <Text className="text-sm font-semibold text-slate-900">{requester?.name ?? "不明"}</Text>
                        <Text className="mt-0.5 text-xs text-slate-500" numberOfLines={1}>
                          {request.purpose}
                        </Text>
                      </View>
                      <Text className="text-sm font-bold text-rose-600">{request.amount}pt</Text>
                    </Pressable>
                  );
                })
              )}
            </View>

            {selectedRequest && (
              <LoanRequestDetail
                loanRequest={selectedRequest}
                onClose={() => setSelectedRequestId(undefined)}
                requester={findRequester(selectedRequest.user_id)}
                showActions
              />
            )}
          </>
        ) : (
          <View className="overflow-hidden rounded-2xl bg-white p-4">
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
        )}
      </ScrollView>

      <AdultBottomNav activeKey="loan" />
    </SafeAreaView>
  );
}
