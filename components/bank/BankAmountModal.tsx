import { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { formatYen } from "../../lib/bank";
import { parseAmountInput } from "../../lib/bankUtils";

export type BankOperation = "deposit" | "withdraw" | "borrow" | "repay";

const OPERATION_LABELS: Record<BankOperation, string> = {
  deposit: "預入",
  withdraw: "引き出し",
  borrow: "借り入れ",
  repay: "返済",
};

type BankAmountModalProps = {
  operation: BankOperation | null;
  isLive: boolean;
  isSubmitting: boolean;
  errorMessage: string | null;
  /** amount が有効かどうかの追加チェック（残高不足などを外側で判定して渡す） */
  canSubmit: (amount: number) => boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
};

export default function BankAmountModal({
  operation,
  isLive,
  isSubmitting,
  errorMessage,
  canSubmit,
  onClose,
  onConfirm,
}: BankAmountModalProps) {
  const [inputText, setInputText] = useState("");

  useEffect(() => {
    setInputText("");
  }, [operation]);

  if (!operation) return null;

  const parsedAmount = parseAmountInput(inputText);
  const enabled = !isSubmitting && parsedAmount !== null && canSubmit(parsedAmount);

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleConfirm = () => {
    if (!enabled || parsedAmount === null) return;
    onConfirm(parsedAmount);
  };

  return (
    <Modal animationType="fade" onRequestClose={handleClose} transparent visible>
      <View className="flex-1 items-center justify-center bg-black/60 p-6">
        <View className="w-full rounded-3xl bg-white p-6">
          <Text className="mb-4 text-xl font-bold text-slate-900">
            {OPERATION_LABELS[operation]}
          </Text>

          <Text className="mb-1 text-xs font-semibold text-slate-400">金額</Text>
          <TextInput
            accessibilityLabel="金額"
            autoFocus
            className="rounded-xl bg-slate-50 px-4 py-3 text-base text-slate-900"
            editable={!isSubmitting}
            keyboardType="number-pad"
            onChangeText={setInputText}
            placeholder="0"
            placeholderTextColor="#94a3b8"
            value={inputText}
          />
          {parsedAmount !== null ? (
            <Text className="mt-2 text-xs text-slate-400">{formatYen(parsedAmount)}</Text>
          ) : null}

          <Pressable
            accessibilityLabel={`${OPERATION_LABELS[operation]}を確定`}
            accessibilityRole="button"
            accessibilityState={{ disabled: !enabled }}
            className={`mt-5 items-center rounded-xl py-3 ${enabled ? "bg-blue-600 active:bg-blue-700" : "bg-slate-200"}`}
            disabled={!enabled}
            onPress={handleConfirm}
          >
            <Text className={`text-sm font-bold ${enabled ? "text-white" : "text-slate-400"}`}>
              {OPERATION_LABELS[operation]}を確定
            </Text>
          </Pressable>

          {errorMessage ? (
            <Text className="mt-2 text-center text-xs text-rose-500">{errorMessage}</Text>
          ) : !isLive ? (
            <Text className="mt-2 text-center text-xs text-slate-300">
              ※ プレビュー中は操作できません
            </Text>
          ) : null}

          <Pressable
            accessibilityLabel="閉じる"
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting }}
            className="mt-3 items-center py-2"
            disabled={isSubmitting}
            onPress={handleClose}
          >
            <Text className="text-sm font-semibold text-slate-400">閉じる</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
