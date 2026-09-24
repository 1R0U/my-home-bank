import { useCurrentUser, useDataAccess } from "../store";
import type { UserRole } from "../types";
import { getSubmitBlockReason } from "./submitGate";

/**
 * 申請・報告系のフォームで、送信してよいかを決めるフック（Issue #168）。
 *
 * 報告画面・商品追加の申請画面で同じ導出が複製されていたため1か所にまとめた。
 * 送れるのは、実データに書き込めて（#174）、ロールが `requiredRole` で、送信中でないときだけ。
 * @param requiredRole - この機能を使えるロール
 * @param isSubmitting - 送信中か
 * @returns ログイン中の利用者、送信できない理由、送信できるか
 */
export function useSubmitGate(requiredRole: UserRole, isSubmitting: boolean) {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const blockReason = getSubmitBlockReason(canUseRealData, currentUser?.role ?? null, requiredRole);

  return {
    blockReason,
    canSubmit: blockReason === null && !isSubmitting,
    currentUser,
  };
}
