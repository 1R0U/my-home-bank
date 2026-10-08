// プレイヤーの見た目の動き — 向きの追従と、歩く動作の計算（Issue #214 / #377）。
//
// 位置そのものは movement.ts の moveWithinMap が決める。ここが決めるのは
// 「どちらを向いて、どれだけ浮いていて、手足がどこにあるか」という**見た目だけ**の値で、
// 当たり判定や接近判定には一切関わらない。
//
// 手足の振り方そのものは住人と共通なので walkCycle.ts に置き、ここはプレイヤーの歩く速さに合わせて使う。
//
// Babylon に依存しない純粋関数として置いてあるのは、npcWander.ts と同じ理由で、
// WebView を起動せずに `node --test` で確かめられるようにするため。

import { turnToward } from "./angles.ts";
import { getWalkBob, stepWalkPhase } from "./walkCycle.ts";

/**
 * 歩くときの体の上下動の最大の高さ（ワールド座標）。
 * 1歩ごとに1回、この高さまで弾む。以前の跳ねる動き（0.16）より小さくして、
 * 跳ねているのではなく手足で歩いているように見せる（Issue #377）。
 */
export const BOB_HEIGHT = 0.05;

/**
 * 歩く速さ（ラジアン / ミリ秒）。
 * 位相が π 進むごとに1歩なので、π / 0.012 ≒ 260ms に1歩。
 * プレイヤーの移動速度（3.6 / 秒）だと、1歩あたり約0.94ぶん進む勘定。
 * **移動速度（WebVirtualPad の MAX_STEP）を変えたらここも合わせる。**
 * 速度だけ上げると歩幅が伸びて、足を動かさずに滑っているように見える。
 */
const STEP_SPEED_PER_MS = 0.012;

/**
 * 向きを変える速さ（ラジアン / ミリ秒）。
 * 半回転（π）に約210msかかる。瞬時に振り向くとカクついて見えるため少しずつ回すが、
 * 移動が速いぶん遅すぎると、曲がったあとも体が前の向きを向いたままになる。
 */
const TURN_PER_MS = 0.015;

/**
 * 1回の更新で進める時間の上限（ミリ秒）。
 * 画面復帰などで大きな `deltaMs` が来たときに、一気に回ったり手足が進んだりしないようにする
 * （npcWander.ts の MAX_STEP_MS と同じ考え方）。
 */
const MAX_STEP_MS = 50;

/** 入力があったとみなす大きさ。これ未満は入力なしの扱いにする。 */
const MOVING_EPSILON = 1e-6;

/**
 * 1フレームぶんの入力。
 *
 * **向きと歩く動作で別々の値を見るのが肝。** どちらも「実際に動けた量」から決めると、
 * 壁へ斜めに当たった瞬間に片方の軸だけが残り、キャラクターが横を向いてしまう
 * （`moveWithinMap` は角に引っかからないよう軸ごとに判定して壁沿いに滑らせるため）。
 */
export type PlayerMotionInput = {
  /** 押している向き。入力が無ければ null。**向きはこれで決める。** */
  direction: { x: number; z: number } | null;
  /** 実際に動けたか。**歩く動作をするかどうかはこれで決める。** 壁に押しつけている間は足踏みしない */
  moved: boolean;
};

/** プレイヤーの見た目の動きの状態。 */
export type PlayerMotionState = {
  /** 今向いている角度（ラジアン）。0 が +Z＝正面で、住人（NPC）の rotationY と同じ基準。 */
  facingY: number;
  /**
   * 歩く動作の位相（ラジアン）。0 〜 2π で1周（左右1歩ずつ）。
   * 0 と π が手足のそろった姿勢で、止まっている間はどちらかに留まる（walkCycle.ts）。
   */
  walkPhase: number;
};

/**
 * 初期状態を作る。出発時は正面（+Z）を向き、手足をそろえて立っている。
 * @returns 見た目の動きの初期状態
 */
export function createPlayerMotionState(): PlayerMotionState {
  return { facingY: 0, walkPhase: 0 };
}

/**
 * 見た目の動きを1フレームぶん進める。
 *
 * 向きは**押している方向**から決める。実際に動けた量から決めると、壁へ斜めに当たった
 * 瞬間にふさがれていない軸だけが残り、キャラクターが急に横を向く。
 * @param state - 現在の状態
 * @param deltaMs - 前回からの経過時間（ミリ秒）
 * @param input - このフレームの入力
 * @returns 次の状態。元の状態は書き換えない
 */
export function stepPlayerMotion(
  state: PlayerMotionState,
  deltaMs: number,
  input: PlayerMotionInput,
): PlayerMotionState {
  const stepMs = Math.min(Math.max(deltaMs, 0), MAX_STEP_MS);
  const walkPhase = stepWalkPhase(state.walkPhase, stepMs, input.moved, STEP_SPEED_PER_MS);

  const direction = input.direction;
  const hasDirection =
    direction !== null &&
    (Math.abs(direction.x) > MOVING_EPSILON || Math.abs(direction.z) > MOVING_EPSILON);
  if (!hasDirection) return { ...state, walkPhase };

  // 右手系でY軸まわりに回すと、正面(+Z)は (sin, cos) の向きになる（npcWander.ts と同じ）。
  const targetY = Math.atan2(direction.x, direction.z);
  const facingY = turnToward(state.facingY, targetY, TURN_PER_MS * stepMs);

  return { facingY, walkPhase };
}

/**
 * 今の体の浮き上がり量を求める。1歩ごとに1回弾む。
 * @param state - 現在の状態
 * @returns 地面からの浮き上がり（0 〜 BOB_HEIGHT）
 */
export function getBodyLift(state: PlayerMotionState): number {
  return getWalkBob(state.walkPhase, BOB_HEIGHT);
}
