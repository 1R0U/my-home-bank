import { useEffect } from "react";
import { AppState } from "react-native";
import { useActiveRole, useCurrentUser, useDataAccess } from "../store";
import { notifyAppOpenRecorded, recordAppOpen } from "./appOpenService";

/**
 * 大人がアプリを開いた日を記録するフック（大人の連続記録用。Issue #355）。
 *
 * ログインしたとき（起動時のセッション復元を含む）と、アプリが前面に戻るたびに記録を依頼する。
 * 同じ日の分はDBが1日分にまとめる。端末の日付でまとめると、端末の時計がDBより遅れているとき、
 * DBでは日付が変わっているのに呼ばずに終わり、その日の記録が抜けるため、ここではまとめない。
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

  useEffect(() => {
    if (!userId) return undefined;

    const record = () => {
      recordAppOpen()
        .then((isRecorded) => {
          // あらたに1日増えたときだけ、表示中の連続記録に取り直させる（同じ日の2回目は日数が変わらない）。
          // 書き込みが終わってから知らせるので、記録前の日数を取り直すことはない
          if (isRecorded) notifyAppOpenRecorded();
        })
        .catch((e: unknown) => {
          console.warn("アプリを開いた日を記録できませんでした", e);
        });
    };

    record();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") record();
    });
    return () => subscription.remove();
  }, [userId]);
}
