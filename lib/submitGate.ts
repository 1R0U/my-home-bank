import type { UserRole } from "../types/index.ts";
import { PREVIEW_DISABLED_NOTICE } from "../constants/ui.ts";

/**
 * 申請・報告系のフォームで、送信できない理由（Issue #168）。
 *
 * - `preview` … モックアカウントなどで実データに書き込めない（#174）
 * - `wrong_role` … その機能を使えるロールではない
 */
export type SubmitBlockReason = "preview" | "wrong_role";

/** ロールごとの呼び方。「〇〇用アカウントのみ」の文言に使う。 */
const ROLE_ACCOUNT_LABELS: Record<UserRole, string> = {
  child: "子供用",
  parent: "大人用",
};

/**
 * 送信できない理由を決める。どちらにも当たらなければ null（送信できる）。
 *
 * 両方に当たるときは `preview` を優先する。プレビュー中はロールを変えても送れないので、
 * 先にそちらを伝える（統合前の2画面と同じ順番）。
 * @param canUseRealData - 実データに書き込めるか（`useDataAccess` の値）
 * @param role - ログイン中の利用者のロール。未ログインなら null
 * @param requiredRole - この機能を使えるロール
 * @returns 送信できない理由、または null
 */
export function getSubmitBlockReason(
  canUseRealData: boolean,
  role: UserRole | null,
  requiredRole: UserRole,
): SubmitBlockReason | null {
  if (!canUseRealData) return "preview";
  if (role !== requiredRole) return "wrong_role";
  return null;
}

/**
 * 送信ボタンの下に出す注記を決める。出すものが無ければ null。
 *
 * 送信時のエラーがあればそれを最優先で出す。次に送信できない理由を出す。
 * @param errorMessage - 送信・検証で出たエラー
 * @param blockReason - 送信できない理由
 * @param featureName - 機能の名前（例: 「お手伝いの報告」）。ロール違いの文言に使う
 * @param requiredRole - この機能を使えるロール
 * @returns 表示する注記と、エラーかどうか。出すものが無ければ null
 */
export function getSubmitNotice(
  errorMessage: string | null,
  blockReason: SubmitBlockReason | null,
  featureName: string,
  requiredRole: UserRole,
): { isError: boolean; text: string } | null {
  if (errorMessage) return { isError: true, text: errorMessage };
  if (blockReason === "preview") return { isError: false, text: PREVIEW_DISABLED_NOTICE };
  if (blockReason === "wrong_role") {
    return {
      isError: false,
      text: `※ ${featureName}は${ROLE_ACCOUNT_LABELS[requiredRole]}アカウントのみ利用できます`,
    };
  }
  return null;
}
