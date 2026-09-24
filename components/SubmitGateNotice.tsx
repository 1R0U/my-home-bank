import { Text } from "react-native";
import { getSubmitNotice, type SubmitBlockReason } from "../lib/submitGate";
import type { UserRole } from "../types";

type SubmitGateNoticeProps = {
  /** 送信できない理由（`useSubmitGate` の値） */
  blockReason: SubmitBlockReason | null;
  /** 送信・検証で出たエラー。あればこちらを優先して出す */
  errorMessage: string | null;
  /** 機能の名前（例: 「お手伝いの報告」）。ロール違いの文言に使う */
  featureName: string;
  /** この機能を使えるロール */
  requiredRole: UserRole;
};

/**
 * 申請・報告系のフォームで、送信ボタンの下に出す注記（Issue #168）。
 * エラー → プレビュー中 → ロール違い の順で、1つだけ出す。
 */
export default function SubmitGateNotice({
  blockReason,
  errorMessage,
  featureName,
  requiredRole,
}: SubmitGateNoticeProps) {
  const notice = getSubmitNotice(errorMessage, blockReason, featureName, requiredRole);
  if (!notice) return null;

  return (
    <Text className={`mt-2 text-center text-xs ${notice.isError ? "text-rose-500" : "text-slate-300"}`}>
      {notice.text}
    </Text>
  );
}
