import { MOCK_QUESTS } from "../constants/mockData";
import { useEffect } from "react";
import { useCurrentUser, useDataAccess } from "../store";
import type { Quest } from "../types";
import { fetchQuests } from "./taskService";
import { useResource } from "./useResource";
import { questPeriodRefreshAt } from "./questPeriod";

const PERIOD_REFRESH_RETRY_MS = 60_000;

/**
 * クエスト一覧を取得するフック。
 * Supabase Authでログインしているときだけ実データを取得する。
 * 開発用ロール指定はAuthセッションを持たない画面プレビューなので、モックを使う。
 *
 * 同じ家族の一覧はホームとタスク画面で共有する（lib/useResource.ts）。
 */
export function useQuests() {
  const { isLoggedIn } = useDataAccess();
  const user = useCurrentUser();
  const familyId = user?.family_id;

  const { data, error, hasData, isLive, loading, reload } = useResource<Quest[]>({
    blockedReason: familyId ? null : "所属する家族が設定されていません",
    errorMessage: "タスクの取得に失敗しました",
    fetcher: () => fetchQuests(familyId),
    initialData: [],
    key: isLoggedIn ? ["quests", familyId ?? null] : null,
    preview: MOCK_QUESTS,
  });

  const nextPeriodEnd = questPeriodRefreshAt(data);
  useEffect(() => {
    if (!isLive || !Number.isFinite(nextPeriodEnd)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      // reloadは失敗しても前回のdataを残して完了する。終了日時が更新されるまでは再試行する。
      await reload();
      if (!cancelled) timer = setTimeout(refresh, PERIOD_REFRESH_RETRY_MS);
    };
    timer = setTimeout(refresh, Math.max(0, nextPeriodEnd - Date.now()));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isLive, nextPeriodEnd, reload]);

  // キャッシュは家庭全体で共有し、表示する段階で担当を絞る。別の子の実施を重ねて表示しない。
  const quests = user?.role === "child"
    ? data.filter((quest) => !quest.audience || quest.audience === "first" || quest.target_child_id === user.id)
    : data;
  return { quests, loading, hasData, error, isLive, reload };
}
