import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  ensureResourceFresh,
  fetchResource,
  getResourceEntry,
  serializeResourceKey,
  subscribeResource,
  updateResourceData,
} from "./resourceCache";

/**
 * サーバーのデータを取得して画面に出すための共通フック（Issue #399）。
 *
 * **データを取得するフックは、すべてこれを使って書く。** `useState` + `createStaleGuard` +
 * `useRefetchOnFocus` を手書きしない（AGENTS.md「データの取得」）。手書きすると、古い応答の
 * 無視・利用者切り替え時のクリア・フォーカス時の再取得のどれかが抜けやすく、実際に
 * フックごとにずれていた。
 *
 * - データは `lib/resourceCache.ts` にキーごとに持つ。同じキーを使う画面どうしは共有する
 * - 画面がフォーカスされたとき、直近に取ったばかりでなければ取り直す
 * - `reload()` は鮮度にかかわらず必ず取り直す（書き込みの後など）
 */
export type ResourceSpec<T> = {
  /**
   * 取得するものの名前と、それを決める値（利用者IDや家族IDなど）。
   * **取得結果を変えうる値は全部入れる。** 入れ忘れると、別の利用者のデータを共有してしまう。
   *
   * null のときは実データを使わない（プレビュー・モックアカウント・未ログイン）。
   * 取得はせず、`preview` を返す。
   */
  key: readonly unknown[] | null;
  /** 実際に取得する処理。`key` に入れた値だけを使うこと */
  fetcher: () => Promise<T>;
  /** 取得が終わる前（まだ一度も取れていないとき）に返す値。一覧なら空配列など */
  initialData: T;
  /** 実データを使わないとき（`key` が null）に返す値。モックの一覧など。省略時は `initialData` */
  preview?: T;
  /**
   * 取得できない理由（家族に未所属など）。指定すると取得せず、これをエラーとして返す。
   * `key` が null のときは使われない。
   */
  blockedReason?: string | null;
  /** 取得に失敗したときに画面へ出す文言。生のエラーは出さない（`console.warn` に残る） */
  errorMessage: string;
};

export type ResourceState<T> = {
  data: T;
  /** 取得中か。まだ一度も取得していないときも true */
  loading: boolean;
  /** 直近の取得が失敗したときの文言。失敗しても `data` は前回の値を残す */
  error: string | null;
  /** 実データを使っているか（`key` が null でないか） */
  isLive: boolean;
  /** 一度でも取得に成功したか */
  hasData: boolean;
  /** 必ず取り直す。完了を待ちたい呼び出し元のために Promise を返す */
  reload: () => Promise<void>;
  /** 取得済みのデータを、取り直さずに書き換える（応答を待たずに見せたい操作向け） */
  updateData: (updater: (data: T) => T) => void;
};

const noopSubscribe = () => () => {};
const getNothing = () => undefined;

export function useResource<T>(spec: ResourceSpec<T>): ResourceState<T> {
  const key = spec.key === null ? null : serializeResourceKey(spec.key);
  const blockedReason = key === null ? null : (spec.blockedReason ?? null);
  const activeKey = key !== null && blockedReason === null ? key : null;

  // fetcher や文言は毎レンダーで作り直されてよい。キーが同じなら同じ取得として扱う。
  const specRef = useRef(spec);
  specRef.current = spec;

  const subscribe = useCallback(
    (listener: () => void) => (activeKey === null ? () => {} : subscribeResource(activeKey, listener)),
    [activeKey],
  );
  const getSnapshot = useCallback(
    () => (activeKey === null ? undefined : getResourceEntry<T>(activeKey)),
    [activeKey],
  );
  const entry = useSyncExternalStore(
    activeKey === null ? noopSubscribe : subscribe,
    activeKey === null ? getNothing : getSnapshot,
    activeKey === null ? getNothing : getSnapshot,
  );

  const reload = useCallback((): Promise<void> => {
    if (activeKey === null) return Promise.resolve();
    return fetchResource(activeKey, () => specRef.current.fetcher(), specRef.current.errorMessage);
  }, [activeKey]);

  const updateData = useCallback(
    (updater: (data: T) => T) => {
      if (activeKey !== null) updateResourceData(activeKey, updater);
    },
    [activeKey],
  );

  // 画面へ戻るたびに、古ければ取り直す。タブの裏で生存し続ける画面（大人用画面）でも、
  // 他のタブでの操作の結果が反映されるようにするため（Issue #204 / #243）。
  // タブを持たない画面では、マウント時の1回だけ実行される。
  useFocusEffect(
    useCallback(() => {
      if (activeKey === null) return;
      void ensureResourceFresh(activeKey, () => specRef.current.fetcher(), specRef.current.errorMessage);
    }, [activeKey]),
  );

  // 表示中にキャッシュが消された（ログアウトなど）ときは、フォーカスを待たずに取り直す。
  // 取得中・取得済みなら ensureResourceFresh が何もしないので、マウント直後に重ねて取ることはない。
  const isMissing = activeKey !== null && entry === undefined;
  useEffect(() => {
    if (activeKey === null || !isMissing) return;
    void ensureResourceFresh(activeKey, () => specRef.current.fetcher(), specRef.current.errorMessage);
  }, [activeKey, isMissing]);

  if (key === null) {
    const preview = "preview" in spec ? spec.preview : spec.initialData;
    return { data: preview, error: null, hasData: false, isLive: false, loading: false, reload, updateData };
  }
  if (blockedReason !== null) {
    return { data: spec.initialData, error: blockedReason, hasData: false, isLive: true, loading: false, reload, updateData };
  }
  return {
    data: entry?.hasData ? (entry.data as T) : spec.initialData,
    error: entry?.error ?? null,
    hasData: entry?.hasData ?? false,
    isLive: true,
    loading: entry === undefined || entry.fetching,
    reload,
    updateData,
  };
}
