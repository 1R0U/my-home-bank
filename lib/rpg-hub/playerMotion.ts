// プレイヤー（カエル）の見た目の動き — 向きの追従と、跳ねる動作の計算（Issue #214）。
//
// 位置そのものは movement.ts の moveWithinMap が決める。ここが決めるのは
// 「どちらを向いて、どれだけ浮いているか」という**見た目だけ**の値で、
// 当たり判定や接近判定には一切関わらない。
//
// Babylon に依存しない純粋関数として置いてあるのは、npcWander.ts と同じ理由で、
// WebView を起動せずに `node --test` で確かめられるようにするため。

import { turnToward } from "./angles.ts";

/** 跳ね上がりの最大の高さ（ワールド座標）。 */
export const HOP_HEIGHT = 0.16;

/**
 * 跳ねる速さ（ラジアン / ミリ秒）。
 * 位相が 0 → π で1回ぶんの跳躍なので、π / 0.0098 ≒ 320ms に1回跳ねる。
 * プレイヤーの移動速度（3.6 / 秒）だと、1歩あたり約1.15mぶん進む勘定。
 * **移動速度（WebVirtualPad の MAX_STEP）を変えたらここも合わせる。**
 * 速度だけ上げると歩幅が伸びて、跳ばずに滑っているように見える。
 */
const HOP_SPEED_PER_MS = 0.0098;

/**
 * 向きを変える速さ（ラジアン / ミリ秒）。
 * 半回転（π）に約210msかかる。瞬時に振り向くとカクついて見えるため少しずつ回すが、
 * 移動が速いぶん遅すぎると、曲がったあとも体が前の向きを向いたままになる。
 */
const TURN_PER_MS = 0.015;

/**
 * 1回の更新で進める時間の上限（ミリ秒）。
 * 画面復帰などで大きな `deltaMs` が来たときに、一気に回ったり跳ねたりしないようにする
 * （npcWander.ts の MAX_STEP_MS と同じ考え方）。
 */
const MAX_STEP_MS = 50;

/** 入力があったとみなす大きさ。これ未満は入力なしの扱いにする。 */
const MOVING_EPSILON = 1e-6;

/**
 * 1フレームぶんの入力。
 *
 * **向きと跳ねで別々の値を見るのが肝。** どちらも「実際に動けた量」から決めると、
 * 壁へ斜めに当たった瞬間に片方の軸だけが残り、キャラクターが横を向いてしまう
 * （`moveWithinMap` は角に引っかからないよう軸ごとに判定して壁沿いに滑らせるため）。
 */
export type PlayerMotionInput = {
  /** 押している向き。入力が無ければ null。**向きはこれで決める。** */
  direction: { x: number; z: number } | null;
  /** 実際に動けたか。**跳ねるかどうかはこれで決める。** 壁に押しつけている間は跳ねない */
  moved: boolean;
};

/** プレイヤーの見た目の動きの状態。 */
export type PlayerMotionState = {
  /** 今向いている角度（ラジアン）。0 が +Z＝正面で、住人（NPC）の rotationY と同じ基準。 */
  facingY: number;
  /** 跳躍の位相（ラジアン）。0 〜 π で1回ぶん。0 は着地している状態。 */
  hopPhase: number;
};

/**
 * 跳躍の位相を進める。
 *
 * 動いている間は 0 〜 π を繰り返し、止まったら**今の跳躍を終えたところ**で 0 に止まる。
 * 止まった瞬間に 0 へ戻さないのは、空中から瞬間移動したように着地するのを避けるため。
 * @param phase - 現在の位相（ラジアン）
 * @param stepMs - 進める時間（ミリ秒）
 * @param isMoving - 動いているか
 * @returns 次の位相
 */
function stepHopPhase(phase: number, stepMs: number, isMoving: boolean): number {
  // 止まっていて、かつ着地済みなら跳ね始めない
  if (!isMoving && phase <= 0) return 0;

  const next = phase + HOP_SPEED_PER_MS * stepMs;
  if (next < Math.PI) return next;
  // 着地した。動いていれば次の跳躍へ続け、止まっていれば着地したまま止まる
  return isMoving ? next - Math.PI : 0;
}

/**
 * 初期状態を作る。出発時は正面（+Z）を向き、着地している。
 * @returns 見た目の動きの初期状態
 */
export function createPlayerMotionState(): PlayerMotionState {
  return { facingY: 0, hopPhase: 0 };
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
  const hopPhase = stepHopPhase(state.hopPhase, stepMs, input.moved);

  const direction = input.direction;
  const hasDirection =
    direction !== null &&
    (Math.abs(direction.x) > MOVING_EPSILON || Math.abs(direction.z) > MOVING_EPSILON);
  if (!hasDirection) return { ...state, hopPhase };

  // 右手系でY軸まわりに回すと、正面(+Z)は (sin, cos) の向きになる（npcWander.ts と同じ）。
  const targetY = Math.atan2(direction.x, direction.z);
  const facingY = turnToward(state.facingY, targetY, TURN_PER_MS * stepMs);

  return { facingY, hopPhase };
}

/**
 * 今の跳ね上がり量を求める。
 * @param state - 現在の状態
 * @returns 地面からの浮き上がり（0 〜 HOP_HEIGHT）
 */
export function getHopLift(state: PlayerMotionState): number {
  return Math.sin(state.hopPhase) * HOP_HEIGHT;
}
