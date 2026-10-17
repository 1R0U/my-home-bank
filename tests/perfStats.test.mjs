import assert from "node:assert/strict";
import test from "node:test";
import { createSetPerfStatsIntent, encodeEvent, parseIntent, parseRpgHubEvent } from "../lib/rpg-hub/bridge.ts";
import { formatPerfStats, summarizeFrameIntervals } from "../lib/rpg-hub/perfStats.ts";

/**
 * 我が家タウンの描画負荷の計測（Issue #200）。
 */

const STATS = {
  activeMeshes: 225,
  drawCalls: 350,
  fps: 59.8,
  frameMsAvg: 16.7,
  frameMsP95: 18.2,
  heapMb: 57.5,
  instances: 1671,
  meshes: 261,
  objects: 326,
};

test("フレーム間隔から、平均FPS・平均・95パーセンタイルを求める", () => {
  // 19フレームが16ms、1フレームだけ100ms（カクついた）
  const intervals = [...Array(19).fill(16), 100];
  const summary = summarizeFrameIntervals(intervals);
  assert.equal(summary.frameMsAvg, 20.2);
  assert.equal(summary.fps, 49.5);
  // 20件の95% = 19件目までが16ms。カクつき1回は p95 に入らない
  assert.equal(summary.frameMsP95, 16);
  // 2回カクつけば p95 に出る
  assert.equal(summarizeFrameIntervals([...Array(18).fill(16), 100, 100]).frameMsP95, 100);
});

test("裏に回ったときなどの不正な間隔は除き、何も残らなければ null", () => {
  assert.deepEqual(summarizeFrameIntervals([16, 0, -1, Number.NaN, Infinity, 16]), {
    fps: 62.5,
    frameMsAvg: 16,
    frameMsP95: 16,
  });
  assert.equal(summarizeFrameIntervals([]), null);
  assert.equal(summarizeFrameIntervals([0, Number.NaN]), null);
});

test("画面の隅に出す行を作る（届く前と、ヒープが取れない環境）", () => {
  assert.deepEqual(formatPerfStats(null, null), ["起動 -", "計測中…"]);
  assert.deepEqual(formatPerfStats({ ...STATS, heapMb: null }, 1234.4), [
    "起動 1234ms",
    "59.8fps 平均16.7ms p95 18.2ms",
    "draw 350 / 描画中 225",
    "メッシュ 261 + inst 1671 / obj 326",
    "JSヒープ 取得不可",
  ]);
});

test("計測の切り替え意図はブリッジを往復できる", () => {
  const intent = createSetPerfStatsIntent(true);
  assert.deepEqual(parseIntent(JSON.stringify(intent)), { intent, success: true });
  assert.equal(parseIntent({ enabled: "yes", type: "setPerfStats" }).success, false);
});

test("計測値のイベントはブリッジを往復でき、おかしな値は捨てる", () => {
  const event = { event: "perfStats", ...STATS };
  assert.deepEqual(parseRpgHubEvent(encodeEvent(event)), { event, success: true });
  assert.deepEqual(parseRpgHubEvent({ ...event, heapMb: null }), { event: { ...event, heapMb: null }, success: true });
  assert.equal(parseRpgHubEvent({ ...event, fps: "60" }).success, false);
  assert.equal(parseRpgHubEvent({ ...event, drawCalls: -1 }).success, false);
  assert.equal(parseRpgHubEvent({ ...event, heapMb: "57" }).success, false);
  const { objects, ...missing } = event;
  assert.equal(parseRpgHubEvent(missing).success, false);
});
