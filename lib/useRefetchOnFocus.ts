import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { getDataVersion } from "./dataFreshness";

/** フォーカス時に走らせる処理の戻り値。後始末が要る場合だけ関数を返す。 */
type RefetchResult = void | (() => void) | Promise<unknown>;

/**
 * 直近の取得からこの時間内のフォーカスでは、再取得を省く（Issue #243）。
 *
 * この端末で書き込みがあれば時間内でも取り直すので（`lib/dataFreshness.ts`）、
 * 遅れて見えるのは他の端末での変化（子供の報告・購入など）だけで、最大この時間になる。
 * 今は Realtime の購読がなく、他の端末の変化はもともとタブを切り替えるまで見えないため、
 * 体感はほぼ変わらない。
 */
export const REFETCH_MIN_INTERVAL_MS = 30_000;

type Options = {
  /** 省く時間の長さ。テストや、特に鮮度が要る画面で変えるためのもの。 */
  minIntervalMs?: number;
};

type LastRun = {
  /** 実行した reload。識別子が変わったら（利用者や家族が変わったなど）必ず取り直す。 */
  reload: () => RefetchResult;
  /** 実行した時刻（ミリ秒）。 */
  at: number;
  /** 実行した時点の書き込み番号。 */
  version: number;
  /**
   * reload が後始末の関数を返したか。返した場合は、フォーカスが外れたときに
   * 取得を打ち切っている可能性があるので、時間内でも省かない。
   */
  hasCleanup: boolean;
};

/**
 * 画面がフォーカスされるたびに再取得を走らせる（Issue #204）。
 *
 * 大人用画面のタブ化（#173）で、画面はpushされるたびにマウントされるのではなく
 * タブの裏で生存し続けるようになった。そのため `useEffect` だけでは、他タブでの
 * 操作（クエスト承認・購入・ゴル発行など）による変化がフォーカス復帰時に反映されない。
 *
 * ただし、タブを行き来するたびに取り直すと問い合わせが増える（ホーム ⇄ タスクの
 * 1往復で9本）。そこで、次の3つがすべて当てはまるときだけ省く（Issue #243）。
 *
 * - 前回と同じ reload である（利用者などが変わっていない）
 * - 前回の実行から `REFETCH_MIN_INTERVAL_MS` 以内である
 * - その間に、この端末から書き込みをしていない
 *
 * 書き込みの有無は通信の層で数えているので、どの画面で何を操作しても、
 * その結果は次のフォーカスで必ず反映される（#172 / #204 で直した問題に戻らない）。
 *
 * タブを持たない画面では、従来どおりマウント時の1回だけ実行される。
 *
 * @param reload - フォーカス時に走らせる処理。**呼び出し側で `useCallback` に
 *   包むこと。** 毎レンダーで識別子が変わると、そのたびに再取得が走る。
 *   後始末が要る場合はクリーンアップ関数を返せる（`useFocusEffect` と同じ）。
 * @param options - 省く時間の長さなど
 */
export function useRefetchOnFocus(reload: () => RefetchResult, options: Options = {}) {
  const minIntervalMs = options.minIntervalMs ?? REFETCH_MIN_INTERVAL_MS;
  const lastRunRef = useRef<LastRun | null>(null);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const version = getDataVersion();
      const last = lastRunRef.current;
      const isFresh =
        last !== null &&
        !last.hasCleanup &&
        last.reload === reload &&
        last.version === version &&
        now - last.at < minIntervalMs;
      if (isFresh) return undefined;

      // 時刻と書き込み番号は実行前に控える。取得中に書き込みがあれば、次のフォーカスで取り直す。
      const result = reload();
      lastRunRef.current = { at: now, hasCleanup: typeof result === "function", reload, version };

      // async な reload は Promise を返す。そのまま `useFocusEffect` へ返すと
      // 後始末の関数として扱われてしまうため、関数のときだけ通す。
      return typeof result === "function" ? result : undefined;
    }, [reload, minIntervalMs]),
  );
}
