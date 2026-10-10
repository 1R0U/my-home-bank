import { MOCK_QUESTS } from "../constants/mockData";
import { useCurrentUser, useDataAccess } from "../store";
import type { Quest } from "../types";
import { fetchQuests } from "./taskService";
import { useResource } from "./useResource";

/**
 * クエスト一覧を取得するフック。
 * Supabase Authでログインしているときだけ実データを取得する。
 * 開発用ロール指定はAuthセッションを持たない画面プレビューなので、モックを使う。
 *
 * 同じ家族の一覧はホームとタスク画面で共有する（lib/useResource.ts）。
 */
export function useQuests() {
  const { isLoggedIn } = useDataAccess();
  const familyId = useCurrentUser()?.family_id;

  const { data, error, isLive, loading, reload } = useResource<Quest[]>({
    blockedReason: familyId ? null : "所属する家族が設定されていません",
    errorMessage: "タスクの取得に失敗しました",
    fetcher: () => fetchQuests(familyId),
    initialData: [],
    key: isLoggedIn ? ["quests", familyId ?? null] : null,
    preview: MOCK_QUESTS,
  });

  return { quests: data, loading, error, isLive, reload };
}
