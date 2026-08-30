import { useCallback, useEffect, useState } from "react";
import { MOCK_QUESTS } from "../constants/mockData";
import { useCurrentUser } from "../store";
import type { Quest } from "../types";
import { DEV_ROLE_OVERRIDE } from "./devRole";
import { fetchQuests } from "./taskService";

/**
 * クエスト一覧を取得するフック。
 * 開発用ロールプレビュー中（DEV_ROLE_OVERRIDE）はモックデータのまま、
 * 実際にログインしているときだけ Supabase の実データを取得する
 * （Issue #60 の履歴画面と同じ方針）。
 */
export function useQuests() {
  const currentUser = useCurrentUser();
  const isLive = !DEV_ROLE_OVERRIDE && currentUser !== null;

  const [quests, setQuests] = useState<Quest[]>(isLive ? [] : MOCK_QUESTS);
  const [loading, setLoading] = useState(isLive);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!isLive) {
      setQuests(MOCK_QUESTS);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    fetchQuests()
      .then(setQuests)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "タスクの取得に失敗しました");
      })
      .finally(() => setLoading(false));
  }, [isLive]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { quests, loading, error, isLive, reload };
}
