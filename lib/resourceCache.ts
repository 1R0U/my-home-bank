// node --test から直接読み込まれるため、拡張子まで指定する。
import { getDataVersion } from "./dataFreshness.ts";

/**
 * サーバーから取得したデータを、キーごとに1か所で持つキャッシュ（Issue #399）。
 *
 * 以前は取得フック（`useQuests` / `useBankAccount` など）がそれぞれ自分の state を持ち、
 * 次の処理を毎回手書きしていた。手書きのため、フックごとに少しずつずれていた
 * （マウント時に2回取得する、フォーカス時に取り直さない、など）。
 *
 * - 古い応答で新しい結果を上書きしない（以前の `staleGuard`）
 * - 利用者が変わったら前の人のデータを見せない（以前の `loadedForRef`）
 * - フォーカスのたびの再取得を、直近に取ったばかりなら省く（以前の `useRefetchOnFocus`）
 *
 * ここではこれらを**キー単位で**まとめて引き受ける。キーには利用者や家族のIDを含めるので、
 * 利用者が変われば別のキーになり、前の人のデータは自然に見えなくなる。
 * 同じキーを使う画面どうしはデータを共有するため、ホーム ⇄ タスクのようにタブを
 * 行き来しても、同じ一覧を画面ごとに取り直さない。
 *
 * React に依存しない（`node --test` で単体テストできるようにするため）。
 * 画面からは `useResource`（lib/useResource.ts）経由で使う。
 */

/** キャッシュ1件の状態。変更のたびに新しいオブジェクトへ置き換える（useSyncExternalStore 用）。 */
export type ResourceEntry<T = unknown> = {
  /** 一度でも取得に成功したか。`data` が null の場合（口座なしなど）と区別するため別に持つ */
  hasData: boolean;
  data: T | undefined;
  /** 直近の取得が失敗したときの表示用の文言。成功するか、取得を始め直すと null に戻る */
  error: string | null;
  /** 取得中か */
  fetching: boolean;
  /** 直近の取得を始めた時刻と書き込み番号。鮮度の判定に使う */
  startedAt: number;
  startedVersion: number;
  /** 直近に成功した取得を始めた時刻と書き込み番号。成功していなければ null */
  fetchedAt: number | null;
  fetchedVersion: number | null;
  /** 直近に始めた取得の番号。これと一致する応答だけを反映する */
  requestId: number;
};

/**
 * 直近の取得からこの時間内のフォーカスでは、再取得を省く（Issue #243）。
 *
 * この端末で書き込みがあれば時間内でも取り直すので（`lib/dataFreshness.ts`）、
 * 遅れて見えるのは他の端末での変化（子供の報告・購入など）だけで、最大この時間になる。
 */
export const RESOURCE_FRESH_MS = 30_000;

const entries = new Map<string, ResourceEntry>();
const listeners = new Map<string, Set<() => void>>();
let nextRequestId = 0;
/** `clearResourceCache` のたびに増える。消す前に始まった取得の応答を捨てるために使う */
let generation = 0;

/**
 * キーを文字列にする。
 * @param key - 取得するものの名前と、それを決める値（利用者IDなど）の並び
 */
export function serializeResourceKey(key: readonly unknown[]): string {
  return JSON.stringify(key);
}

/** キーの現在の状態を返す。まだ一度も取得していなければ undefined。 */
export function getResourceEntry<T>(key: string): ResourceEntry<T> | undefined {
  return entries.get(key) as ResourceEntry<T> | undefined;
}

/**
 * キーの状態が変わったときに呼ばれる関数を登録する。
 * @returns 登録を外す関数
 */
