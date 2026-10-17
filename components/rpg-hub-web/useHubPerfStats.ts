import { useCallback, useRef, useState, type RefObject } from "react";
import { createSetPerfStatsIntent } from "../../lib/rpg-hub/bridge";
import { formatPerfStats, type PerfStats } from "../../lib/rpg-hub/perfStats";
import type { RpgHubWebHandle } from "./RpgHubWebView";

/**
 * 我が家タウンの描画負荷を、開発ビルドのときだけ計測して画面の隅に出す（Issue #200）。
 *
 * - 起動時間: この画面を開いて（フックが最初に動いて）から、シーンの ready が届くまで。
 *   作り直し（再読み込み）のあとの ready は数えない（初回の起動時間を残したいため）
 * - FPS・フレーム時間・ドローコール数・メッシュ数・JSヒープ: シーンが2秒ごとに送る
 *
 * 計測値はログ（`[rpg-hub perf]`）にも出す。実機で測った値を設計書8節へ書き写すためのもの。
 * @param webViewRef - シーンへ意図を送るための参照
 * @param enabled - 計測するか（呼び出し側は `__DEV__` を渡す。本番ビルドでは計測しない）
 * @returns ready・計測値を受け取る関数と、画面に出す行（計測しないときは null）
 */
export function useHubPerfStats(
  webViewRef: RefObject<RpgHubWebHandle>,
  enabled: boolean,
): {
  handleReady: () => void;
  handleStats: (stats: PerfStats) => void;
  lines: string[] | null;
} {
  const mountedAtRef = useRef(Date.now());
  const [startupMs, setStartupMs] = useState<number | null>(null);
  const [stats, setStats] = useState<PerfStats | null>(null);

  const handleReady = useCallback(() => {
    if (!enabled) return;
    setStartupMs((current) => {
      if (current !== null) return current;
      const elapsed = Date.now() - mountedAtRef.current;
      console.log(`[rpg-hub perf] 起動 ${elapsed}ms`);
      return elapsed;
    });
    // シーンを作り直したときも計測を続ける（シーン側は作り直すと止まった状態から始まる）
    webViewRef.current?.sendIntent(createSetPerfStatsIntent(true));
  }, [enabled, webViewRef]);

  const handleStats = useCallback(
    (next: PerfStats) => {
      if (!enabled) return;
      setStats(next);
      console.log("[rpg-hub perf]", JSON.stringify(next));
    },
    [enabled],
  );

  return { handleReady, handleStats, lines: enabled ? formatPerfStats(stats, startupMs) : null };
}
