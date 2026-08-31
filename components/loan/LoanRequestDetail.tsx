import { Pressable, Text, View } from "react-native";
import type { LoanRequest, User } from "../../types";

const LOAN_REQUEST_STATUS_LABELS: Record<LoanRequest["status"], string> = {
  pending: "承認待",
  approved: "承認済",
  rejected: "却下",
};

type LoanRequestDetailProps = {
  loanRequest: LoanRequest;
  requester: User | undefined;
  onClose: () => void;
  showActions?: boolean;
};

export default function LoanRequestDetail({
  loanRequest,
  requester,
  onClose,
  showActions = false,
}: LoanRequestDetailProps) {
  return (
    <View className="mt-4 rounded-2xl bg-white p-5">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-xs font-semibold text-slate-400">申請者</Text>
          <Text className="mt-1 text-lg font-bold text-slate-900">{requester?.name ?? "不明"}</Text>
        </View>
        <Pressable
          accessibilityLabel="ローン申請の詳細を閉じる"
          accessibilityRole="button"
          className="h-8 w-8 items-center justify-center rounded-full active:bg-slate-100"
          hitSlop={8}
          onPress={onClose}
        >
          <Text className="text-lg font-bold text-slate-400">×</Text>
        </Pressable>
      </View>

      <View className="mt-3 flex-row items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
        <Text className="text-xs font-semibold text-slate-400">希望額</Text>
        <Text className="text-base font-bold text-slate-900">
          {loanRequest.amount.toLocaleString("ja-JP")}pt
        </Text>
      </View>

      <Text className="mt-4 text-xs font-semibold text-slate-400">用途</Text>
      <Text className="mt-1 text-sm leading-5 text-slate-600">{loanRequest.purpose}</Text>
      <Text className="mt-3 text-xs font-medium text-slate-400">
        現在：{LOAN_REQUEST_STATUS_LABELS[loanRequest.status]}
      </Text>

      {showActions ? (
        <>
          <View className="mt-4 flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              className="flex-1 items-center rounded-xl bg-slate-200 py-3"
              disabled
            >
              <Text className="text-sm font-bold text-slate-400">承認</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              className="flex-1 items-center rounded-xl bg-slate-200 py-3"
              disabled
            >
              <Text className="text-sm font-bold text-slate-400">却下</Text>
            </Pressable>
          </View>
          <Text className="mt-2 text-center text-[11px] text-slate-300">
            ※ ボタンの動作は今後実装予定です
          </Text>
        </>
      ) : null}
    </View>
  );
}
