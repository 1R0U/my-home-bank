// 歩く動作の周期 — 手足の振りと体の弾みの計算（Issue #377）。
//
// プレイヤー（playerMotion.ts）と住人（npcWander.ts）で共通に使う。歩く速さが違うので
// 位相を進める速さだけは呼ぶ側が渡し、手足の振り方・止まり方はここで1つにそろえる。
//
// 手足をどこを軸に回すか（付け根）は体の形ごとに違うため、ここでは持たない
// （パーツ定義の `limb.pivotY`。lib/rpg-hub/buildingParts.ts）。
// Babylon に依存しない純粋関数として置き、`node --test` で確かめる。

import type { Limb } from "./buildingParts.ts";

/** 歩く動作1周（左右1歩ずつ）ぶんの位相。 */
export const WALK_CYCLE = Math.PI * 2;

/**
 * 手足を振る角度の最大（ラジアン）。手足とも付け根（パーツ定義の `limb.pivotY`）を軸に回す。
 *   - 足 … 約29度。大きくすると、振り上げた足の角が地面より下へ潜る（体の弾みで持ち上げきれなくなる）
 *   - 手 … 約34度。足と逆に振る
 */
export const LIMB_SWING_ANGLE: Record<Limb, number> = { foot: 0.5, hand: 0.6 };

/**
 * 歩く動作の位相を進める。
 *
 * 位相は 0 〜 2π で1周（左右1歩ずつ）。0 と π が手足のそろった姿勢になる。
 * 動いている間は 0 〜 2π を繰り返し、止まったら**今の1歩を踏み終えたところ**（0 か π）で止まる。
 * 止まった瞬間に戻さないのは、足を上げたまま急に揃ったように見えるのを避けるため。
 * @param phase - 現在の位相（ラジアン）
 * @param stepMs - 進める時間（ミリ秒）。0以上で、上限は呼ぶ側で切っておく
 * @param isMoving - 動いているか
 * @param speedPerMs - 位相を進める速さ（ラジアン / ミリ秒）。π 進むごとに1歩
 * @returns 次の位相
 */
export function stepWalkPhase(
  phase: number,
  stepMs: number,
  isMoving: boolean,
  speedPerMs: number,
): number {
  // 止まっていて、かつ手足がそろっていれば歩き出さない
  if (!isMoving && phase % Math.PI === 0) return phase;

  const next = phase + speedPerMs * stepMs;
  if (isMoving) return next % WALK_CYCLE;
  // 止まった。今の1歩の終わり（π か 2π）を越えたら、そこで止める
  const stepEnd = phase < Math.PI ? Math.PI : WALK_CYCLE;
  if (next < stepEnd) return next;
  return stepEnd === WALK_CYCLE ? 0 : Math.PI;
}

/**
 * 体の浮き上がり量を求める。1歩ごとに1回弾む。
 * @param phase - 歩く動作の位相
 * @param height - 弾む高さの最大
 * @returns 地面からの浮き上がり（0 〜 height）
 */
export function getWalkBob(phase: number, height: number): number {
  return Math.abs(Math.sin(phase)) * height;
}

/**
 * 手足1つぶんを振る角度を求める。
 *
 * 手足とも付け根を軸に、X軸まわりに回す。左右の足は互い違いに振り、
 * 手はそれぞれ同じ側の足と逆に振る（右足が前なら右手は後ろ）。
 * 手足がそろう位相（0 と π）では、角度は0になる。
 *
 * **Babylon では負の値で手足の先が前（+Z）へ出る**（正だと後ろへ振れる）。
 * @param phase - 歩く動作の位相
 * @param limb - 手足の種類
 * @param side - 体のどちら側か。パーツの `position.x` の符号（-1 か 1）。0 なら振らない
 * @returns X軸まわりの回転（ラジアン）。パーツ定義の回転に足して使う
 */
export function getLimbSwing(phase: number, limb: Limb, side: number): number {
  // この手足が前に出ている量（-1 〜 1）。左右で符号が逆になり、手は足と逆になる
  const forward = Math.sign(side) * Math.sin(phase) * (limb === "foot" ? 1 : -1);
  // 前へ振るときは負の回転
  return -forward * LIMB_SWING_ANGLE[limb];
}
