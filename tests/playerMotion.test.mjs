import assert from "node:assert/strict";
import test from "node:test";
import {
  HOP_HEIGHT,
  createPlayerMotionState,
  getHopLift,
  stepPlayerMotion,
} from "../lib/rpg-hub/playerMotion.ts";

/**
 * 動き続けた状態を作る。
 * @param moved - 毎フレームの移動量
 * @param frames - 進めるフレーム数
 * @param deltaMs - 1フレームの経過時間（ミリ秒）
 * @param from - 開始状態
 * @returns 進めたあとの状態
 */
const run = (direction, frames, deltaMs = 16, from = createPlayerMotionState()) => {
  let state = from;
  for (let index = 0; index < frames; index += 1) {
    state = stepPlayerMotion(state, deltaMs, { direction, moved: direction !== null });
  }
  return state;
};

/** 入力あり・実際に動けた1フレーム。 */
const walking = (direction) => ({ direction, moved: true });

/** 入力なし（スティックを離した状態）。 */
const idle = { direction: null, moved: false };

// --- 向き ---

test("初期状態は正面（+Z）を向いていて、着地している", () => {
  const state = createPlayerMotionState();

  assert.equal(state.facingY, 0);
  assert.equal(getHopLift(state), 0);
});

test("押している向きへ体を向ける（+X へ進めば π/2 に近づく）", () => {
  const state = run({ x: 0.1, z: 0 }, 60);

  assert.ok(Math.abs(state.facingY - Math.PI / 2) < 1e-9, `facingY=${state.facingY}`);
});

test("向きは一度に変わらず、少しずつ回る", () => {
  // 正面(+Z)から真後ろ(-Z)へ。1フレーム(16ms)では振り向ききらない
  const oneFrame = stepPlayerMotion(createPlayerMotionState(), 16, walking({ x: 0, z: -0.1 }));

  assert.ok(Math.abs(oneFrame.facingY) > 0, "まったく回っていない");
  assert.ok(Math.abs(oneFrame.facingY) < Math.PI, "一度に振り向いてしまっている");
});

test("向きは近いほうに回る（±π をまたいでも遠回りしない）", () => {
  // ほぼ真後ろ(-Z)を向いた状態から、-X 寄り（目標 -π+α 側）へ動く
  const from = { facingY: Math.PI - 0.05, hopPhase: 0 };
  const next = stepPlayerMotion(from, 16, walking({ x: -0.01, z: -0.1 }));

  // 目標は -π 側。遠回り（角度が減る方向）ではなく π を越えて近回りする
  assert.ok(next.facingY > from.facingY || next.facingY < -Math.PI + 0.3, `facingY=${next.facingY}`);
});

test("スティックを離している間は向きを変えない", () => {
  const moving = run({ x: 0.1, z: 0 }, 60);
  const stopped = stepPlayerMotion(moving, 16, idle);

  assert.equal(stopped.facingY, moving.facingY);
});

test("入力が0のフレームは、入力なしの扱いにする", () => {
  const moving = run({ x: 0.1, z: 0 }, 60);
  const stopped = stepPlayerMotion(moving, 16, walking({ x: 0, z: 0 }));

  assert.equal(stopped.facingY, moving.facingY);
});

// --- 壁に当たったとき（#214 の「当たった瞬間に横を向く」対応） ---

test("壁で片方の軸がふさがれても、向きは押している方向のまま", () => {
  // 右上（+X-Z）へ斜めに進んでいる状態から、+X 側が壁でふさがれる。
  // moveWithinMap は壁沿いに滑らせるので実際の移動は -Z だけになるが、
  // 押しているのは斜めのままなので、向きは斜めから変わってはいけない
  const diagonal = { x: 0.085, z: -0.085 };
  const running = run(diagonal, 120);
  const againstWall = stepPlayerMotion(running, 16, { direction: diagonal, moved: true });

  assert.equal(againstWall.facingY, running.facingY, "壁に当たった瞬間に向きが変わった");
  assert.ok(Math.abs(running.facingY - Math.atan2(0.085, -0.085)) < 1e-9);
});

