import assert from "node:assert/strict";
import test from "node:test";
import {
  BOB_HEIGHT,
  createPlayerMotionState,
  getBodyLift,
  stepPlayerMotion,
} from "../lib/rpg-hub/playerMotion.ts";
import { getLimbSwing } from "../lib/rpg-hub/walkCycle.ts";

/** 位相の誤差（π が浮動小数で sin(π) ≒ 1e-16 になるぶん）。 */
const EPSILON = 1e-9;

/**
 * 手足が元の姿勢にあるか（振る角度が0か）を確かめる。
 * 符号付きのゼロ（-0）が出ることがあるので、equal ではなく誤差の範囲で比べる。
 * @param swing - getLimbSwing の結果
 * @param label - 失敗したときに出す名前
 */
const assertAtRest = (swing, label) => {
  assert.ok(Math.abs(swing) < EPSILON, `${label} swing=${swing}`);
};

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

test("初期状態は正面（+Z）を向いていて、手足をそろえて立っている", () => {
  const state = createPlayerMotionState();

  assert.equal(state.facingY, 0);
  assert.equal(getBodyLift(state), 0);
  for (const limb of ["foot", "hand"]) {
    for (const side of [-1, 1]) {
      assertAtRest(getLimbSwing(state.walkPhase, limb, side), `${limb} ${side}`);
    }
  }
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
  const from = { facingY: Math.PI - 0.05, walkPhase: 0 };
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

test("壁に完全にふさがれても、押している向きは向く（足踏みはしない）", () => {
  // 壁を押しているあいだ、向きはその方向を向いてほしい。
  // ただし一歩も進めていないので、歩く動きは止まる
  let state = createPlayerMotionState();
  for (let index = 0; index < 120; index += 1) {
    state = stepPlayerMotion(state, 16, { direction: { x: 0.1, z: 0 }, moved: false });
  }

  assert.ok(Math.abs(state.facingY - Math.PI / 2) < 1e-9, `facingY=${state.facingY}`);
  assert.equal(state.walkPhase, 0, "進めていないのに足踏みしている");
});

// --- 歩く ---

test("歩いている間は1歩ごとに弾み、浮き上がりは0〜BOB_HEIGHTに収まる", () => {
  let state = createPlayerMotionState();
  let highest = 0;

  for (let index = 0; index < 200; index += 1) {
    state = stepPlayerMotion(state, 16, walking({ x: 0, z: 0.1 }));
    const lift = getBodyLift(state);
    assert.ok(lift >= 0 && lift <= BOB_HEIGHT, `lift=${lift}`);
    highest = Math.max(highest, lift);
  }

  assert.ok(highest > BOB_HEIGHT * 0.9, `弾んでいない highest=${highest}`);
});

test("歩く動作は繰り返す（位相が1周して、また歩き続ける）", () => {
  let state = createPlayerMotionState();
  let cycles = 0;

  for (let index = 0; index < 300; index += 1) {
    const before = state.walkPhase;
    state = stepPlayerMotion(state, 16, walking({ x: 0, z: 0.1 }));
    // 位相が巻き戻ったフレーム＝左右1歩ずつ踏み終えた瞬間
    if (state.walkPhase < before) cycles += 1;
    assert.ok(state.walkPhase >= 0 && state.walkPhase < Math.PI * 2, `walkPhase=${state.walkPhase}`);
  }

  assert.ok(cycles >= 2, `周回数=${cycles}`);
});

// 手足の振り方そのもの（左右・手と足の関係・地面に潜らないこと）は walkCycle.test.mjs で確かめる

test("止まると、踏み出しかけた1歩を終えて手足がそろったところで止まる", () => {
  // 1歩目の途中で入力をやめる
  let state = run({ x: 0, z: 0.1 }, 6);
  assert.ok(state.walkPhase > 0 && state.walkPhase < Math.PI, "前提: 1歩目の途中");
  assert.ok(Math.abs(getLimbSwing(state.walkPhase, "foot", 1)) > 0, "前提: 足が前後に開いている");

  for (let index = 0; index < 100; index += 1) {
    const before = state.walkPhase;
    state = stepPlayerMotion(state, 16, idle);
    // 止まる途中で位相が戻らない（上げた足が瞬間移動したように揃わない）
    assert.ok(state.walkPhase >= before, `位相が戻った ${before} → ${state.walkPhase}`);
  }

  assert.equal(state.walkPhase, Math.PI, "1歩目の終わりで止まっていない");
  assert.ok(getBodyLift(state) < EPSILON);
  for (const limb of ["foot", "hand"]) {
    for (const side of [-1, 1]) {
      assertAtRest(getLimbSwing(state.walkPhase, limb, side), `${limb} ${side}`);
    }
  }
});

test("2歩目の途中で止まると、1周の終わり（0）で止まる", () => {
  let state = { facingY: 0, walkPhase: Math.PI * 1.5 };

  for (let index = 0; index < 100; index += 1) {
    state = stepPlayerMotion(state, 16, idle);
  }

  assert.equal(state.walkPhase, 0);
});

test("止まったまま待っても、勝手に歩き始めない", () => {
  // 1歩目の終わり（π）で止まっている状態からも動き出さない
  for (const from of [createPlayerMotionState(), { facingY: 0, walkPhase: Math.PI }]) {
    let state = from;
    for (let index = 0; index < 100; index += 1) {
      state = stepPlayerMotion(state, 16, idle);
      assert.equal(state.walkPhase, from.walkPhase);
    }
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
  assert.ok(Number.isFinite(state.walkPhase));
  assert.equal(state.walkPhase, 0);
});

test("元の状態を書き換えない", () => {
  const before = createPlayerMotionState();
  stepPlayerMotion(before, 16, walking({ x: 0.1, z: 0 }));

  assert.deepEqual(before, { facingY: 0, walkPhase: 0 });
});
