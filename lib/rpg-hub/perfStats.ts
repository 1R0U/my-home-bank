/**
 * 我が家タウンの描画負荷の計測値（Issue #200）。
 *
 * 開発ビルドのときだけ、シーン（WebView）が一定間隔で計測値を RN へ送り、画面の隅に出す。
 * 実機での FPS・フレーム時間・メモリを、設計書（docs/RPG_HUB_ARCHITECTURE.md 8節）へ
 * 基準値として残すためのもの。本番ビルドでは計測しない。
 *
 * ここには計算と表示の決まりだけを置く（シーン側・RN 側の両方から使う）。
 */

/** 計測値を RN へ送る間隔（ms）。ブリッジは毎フレーム送らない決まり（設計書8節）なので間引く */
export const PERF_REPORT_INTERVAL_MS = 2000;

/** 1回の計測で覚えておくフレーム間隔の上限。送る間隔ぶん（60fpsで約120フレーム）より十分大きくする */
export const PERF_MAX_SAMPLES = 600;

/**
 * これを超えるフレーム間隔は、描画の重さではなく止まっていた時間として除く（ms）。
 * アプリを裏に回して戻ると、Babylon は戻った直後のフレームに止まっていた時間ぶんの
 * 大きな間隔（10秒裏にいれば約10,000ms）を返し、平均FPSとp95が崩れるため。
 * 1秒かかるフレームは描画の重さとしてはありえないので、ここで切っても実際のカクつきは消えない。
 */
export const PERF_MAX_FRAME_MS = 1000;

/** シーンが RN へ送る計測値 */
export type PerfStats = {
  /** 平均FPS（計測区間のフレーム間隔の平均から求める） */
  fps: number;
  /** フレーム間隔の平均（ms） */
  frameMsAvg: number;
  /** フレーム間隔の95パーセンタイル（ms）。カクつきの目安 */
  frameMsP95: number;
  /** 1フレームあたりのドローコール数（計測区間の平均。影を描くパスの分も含む） */
  drawCalls: number;
  /** 実メッシュ数（インスタンスを除く。描画のもとになるもの） */
  meshes: number;
  /** インスタンス数（共有元と一緒に描かれる装飾物） */
  instances: number;
  /** 視錐台カリングのあと、実際に描いたメッシュ数 */
  activeMeshes: number;
  /** マップのオブジェクト数（setMap で受け取った数） */
  objects: number;
  /** JSのヒープ使用量（MB）。取れない環境（iOS の WebView など）では null */
  heapMb: number | null;
};

/**
 * フレーム間隔（ms）の並びから、平均FPS・平均・95パーセンタイルを求める。
 *
 * 0以下・有限でない値と、PERF_MAX_FRAME_MS を超える値（裏から戻った直後の、止まっていた時間）は除く。
 * 1つも残らなければ null。
 * @param intervals - フレームごとの間隔（ms）
 * @returns 平均FPS・平均・95パーセンタイル（小数第1位まで）
 */
export function summarizeFrameIntervals(
  intervals: readonly number[],
): { fps: number; frameMsAvg: number; frameMsP95: number } | null {
  const valid = intervals.filter((ms) => Number.isFinite(ms) && ms > 0 && ms <= PERF_MAX_FRAME_MS).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const avg = valid.reduce((sum, ms) => sum + ms, 0) / valid.length;
  // 最近傍順位法: 95%の値がこれ以下になる、最小の順位の値
  const p95 = valid[Math.min(valid.length - 1, Math.ceil(valid.length * 0.95) - 1)];
  return { fps: round1(1000 / avg), frameMsAvg: round1(avg), frameMsP95: round1(p95) };
}

/**
 * 画面の隅に出す行を作る。
 * @param stats - 計測値（まだ届いていなければ null）
 * @param startupMs - 画面を開いてからシーンの準備ができるまで（ms）。まだなら null
 * @returns 表示する行
 */
export function formatPerfStats(stats: PerfStats | null, startupMs: number | null): string[] {
  const lines = [`起動 ${startupMs === null ? "-" : `${Math.round(startupMs)}ms`}`];
  if (!stats) return [...lines, "計測中…"];
  return [
    ...lines,
    `${stats.fps.toFixed(1)}fps 平均${stats.frameMsAvg.toFixed(1)}ms p95 ${stats.frameMsP95.toFixed(1)}ms`,
    `draw ${Math.round(stats.drawCalls)} / 描画中 ${stats.activeMeshes}`,
    `メッシュ ${stats.meshes} + inst ${stats.instances} / obj ${stats.objects}`,
    `JSヒープ ${stats.heapMb === null ? "取得不可" : `${stats.heapMb.toFixed(1)}MB`}`,
  ];
}

/**
 * 小数第1位に丸める。計測値の丸め方はここにそろえる（シーン側の JSヒープでも使う）。
 * @param value - 丸める値
 * @returns 小数第1位までの値
 */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 計測表示を出すための環境変数の値。`npm run start:perf` が `EXPO_PUBLIC_SHOW_PERF=1` を付けて起動する */
export const SHOW_PERF_ENV_VALUE = "1";

/**
 * 我が家タウンの描画負荷を計測・表示するか（Issue #507）。
 *
 * 開発ビルドでも普段は出さず、`EXPO_PUBLIC_SHOW_PERF=1` を付けて起動したときだけ出す。
 * Expo Go の実機も `__DEV__` は true なので、それだけで判定すると動作確認やスクリーンショットの
 * たびに計測値が画面に重なってしまうため。本番ビルドでは値に関わらず計測しない。
 * @param isDev - 開発ビルドか（呼び出し側は `__DEV__` を渡す）
 * @param showPerfEnv - `process.env.EXPO_PUBLIC_SHOW_PERF` の値
 * @returns 計測・表示するなら true
 */
export function shouldMeasureHubPerf(isDev: boolean, showPerfEnv: string | undefined): boolean {
  return isDev && showPerfEnv === SHOW_PERF_ENV_VALUE;
}
