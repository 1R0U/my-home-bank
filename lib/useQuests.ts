import { useCallback, useEffect, useRef, useState } from "react";
import { MOCK_QUESTS } from "../constants/mockData";
import { useCurrentUser } from "../store";
import type { Quest } from "../types";
import { fetchQuests } from "./taskService";

/**
 * クエスト一覧を取得するフック。
 * ログインしているときだけ Supabase の実データを取得する。
 *
 * 以前は開発用ロール指定（`start:parent` / `start:child`）中も一律モックデータにしていたが、
 * ゲストユーザーの導入（Issue #211）で実在するユーザーとして起動するようになったため、
 * その除外をやめた。
 *
 * ここでは他画面のような `isUuid` によるガード（#174）は要らない。
 * `fetchQuests` はクエスト全件を取る問い合わせで、ユーザーのIDを使わないため、
 * 非UUIDのモックIDでログインしていても失敗しない。
 */
export function useQuests() {
  const currentUser = useCurrentUser();
  const isLive = currentUser !== null;

  const [quests, setQuests] = useState<Quest[]>(isLive ? [] : MOCK_QUESTS);
  const [loading, setLoading] = useState(isLive);
  const [error, setError] = useState<string | null>(null);
  // 実行中の取得リクエストの世代を追跡し、途中でログアウトするなど
  // isLive が変わった後に古いレスポンスで状態を上書きしないようにする。
  const requestIdRef = useRef(0);

  const reload = useCallback(() => {
    const requestId = ++requestIdRef.current;

    if (!isLive) {
      setQuests(MOCK_QUESTS);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    fetchQuests()
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        setQuests(result);
      })
      .catch((e: unknown) => {
        // 画面には固定の文言しか出さないため、原因はここに残す。
        // 生のエラーメッセージを子供の画面に出したくないが、調べる手段は要る。
        console.warn("タスクの取得に失敗しました", e);
        if (requestIdRef.current !== requestId) return;
        setError(e instanceof Error ? e.message : "タスクの取得に失敗しました");
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setLoading(false);
      });
  }, [isLive]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { quests, loading, error, isLive, reload };
}
