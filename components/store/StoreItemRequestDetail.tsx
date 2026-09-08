import { useState } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import { parseAmountInput } from "../../lib/bankUtils";
import { approveStoreItemRequest, rejectStoreItemRequest } from "../../lib/storeItemRequestService";
import type { StoreItemRequest } from "../../types";

type StoreItemRequestDetailProps = {
  request: StoreItemRequest;
  requesterName: string;
  onClose: () => void;
  approverId: string;
  isLive: boolean;
  onActionComplete: () => void;
};

export default function StoreItemRequestDetail({
  request,
  requesterName,
  onClose,
  approverId,
  isLive,
  onActionComplete,
}: StoreItemRequestDetailProps) {
  const [price, setPrice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsedPrice = parseAmountInput(price);
  const canApprove = isLive && !isSubmitting && parsedPrice !== null;
  const canReject = isLive && !isSubmitting;

  const handleApprove = async () => {
    if (!canApprove || parsedPrice === null) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await approveStoreItemRequest(request.id, approverId, parsedPrice);
      onActionComplete();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "承認に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!canReject) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await rejectStoreItemRequest(request.id, approverId);
      onActionComplete();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "拒否に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="mt-4 rounded-2xl bg-white p-5">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-xs font-semibold text-slate-400">申請者</Text>
          <Text className="mt-1 text-lg font-bold text-slate-900">{requesterName}</Text>
        </View>
        <Pressable
          accessibilityLabel="申請詳細を閉じる"
          accessibilityRole="button"
          className="h-8 w-8 items-center justify-center rounded-full active:bg-slate-100"
          hitSlop={8}
          onPress={onClose}
        >
          <Text className="text-lg font-bold text-slate-400">×</Text>
        </Pressable>
      </View>

      {request.image_url ? (
        <Image
          accessibilityIgnoresInvertColors
          className="mt-3 h-40 w-full rounded-xl bg-slate-100"
          resizeMode="cover"
          source={{ uri: request.image_url }}
        />
      ) : null}

      <Text className="mt-4 text-xs font-semibold text-slate-400">商品名</Text>
      <Text className="mt-1 text-base font-bold text-slate-900">{request.title}</Text>

      <Text className="mt-4 text-xs font-semibold text-slate-400">商品の詳細</Text>
      <Text className="mt-1 text-sm leading-5 text-slate-600">{request.description}</Text>

      <Text className="mt-4 text-xs font-semibold text-slate-400">欲しい理由</Text>
      <Text className="mt-1 text-sm leading-5 text-slate-600">{request.reason}</Text>

      <Text className="mt-4 text-xs font-semibold text-slate-400">ポイント数（許可時に設定）</Text>
      <TextInput
        accessibilityLabel="ポイント数"
        className="mt-1 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-900"
        keyboardType="number-pad"
        onChangeText={setPrice}
        placeholder="必要ポイントを入力"
        placeholderTextColor="#94a3b8"
        value={price}
      />

      <View className="mt-4 flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canApprove }}
          className={`flex-1 items-center rounded-xl py-3 ${
            canApprove ? "bg-emerald-500 active:bg-emerald-600" : "bg-slate-200"
          }`}
          disabled={!canApprove}
          onPress={handleApprove}
        >
          <Text className={`text-sm font-bold ${canApprove ? "text-white" : "text-slate-400"}`}>許可</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canReject }}
          className={`flex-1 items-center rounded-xl py-3 ${
            canReject ? "bg-rose-500 active:bg-rose-600" : "bg-slate-200"
          }`}
          disabled={!canReject}
          onPress={handleReject}
        >
          <Text className={`text-sm font-bold ${canReject ? "text-white" : "text-slate-400"}`}>拒否</Text>
        </Pressable>
      </View>

      {errorMessage ? (
        <Text className="mt-2 text-center text-[11px] text-rose-500">{errorMessage}</Text>
      ) : !isLive ? (
        <Text className="mt-2 text-center text-[11px] text-slate-300">
          ※ プレビュー中はボタンを操作できません
        </Text>
      ) : null}
    </View>
  );
}
