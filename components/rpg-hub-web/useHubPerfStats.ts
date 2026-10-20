import { useCallback, useRef, type RefObject } from "react";
import { createSetPerfStatsIntent } from "../../lib/rpg-hub/bridge";
import type { PerfStats } from "../../lib/rpg-hub/perfStats";
import type { RpgHubWebHandle } from "./RpgHubWebView";

/**
 * 計測値の受け渡し口。画面（RpgHubScreen）は書き込むだけで状態を持たず、
 * 表示（HubPerfOverlay）が購読して自分の中だけで描き直す。
 * 画面が状態を持つと、2秒ごとに届くたびにハブ画面全体が描き直され、
 * その負荷で計測そのものが FPS を下げてしまうため（PR #455 のレビュー）。
 */
export type HubPerfFeed = {
  /** 画面を開いてからシーンの準備ができるまで（ms）。ready がまだなら null */
  readonly startupMs: number | null;
  /** 最後に届いた計測値。ready のたびに null へ戻す（作り直したシーンの値を待つ） */
  readonly stats: PerfStats | null;
  /** 値が変わったら呼ばれる。戻り値で購読をやめる */
  subscribe: (listener: () => void) => () => void;
};

type MutableHubPerfFeed = {
  -readonly [K in keyof HubPerfFeed]: HubPerfFeed[K];
};

/**
 * 我が家タウンの描画負荷を、開発ビルドのときだけ計測する（Issue #200）。
 *
 * - 起動時間: この画面を開いて（フックが最初に動いて）から、シーンの ready が届くまで。
 *   作り直し（再読み込み）のあとの ready は数えない（初回の起動時間を残したいため）
 * - FPS・フレーム時間・ドローコール数・メッシュ数・JSヒープ: シーンが2秒ごとに送る
 *
 * 計測値はログ（`[rpg-hub perf]`）にも出す。実機で測った値を設計書8節へ書き写すためのもの。
 * このフックは React の状態を持たない（値が届いても呼び出し側の画面は描き直さない）。
 * @param webViewRef - シーンへ意図を送るための参照
 * @param enabled - 計測するか（呼び出し側は `__DEV__` を渡す。本番ビルドでは計測しない）
 * @returns ready・計測値を受け取る関数と、表示に渡す受け渡し口（計測しないときは null）
 */
export function useHubPerfStats(
  webViewRef: RefObject<RpgHubWebHandle>,
  enabled: boolean,
): {
  feed: HubPerfFeed | null;
  handleReady: () => void;
  handleStats: (stats: PerfStats) => void;
} {
  const mountedAtRef = useRef(Date.now());
  const feedRef = useRef<MutableHubPerfFeed | null>(null);
  const listenersRef = useRef(new Set<() => void>());
  if (feedRef.current === null) {
    const listeners = listenersRef.current;
    feedRef.current = {
      startupMs: null,
      stats: null,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  }

  const notify = useCallback(() => {
    for (const listener of listenersRef.current) listener();
  }, []);

  const handleReady = useCallback(() => {
    if (!enabled) return;
    const feed = feedRef.current;
    if (feed.startupMs === null) {
      feed.startupMs = Date.now() - mountedAtRef.current;
      console.log(`[rpg-hub perf] 起動 ${feed.startupMs}ms`);
    }
    feed.stats = null;
    notify();
    // シーンを作り直したときも計測を続ける（シーン側は作り直すと止まった状態から始まる）
    webViewRef.current?.sendIntent(createSetPerfStatsIntent(true));
  }, [enabled, notify, webViewRef]);

  const handleStats = useCallback(
    (next: PerfStats) => {
      if (!enabled) return;
      feedRef.current.stats = next;
      notify();
      console.log("[rpg-hub perf]", JSON.stringify(next));
    },
    [enabled, notify],
  );

  return { feed: enabled ? feedRef.current : null, handleReady, handleStats };
}
