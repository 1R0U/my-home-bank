import { Text } from "react-native";
import { getSubmitNotice, type SubmitBlockReason } from "../lib/submitGate";
import type { UserRole } from "../types";
import { ERROR_TEXT_CLASS, NOTICE_TEXT_CLASS } from "../constants/ui";

type SubmitGateNoticeProps = {
  /** 送信・検証で出たエラー。あればこちらを優先して出す */
  errorMessage: string | null;
  /** 機能の名前（例: 「お手伝いの報告」）。ロール違いの文言に使う */
  featureName: string;
  /** `useSubmitGate` の戻り値。送信できない理由と、使えるロールを読む */
  gate: { blockReason: SubmitBlockReason | null; requiredRole: UserRole };
};

/**
 * 申請・報告系のフォームで、送信ボタンの下に出す注記（Issue #168）。
 * エラー → プレビュー中 → ロール違い の順で、1つだけ出す。
 */
export default function SubmitGateNotice({ errorMessage, featureName, gate }: SubmitGateNoticeProps) {
  const notice = getSubmitNotice(errorMessage, gate.blockReason, featureName, gate.requiredRole);
  if (!notice) return null;

  return (
    <Text className={`mt-2 text-center text-xs ${notice.isError ? ERROR_TEXT_CLASS : NOTICE_TEXT_CLASS}`}>
      {notice.text}
    </Text>
  );
}