test("壁に完全にふさがれても、押している向きは向く（跳ねはしない）", () => {
  // 壁を押しているあいだ、向きはその方向を向いてほしい。
  // ただし一歩も進めていないので、跳ねる動きは止まる
  let state = createPlayerMotionState();
  for (let index = 0; index < 120; index += 1) {
    state = stepPlayerMotion(state, 16, { direction: { x: 0.1, z: 0 }, moved: false });
  }

  assert.ok(Math.abs(state.facingY - Math.PI / 2) < 1e-9, `facingY=${state.facingY}`);
  assert.equal(state.hopPhase, 0, "進めていないのに跳ねている");
});

// --- 跳ねる ---

test("歩いている間は跳ね、跳ね上がりは0〜HOP_HEIGHTに収まる", () => {
  let state = createPlayerMotionState();
  let highest = 0;

  for (let index = 0; index < 200; index += 1) {
    state = stepPlayerMotion(state, 16, walking({ x: 0, z: 0.1 }));
    const lift = getHopLift(state);
    assert.ok(lift >= 0 && lift <= HOP_HEIGHT, `lift=${lift}`);
    highest = Math.max(highest, lift);
  }

  assert.ok(highest > HOP_HEIGHT * 0.9, `跳ねていない highest=${highest}`);
});

test("跳躍は繰り返す（一度上がって着地し、また上がる）", () => {
  let state = createPlayerMotionState();
  let landings = 0;

  for (let index = 0; index < 300; index += 1) {
    const before = state.hopPhase;
    state = stepPlayerMotion(state, 16, walking({ x: 0, z: 0.1 }));
    // 位相が巻き戻ったフレーム＝着地した瞬間
    if (state.hopPhase < before) landings += 1;
  }

  assert.ok(landings >= 2, `着地回数=${landings}`);
});

test("止まると、跳びかけていても着地して止まる", () => {
  // 跳び上がっている途中で入力をやめる
  let state = run({ x: 0, z: 0.1 }, 10);
  assert.ok(getHopLift(state) > 0, "前提: 浮いている");

  for (let index = 0; index < 100; index += 1) {
    state = stepPlayerMotion(state, 16, idle);
  }

  assert.equal(state.hopPhase, 0);
  assert.equal(getHopLift(state), 0);
});

test("止まったまま待っても、勝手に跳ね始めない", () => {
  let state = createPlayerMotionState();

  for (let index = 0; index < 100; index += 1) {
    state = stepPlayerMotion(state, 16, idle);
    assert.equal(getHopLift(state), 0);
  }
});

// --- 大きな経過時間 ---

test("画面復帰などで大きなdeltaMsが来ても、一度に回りすぎない", () => {
  // 上限(50ms)を超えたぶんは切り捨てる。50msで回れるのは 0.015 * 50 = 0.75 ラジアン
  const huge = stepPlayerMotion(createPlayerMotionState(), 100000, walking({ x: 0.1, z: 0 }));

  assert.ok(Math.abs(huge.facingY) <= 0.75 + 1e-9, `facingY=${huge.facingY}`);
});

test("負のdeltaMsでも壊れない", () => {
  const state = stepPlayerMotion(createPlayerMotionState(), -100, walking({ x: 0.1, z: 0 }));

  assert.ok(Number.isFinite(state.facingY));
  assert.ok(Number.isFinite(state.hopPhase));
  assert.equal(state.hopPhase, 0);
});

test("元の状態を書き換えない", () => {
  const before = createPlayerMotionState();
  stepPlayerMotion(before, 16, walking({ x: 0.1, z: 0 }));

  assert.deepEqual(before, { facingY: 0, hopPhase: 0 });
});
