import { useRef, useState } from "react";
import { useCurrentUser, useDataAccess } from "../store";
import { classifySupabaseError, describeAppError, isBusinessRejection } from "./errors";
import { fetchSavingsSummary, type SavingsSummary } from "./savingsService";
import { useResource } from "./useResource";

type RunOptions = {
  /** 業務上の拒否（残高不足など）で確定的に失敗したとき。再送用の状態を捨てるのに使う */
  onRejected?: () => void;
};

/**
 * 自動積立預金の取得と、書き込み操作の実行をまとめたフック（Issue #440）。
 *
 * 大人用（`AdultSavingsScreen`）と子供用（`ChildSavingsScreen`）の両方で使い、
 * 取得・二重送信の防止・失敗時の文言・操作後の再取得を画面ごとに書かないようにする。
 * 利用者が変わったときの入力の破棄は、呼び出す画面の側で `key` に利用者IDを渡して行う。
 */
export function useSavings() {
  const user = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const submitting = useRef(false);
  const available = canUseRealData && !!user?.family_id;

  const { data: summary, loading, error, reload } = useResource<SavingsSummary | null>({
    errorMessage: "積立預金を取得できませんでした。再読み込みしてください。",
    fetcher: () => fetchSavingsSummary(),
    initialData: null,
    key: available ? ["savingsSummary", user.id, user.family_id] : null,
  });

  /** 書き込みを1つずつ実行し、結果の文言を出して取り直す。 */
  const run = async (action: () => Promise<void>, success: string, options: RunOptions = {}) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (cause) {
      const failure = classifySupabaseError(cause, "write");
      if (isBusinessRejection(failure) || failure.code === "CONSTRAINT_VIOLATION") {
        options.onRejected?.();
        setMessage(describeAppError(failure));
      } else {
        setMessage("処理結果を確認できませんでした。残高・履歴を確認してください。引き出しは同じ額で再試行しても二重実行されません。");
      }
    } finally {
      await reload();
      submitting.current = false;
      setBusy(false);
    }
  };

  return {
    user,
    available,
    summary,
    loading,
    error,
    reload,
    busy,
    message,
    run,
    /** 操作ボタンを押せない状態か（通信中・取得前・プレビュー） */
    disabled: busy || loading || !summary || !canUseRealData,
  };
}
