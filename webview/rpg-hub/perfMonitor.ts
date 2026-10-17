// 描画負荷の計測（Issue #200）。開発ビルドのときだけ RN から setPerfStats で始める。
//
// 2秒ごとに、その間のフレーム間隔から FPS・平均・95パーセンタイルを求め、
// ドローコール数・メッシュ数などと一緒に RN へ送る。計測していない間は何もしない
// （フレームごとの記録も外す）ので、本番の描画には影響しない。

import {
  PERF_MAX_SAMPLES,
  PERF_REPORT_INTERVAL_MS,
  summarizeFrameIntervals,
  type PerfStats,
} from "../../lib/rpg-hub/perfStats";

type PerfMonitorOptions = {
  engine: any;
  scene: any;
  /** いまのマップのオブジェクト数 */
  countObjects: () => number;
  /** 計測値を RN へ送る */
  report: (stats: PerfStats) => void;
};

/**
 * 計測の仕組みを作る。最初は止まっている。
 * @returns 計測を始める・止める関数
 */
export function createPerfMonitor(options: PerfMonitorOptions): {
  setEnabled: (enabled: boolean) => void;
} {
  // 引数での分割代入は esbuild の対象（es2017 など）に変換できないので、ここで取り出す（AGENTS.md）
  const engine = options.engine;
  const scene = options.scene;
  const countObjects = options.countObjects;
  const report = options.report;
  let intervals: number[] = [];
  let drawCalls: number[] = [];
  let beforeObserver: unknown = null;
  let afterObserver: unknown = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  // ドローコール数はエンジンの数え上げ（engine._drawCalls）から取る。SceneInstrumentation の
  // drawCallsCounter は、ほかの計測を有効にしないとフレームごとに区切られず 0 のままになるため、
  // 区切り（fetchNewFrame）もここで行う。影を描くパスの分も含めた、そのフレームの実際の回数になる
  function startFrame(): void {
    engine._drawCalls?.fetchNewFrame();
  }

  function sample(): void {
    if (intervals.length >= PERF_MAX_SAMPLES) return;
    intervals.push(engine.getDeltaTime());
    drawCalls.push(engine._drawCalls?.current ?? 0);
  }

  function send(): void {
    const frame = summarizeFrameIntervals(intervals);
    const averageDrawCalls = drawCalls.length > 0 ? drawCalls.reduce((sum, n) => sum + n, 0) / drawCalls.length : 0;
    intervals = [];
    drawCalls = [];
    if (!frame) return;

    let meshes = 0;
    let instances = 0;
    for (const mesh of scene.meshes) {
      if (mesh.getClassName() === "InstancedMesh") instances += 1;
      else meshes += 1;
    }
    // performance.memory は Chromium 系（Android の WebView）だけにある
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    report({
      ...frame,
      activeMeshes: scene.getActiveMeshes().length,
      drawCalls: Math.round(averageDrawCalls),
      heapMb: memory ? Math.round((memory.usedJSHeapSize / 1024 / 1024) * 10) / 10 : null,
      instances,
      meshes,
      objects: countObjects(),
    });
  }

  function setEnabled(enabled: boolean): void {
    if (enabled && timer === null) {
      intervals = [];
      drawCalls = [];
      beforeObserver = scene.onBeforeAnimationsObservable.add(startFrame);
      afterObserver = scene.onAfterRenderObservable.add(sample);
      timer = setInterval(send, PERF_REPORT_INTERVAL_MS);
      return;
    }
    if (!enabled && timer !== null) {
      clearInterval(timer);
      timer = null;
      scene.onBeforeAnimationsObservable.remove(beforeObserver);
      scene.onAfterRenderObservable.remove(afterObserver);
      beforeObserver = null;
      afterObserver = null;
    }
  }

  return { setEnabled };
}
