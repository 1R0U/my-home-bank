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
 * 0以下や有限でない値（タブが裏に回ったときなど）は除く。1つも残らなければ null。
 * @param intervals - フレームごとの間隔（ms）
 * @returns 平均FPS・平均・95パーセンタイル（小数第1位まで）
 */
export function summarizeFrameIntervals(
  intervals: readonly number[],
): { fps: number; frameMsAvg: number; frameMsP95: number } | null {
  const valid = intervals.filter((ms) => Number.isFinite(ms) && ms > 0).sort((a, b) => a - b);
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

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
