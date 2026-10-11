import { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { formatGol } from "../../lib/amount";
import { getAmountInputError, getAmountInputLimit, MAX_BANK_OPERATION_AMOUNT, parseAmountInput } from "../../lib/bankUtils";
import { ERROR_TEXT_CLASS, NOTICE_TEXT_CLASS, PLACEHOLDER_TEXT_COLOR, PREVIEW_DISABLED_NOTICE } from "../../constants/ui";

export type BankOperation = "deposit" | "withdraw";

const OPERATION_LABELS: Record<BankOperation, string> = {
  deposit: "預入",
  withdraw: "引き出し",
};

type BankAmountModalProps = {
  operation: BankOperation | null;
  isLive: boolean;
  isSubmitting: boolean;
  errorMessage: string | null;
  walletBalance: number;
  depositBalance: number;
  /** 未確認操作の再送では、金額を変更させない。 */
  fixedAmount?: number;
  /** amount が有効かどうかの追加チェック（残高不足などを外側で判定して渡す） */
  canSubmit: (amount: number) => boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
};

/** 手動預金の金額入力と確定を表示し、確認待ちの再送時は保存済み金額を固定する。 */
export default function BankAmountModal({
  operation,
  isLive,
  isSubmitting,
  errorMessage,
  walletBalance,
  depositBalance,
  fixedAmount,
  canSubmit,
  onClose,
  onConfirm,
}: BankAmountModalProps) {
  const [inputText, setInputText] = useState("");

  useEffect(() => {
    setInputText("");
  }, [operation]);

  if (!operation) return null;

  const parsedAmount = fixedAmount ?? parseAmountInput(inputText);
  const maximum = getAmountInputLimit(operation === "deposit" ? walletBalance : depositBalance, MAX_BANK_OPERATION_AMOUNT);
  const exceedsLimit = fixedAmount === undefined && parsedAmount !== null && parsedAmount > MAX_BANK_OPERATION_AMOUNT;
  const inputError = fixedAmount !== undefined ? null : exceedsLimit
    ? `1回の金額は${formatGol(MAX_BANK_OPERATION_AMOUNT)}以下にしてください。`
    : getAmountInputError(inputText, maximum, operation === "deposit"
      ? "所持金を超える金額は預け入れできません。"
      : "預金残高を超える金額は引き出せません。");
  const enabled = !isSubmitting && !inputError && parsedAmount !== null && canSubmit(parsedAmount);

  /** 送信中に閉じて確定結果を見失わないよう、操作中は閉じる要求を無視する。 */
  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  /** 入力と追加検証を通った金額だけ、親画面の確定処理へ渡す。 */
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

          <Text className="mb-1 text-sm text-slate-600">現在の所持金 {formatGol(walletBalance)}</Text>
          <Text className="mb-1 text-sm text-slate-600">預金残高 {formatGol(depositBalance)}</Text>
          <Text accessibilityLabel="入力可能な最大金額" className="mb-4 text-sm font-semibold text-slate-700">
            入力可能な最大金額 {formatGol(maximum)}
          </Text>

          <Text className="mb-1 text-xs font-semibold text-slate-400">金額</Text>
          <TextInput
            accessibilityLabel="金額"
            autoFocus
            className="rounded-xl bg-slate-50 px-4 py-3 text-base text-slate-900"
            editable={!isSubmitting && fixedAmount === undefined}
            keyboardType="number-pad"
            onChangeText={setInputText}
            placeholder="0"
            placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
            value={fixedAmount === undefined ? inputText : String(fixedAmount)}
          />
          {parsedAmount !== null ? (
            <Text className="mt-2 text-xs text-slate-400">{formatGol(parsedAmount)}</Text>
          ) : null}
          {fixedAmount === undefined ? (
            <Pressable accessibilityRole="button" accessibilityLabel="最大額を入力"
              accessibilityState={{ disabled: isSubmitting || maximum === 0 || !isLive }}
              disabled={isSubmitting || maximum === 0 || !isLive}
              className="mt-2 py-2" onPress={() => setInputText(String(maximum))}>
              <Text className="text-sm font-semibold text-blue-700">最大額を入力</Text>
            </Pressable>
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

          {inputError ? (
            <Text accessibilityRole="alert" className={`mt-2 text-center text-xs ${ERROR_TEXT_CLASS}`}>{inputError}</Text>
          ) : errorMessage ? (
            <Text className={`mt-2 text-center text-xs ${ERROR_TEXT_CLASS}`}>{errorMessage}</Text>
          ) : !isLive ? (
            <Text className={`mt-2 text-center text-xs ${NOTICE_TEXT_CLASS}`}>
              {PREVIEW_DISABLED_NOTICE}
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
