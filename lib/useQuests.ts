import { useCallback, useRef, useState } from "react";
import { MOCK_QUESTS } from "../constants/mockData";
import { useCurrentUser, useDataAccess } from "../store";
import type { Quest } from "../types";
import { createStaleGuard } from "./staleGuard";
import { fetchQuests } from "./taskService";
import { useRefetchOnFocus } from "./useRefetchOnFocus";

/**
 * クエスト一覧を取得するフック。
 * Supabase Authでログインしているときだけ実データを取得する。
 * 開発用ロール指定はAuthセッションを持たない画面プレビューなので、モックを使う。
 */
export function useQuests() {
  const { isLoggedIn: isLive } = useDataAccess();
  const familyId = useCurrentUser()?.family_id;

  const [quests, setQuests] = useState<Quest[]>(isLive ? [] : MOCK_QUESTS);
  const [loading, setLoading] = useState(isLive);
  const [error, setError] = useState<string | null>(null);
  // 途中でログアウトするなど isLive が変わった後に、古いレスポンスで状態を
  // 上書きしないようにする。**start() は必ず処理の入口で1回だけ呼ぶ**
  // （.then の中で呼ぶと isCurrent が常に true になる。#147 で踏んだ罠）。
  const guardRef = useRef(createStaleGuard());

  const reload = useCallback(() => {
    const requestId = guardRef.current.start();

    if (!isLive) {
      setQuests(MOCK_QUESTS);
      setLoading(false);
      setError(null);
      return;
    }

    if (!familyId) {
      setQuests([]);
      setLoading(false);
      setError("所属する家族が設定されていません");
      return;
    }

    setLoading(true);
    setError(null);
    fetchQuests(familyId)
      .then((result) => {
        if (!guardRef.current.isCurrent(requestId)) return;
        setQuests(result);
      })
      .catch((e: unknown) => {
        // 画面には固定の文言しか出さないため、原因はここに残す。
        // 生のエラーメッセージを子供の画面に出したくないが、調べる手段は要る。
        console.warn("タスクの取得に失敗しました", e);
        if (!guardRef.current.isCurrent(requestId)) return;
        setError(e instanceof Error ? e.message : "タスクの取得に失敗しました");
      })
      .finally(() => {
        if (!guardRef.current.isCurrent(requestId)) return;
        setLoading(false);
      });
  }, [familyId, isLive]);

  // 他タブでのクエスト承認等による変化を反映するため、フォーカスが戻るたびに再取得する。
  useRefetchOnFocus(reload);

  return { quests, loading, error, isLive, reload };
}