export function subscribeResource(key: string, listener: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

function writeEntry(key: string, entry: ResourceEntry): void {
  entries.set(key, entry);
  listeners.get(key)?.forEach((listener) => listener());
}

function emptyEntry(): ResourceEntry {
  return {
    data: undefined,
    error: null,
    fetchedAt: null,
    fetchedVersion: null,
    fetching: false,
    hasData: false,
    requestId: 0,
    startedAt: 0,
    startedVersion: 0,
  };
}

/**
 * 取得を始める。同じキーで取得中のものがあっても、新しく始めた方の結果だけを反映する。
 *
 * 失敗したときは前回のデータを残したまま `error` を立てる（一覧が消えないように。Issue #212）。
 * 失敗の原因は画面に出さず（子供の画面に生のエラーを出さないため）、`console.warn` に残す。
 *
 * @param key - `serializeResourceKey` で作ったキー
 * @param fetcher - 実際に取得する処理
 * @param errorMessage - 失敗したときに画面へ出す文言
 * @param now - 現在時刻（テスト用）
 */
export function fetchResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  errorMessage: string,
  now: number = Date.now(),
): Promise<void> {
  nextRequestId += 1;
  const requestId = nextRequestId;
  const startedGeneration = generation;
  // 書き込み番号は取得を始める前に控える。取得中に書き込みがあれば、次のフォーカスで取り直す。
  const startedVersion = getDataVersion();
  const previous = entries.get(key) ?? emptyEntry();
  writeEntry(key, { ...previous, error: null, fetching: true, requestId, startedAt: now, startedVersion });

  const isCurrent = () => generation === startedGeneration && entries.get(key)?.requestId === requestId;

  let request: Promise<T>;
  try {
    request = fetcher();
  } catch (e) {
    request = Promise.reject(e);
  }

  return request.then(
    (data) => {
      if (!isCurrent()) return;
      writeEntry(key, {
        ...entries.get(key),
        data,
        error: null,
        fetchedAt: now,
        fetchedVersion: startedVersion,
        fetching: false,
        hasData: true,
      });
    },
    (e: unknown) => {
      console.warn(errorMessage, e);
      if (!isCurrent()) return;
      writeEntry(key, { ...entries.get(key), error: errorMessage, fetching: false });
    },
  );
}

/**
 * 取り直さなくてよいほど新しいかを判定する。
 *
 * 次のどちらかなら新しい。
 * - いまの書き込み番号で `maxAgeMs` 以内に始めた取得が、まだ終わっていない（同じ取得を重ねて始めない。
 *   通信が止まったままの取得に待たされ続けないよう、古いものは始め直す）
 * - 前回の取得が成功しており、その後この端末から書き込みがなく、`maxAgeMs` 以内である
 *
 * 失敗したままのものは新しいとみなさない（フォーカスのたびに取り直す）。
 */
export function isResourceFresh(
  entry: ResourceEntry | undefined,
  now: number,
  version: number,
  maxAgeMs: number = RESOURCE_FRESH_MS,
): boolean {
  if (!entry) return false;
  if (entry.fetching) return entry.startedVersion === version && now - entry.startedAt < maxAgeMs;
  if (entry.error !== null || entry.fetchedAt === null) return false;
  return entry.fetchedVersion === version && now - entry.fetchedAt < maxAgeMs;
}

/**
 * 新しくなければ取得する。画面のフォーカス時に使う。
 * @returns 取得したときはその Promise。省いたときは undefined
 */
export function ensureResourceFresh<T>(
  key: string,
  fetcher: () => Promise<T>,
  errorMessage: string,
  now: number = Date.now(),
): Promise<void> | undefined {
  if (isResourceFresh(entries.get(key), now, getDataVersion())) return undefined;
  return fetchResource(key, fetcher, errorMessage, now);
}

/**
 * 取得済みのデータを、取り直さずに書き換える（既読にした直後の表示など、応答を待たずに見せたい場合）。
 * まだ一度も取得していないキーには何もしない。
 */
export function updateResourceData<T>(key: string, updater: (data: T) => T): void {
  const entry = entries.get(key) as ResourceEntry<T> | undefined;
  if (!entry || !entry.hasData) return;
  writeEntry(key, { ...entry, data: updater(entry.data as T) });
}

/**
 * キャッシュをすべて消す。ログアウトしたときと、テストの後始末に使う。
 * 消す前に始まった取得の応答は捨てる。
 */
export function clearResourceCache(): void {
  generation += 1;
  const keys = [...entries.keys()];
  entries.clear();
  keys.forEach((key) => listeners.get(key)?.forEach((listener) => listener()));
}
