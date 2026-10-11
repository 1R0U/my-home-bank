// 読み込み中の画面に出す、歩きのコマ絵（Issue #261）のブリッジ・保存の形のテスト。
import assert from "node:assert/strict";
import test from "node:test";
import {
  WALK_FRAME_COUNT,
  createRenderWalkFramesIntent,
  getPortraitKey,
  getWalkFramePhase,
  getWalkFramesKey,
  parsePortraitEvent,
  parsePortraitIntent,
} from "../lib/rpg-hub/portraitBridge.ts";
import { WALK_CYCLE } from "../lib/rpg-hub/walkCycle.ts";
import {
  WALK_FRAMES_CACHE_VERSION,
  encodeWalkFramesCache,
  parseWalkFramesCache,
} from "../lib/rpg-hub/walkFramesCache.ts";
import { useWalkFramesStore } from "../store/walkFramesStore.ts";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const frames = () => Array.from({ length: WALK_FRAME_COUNT }, (_, index) => `${PNG}${index}`);

/** @returns 基準にする見た目 */
const baseLook = () => ({ characterType: "cat", equipment: {}, palette: {}, season: "summer" });

// --- キーと依頼 ---

test("コマ絵のキーは、同じ見た目の肖像（1枚）のキーと重ならない", () => {
  assert.notEqual(getWalkFramesKey(baseLook()), getPortraitKey(baseLook()));
  // 見た目が違えば、コマ絵のキーも違う
  assert.notEqual(getWalkFramesKey(baseLook()), getWalkFramesKey({ ...baseLook(), season: "winter" }));
});

test("コマ絵の依頼は、WebView 側でコマ絵の依頼として読める", () => {
  const intent = createRenderWalkFramesIntent(baseLook());
  assert.equal(intent.type, "renderWalkFrames");
  assert.equal(intent.key, getWalkFramesKey(baseLook()));

  const result = parsePortraitIntent(JSON.stringify(intent));
  assert.equal(result.success, true);
  assert.equal(result.intent.type, "renderWalkFrames");
});

test("コマ絵は歩く動作1周を等分し、手足のそろった姿勢から始まる", () => {
  assert.equal(getWalkFramePhase(0), 0);
  // 半分のところで、反対の足を踏み終えた姿勢（π）になる
  assert.equal(getWalkFramePhase(WALK_FRAME_COUNT / 2), Math.PI);
  // 最後のコマの次が1周（＝最初のコマ）になる
  assert.equal(getWalkFramePhase(WALK_FRAME_COUNT), WALK_CYCLE);
});

// --- 受け取ったコマ絵の検証 ---

test("そろったコマ絵を受け取る", () => {
  const result = parsePortraitEvent({ event: "walkFrames", frames: frames(), key: "walk|k" });
  assert.equal(result.success, true);
  assert.deepEqual(result.event, { event: "walkFrames", frames: frames(), key: "walk|k" });
});

test("枚数が足りない・多いコマ絵は受け取らない（歩く動作が途中で飛んで見えるため）", () => {
  const short = parsePortraitEvent({ event: "walkFrames", frames: frames().slice(1), key: "k" });
  const long = parsePortraitEvent({ event: "walkFrames", frames: [...frames(), PNG], key: "k" });
  assert.equal(short.success, false);
  assert.equal(long.success, false);
});

test("PNG の data URL でないコマが1枚でもあれば受け取らない", () => {
  const broken = frames();
  broken[3] = "https://example.com/a.png";
  assert.equal(parsePortraitEvent({ event: "walkFrames", frames: broken, key: "k" }).success, false);
  assert.equal(parsePortraitEvent({ event: "walkFrames", frames: "x", key: "k" }).success, false);
  assert.equal(parsePortraitEvent({ event: "walkFrames", frames: frames() }).success, false);
});

// --- 保存の形 ---

test("保存したコマ絵は、そのまま読み戻せる", () => {
  const walkFrames = { frames: frames(), key: "walk|k" };
  assert.deepEqual(parseWalkFramesCache(encodeWalkFramesCache(walkFrames)), walkFrames);
});

test("前の版で保存したものや、壊れたファイルは読まず、描き直してもらう", () => {
  const old = JSON.stringify({ frames: frames(), key: "k", version: WALK_FRAMES_CACHE_VERSION - 1 });
  assert.equal(parseWalkFramesCache(old), null);
  assert.equal(parseWalkFramesCache("{壊れている"), null);
  assert.equal(parseWalkFramesCache("null"), null);
  const missing = JSON.stringify({ frames: frames().slice(2), key: "k", version: WALK_FRAMES_CACHE_VERSION });
  assert.equal(parseWalkFramesCache(missing), null);
});

// --- useWalkFramesStore ---

test("覚えておくのは最後に描いた1組だけ", () => {
  const first = { frames: frames(), key: "walk|a" };
  const second = { frames: frames(), key: "walk|b" };
  useWalkFramesStore.getState().setWalkFrames(first);
  useWalkFramesStore.getState().setWalkFrames(second);
  assert.deepEqual(useWalkFramesStore.getState().walkFrames, second);
});
