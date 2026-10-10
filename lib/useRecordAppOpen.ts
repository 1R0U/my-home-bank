import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useActiveRole, useCurrentUser, useDataAccess } from "../store";
import { recordAppOpen, toJstDateKey } from "./appOpenService";

/**
 * 大人がアプリを開いた日を記録するフック（大人の連続記録用。Issue #355）。
 *
 * ログインしたとき（起動時のセッション復元を含む）と、アプリが前面に戻ったときに記録する。
 * 同じ利用者・同じ日（日本時間）では1回しか呼ばない。DBも同じ日を1日分にまとめるので、
 * ここでまとめるのは問い合わせを減らすためだけ。
 *
 * **大人だけが対象。** 子供の記録はタスクの承認で数えるので記録しない。
 * モックアカウント（`canUseRealData` が false）でも記録しない。
 * 記録に失敗しても画面には何も出さない（次に前面へ戻ったときにもう一度試す）。
 */
export function useRecordAppOpen(): void {
  const currentUser = useCurrentUser();
  const role = useActiveRole();
  const { canUseRealData } = useDataAccess();
  const userId = canUseRealData && role === "parent" ? currentUser?.id : undefined;

  // 最後に記録できた「利用者:日付」
  const recordedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return undefined;

    const record = () => {
      const key = `${userId}:${toJstDateKey(new Date())}`;
      if (recordedRef.current === key) return;
      recordedRef.current = key;
      recordAppOpen().catch((e: unknown) => {
        console.warn("アプリを開いた日を記録できませんでした", e);
        // 次に前面へ戻ったときに、もう一度試す
        if (recordedRef.current === key) recordedRef.current = null;
      });
    };

    record();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") record();
    });
    return () => subscription.remove();
  }, [userId]);
}
