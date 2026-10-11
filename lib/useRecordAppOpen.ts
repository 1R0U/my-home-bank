import { useEffect } from "react";
import { AppState } from "react-native";
import { useActiveRole, useCurrentUser, useDataAccess } from "../store";
import { MIDNIGHT_MARGIN_MS, msUntilNextJstMidnight, notifyAppOpenRecorded, recordAppOpen } from "./appOpenService";

/**
 * 大人がアプリを開いた日を記録するフック（大人の連続記録用。Issue #355）。
 *
 * 次のときに記録を依頼する。
 * - ログインしたとき（起動時のセッション復元を含む）
 * - 一度裏へ回って（background）から前面に戻ったとき。iOS でコントロールセンターや通知センターを
 *   下ろして戻っただけ（inactive → active）では呼ばない（そのたびに記録と掲示板の取り直しが走らないように）
 * - 前面に出したまま日本時間の 0:00 をまたいだとき（タイマーで呼び直す。呼ばないと、裏へ回さない限り
 *   新しい日の分が残らない）
 *
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
        .then(() => {
          // 記録できたら、表示中の連続記録に取り直させる。書き込みが終わってから知らせるので、
          // 記録前の日数を取り直すことはない。すでに記録済み（false）でも知らせる。
          // 別の端末で今日の分が先に記録されていると false になるが、この端末の表示は前日のままなため
          notifyAppOpenRecorded();
        })
        .catch((e: unknown) => {
          console.warn("アプリを開いた日を記録できませんでした", e);
        });
    };

    // 前面にいる間、次の日本時間 0:00 を過ぎたら記録し直すタイマー
    let midnightTimer: ReturnType<typeof setTimeout> | null = null;
    const clearMidnightTimer = () => {
      if (midnightTimer !== null) clearTimeout(midnightTimer);
      midnightTimer = null;
    };
    const scheduleMidnightRecord = () => {
      clearMidnightTimer();
      midnightTimer = setTimeout(() => {
        record();
        scheduleMidnightRecord();
      }, msUntilNextJstMidnight(Date.now()) + MIDNIGHT_MARGIN_MS);
    };

    record();
    scheduleMidnightRecord();

    // 裏へ回ったか。iOS は裏から戻るときに inactive を挟むことがあるので、直前の状態ではなく
    // 「戻るまでの間に一度でも裏へ回ったか」で見る
    let wentBackground = false;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        wentBackground = true;
        clearMidnightTimer();
      } else if (state === "active") {
        if (wentBackground) record();
        wentBackground = false;
        scheduleMidnightRecord();
      }
    });
    return () => {
      subscription.remove();
      clearMidnightTimer();
    };
  }, [userId]);
}
