// NPCが家のまわりをランダムに歩き回るための計算（Issue #203）。
//
// 設計方針（docs/RPG_HUB_ARCHITECTURE.md 6.3）:
//   NPCの位置の正は WebView 側のゲームループが持ち、RN へは送らない。
//   ここは Babylon に依存しない純粋関数だけを置き、WebView を起動せずに
//   `node --test` で検証できるようにする（moveWithinMap と同じ作り）。
//
// 乱数は引数で受け取る。`Math.random()` を直接呼ぶと、どこへ歩くかをテストで
// 確かめられなくなるため。

import type { MapObject, NpcMapObject } from "../../types/map";
import { turnToward } from "./angles.ts";
import { moveWithinMap } from "./movement.ts";
import { getWalkBob, stepWalkPhase } from "./walkCycle.ts";

/**
 * 家から離れられる距離。この円の内側にだけ目的地を決める。
 * 広くすると「あの人どこ行った」になるため、画面内に収まる程度にしている。
 */
export const WANDER_RADIUS = 2.5;

/**
 * 歩く速さ（ワールド座標 / ミリ秒）。1.44（ワールド座標 / 秒）。
 * プレイヤー（0.18 / 50ms = 3.6 per秒）の4割ほど。**プレイヤーより速くしない。**
 * 速いと追いつけず、話しかけられなくなる。
 * 町の住人はその場で立ち話している体なので、走らせる必要もない。
 */
const SPEED_PER_MS = 0.00144;

/**
 * 手足を振るテンポ（ラジアン / ミリ秒）。位相が π 進むごとに1歩なので、π / 0.009 ≒ 350ms に1歩。
 * 歩く速さ（SPEED_PER_MS）だと1歩あたり約0.5進む勘定で、住人の脚の長さ（0.42）に見合う歩幅になる。
 * **歩く速さを変えたらここも合わせる。** 速さだけ上げると、足を動かさずに滑って見える。
 */
const STEP_SPEED_PER_MS = 0.009;

/**
 * 歩くときに体が弾む高さ（拡大率1の住人の場合）。プレイヤー（playerMotion.ts の BOB_HEIGHT）と同じ。
 * **下げすぎない。** 脚を振り始めた直後は、脚の前後の角が付け根から遠くなって少し下がる。
 * 弾みがそれより小さいと、足の底が地面へ潜る（tests/walkCycle.test.mjs で確かめている）。
 * 住人はマップデータの `scale` で拡大でき、脚の下がり方も同じ倍率で大きくなるので、
 * 弾みにも拡大率を掛ける（`getNpcBodyLift`）。
 */
export const NPC_BOB_HEIGHT = 0.05;

/** 目的地に着いたとみなす距離。 */
const ARRIVE_DISTANCE = 0.12;

/** 立ち止まる時間（ミリ秒）。ばらつかせないと全員が同時に動いて機械っぽくなる。 */
const WAIT_MIN_MS = 1000;
const WAIT_MAX_MS = 3000;

/**
 * 1回の更新で進める時間の上限（ミリ秒）。
 * 画面復帰などで大きな `deltaMs` が来たときに、一気に飛んで壁を抜けるのを防ぐ。
 */
const MAX_STEP_MS = 50;

/** 止まっているときに元の向きへ戻る速さ（ラジアン / ミリ秒）。 */
const TURN_BACK_PER_MS = 0.004;

/**
 * 歩きながら向きを変える速さ（ラジアン / ミリ秒）。半回転に約350ms。
 * プレイヤー（playerMotion.ts）より少し遅くしているのは、歩くのも遅いため。
 */
const TURN_PER_MS = 0.009;

/** 歩き回るNPC1体分の状態。 */
export type NpcWanderState = {
  /** 歩き回る中心。マップデータの位置 */
  home: { x: number; z: number };
  id: string;
  position: { x: number; z: number };
  /** 止まったときに戻る向き。マップデータの rotationY */
  restRotationY: number;
  rotationY: number;
  /** 今の目的地。立ち止まっている間は null */
  target: { x: number; z: number } | null;
  /** 立ち止まる残り時間（ミリ秒）。0以下なら歩いている */
  waitMs: number;
  /**
   * 歩く動作の位相（ラジアン、Issue #377）。手足の振りと体の弾みを決める見た目だけの値で、
   * 位置や当たり判定には関わらない。進め方は walkCycle.ts の `stepWalkPhase`。
   */
  walkPhase: number;
};

/**
 * 立ち止まる時間を決める。
 * @param random - 0以上1未満を返す関数
 * @returns 待ち時間（ミリ秒）
 */
function pickWaitMs(random: () => number): number {
  return WAIT_MIN_MS + random() * (WAIT_MAX_MS - WAIT_MIN_MS);
}

/**
 * 家を中心とした円の中から、次の目的地を決める。
 *
 * 距離に平方根を掛けているのは、円の中で偏りなく散らすため。
 * そのまま乱数を距離に使うと中心付近に集まる。
 * @param home - 家の位置
 * @param random - 0以上1未満を返す関数
 * @returns 目的地
 */
function pickTarget(
  home: { x: number; z: number },
  random: () => number,
): { x: number; z: number } {
  const angle = random() * Math.PI * 2;
  const distance = Math.sqrt(random()) * WANDER_RADIUS;
  return {
    x: home.x + Math.sin(angle) * distance,
    z: home.z + Math.cos(angle) * distance,
  };
}

/**
 * 元の向きへ少しずつ戻した角度を返す。
 * @param state - 現在の状態
 * @param stepMs - 進める時間（ミリ秒）
 * @returns 戻したあとの向き
 */
function turnBack(state: NpcWanderState, stepMs: number): number {
  return turnToward(state.rotationY, state.restRotationY, TURN_BACK_PER_MS * stepMs);
}

/**
 * マップデータのNPCから、歩き回る状態の初期値を作る。
 *
 * 最初から待機に入れておく。全員が同時に歩き出さないよう、待ち時間は乱数で決める。
 * @param npc - マップデータのNPC
 * @param random - 0以上1未満を返す関数
 * @returns 歩き回る状態
 */
export function createNpcWanderState(npc: NpcMapObject, random: () => number): NpcWanderState {
  const rotationY = npc.rotationY ?? 0;
  return {
    home: { x: npc.position.x, z: npc.position.z },
    id: npc.id,
    position: { x: npc.position.x, z: npc.position.z },
    restRotationY: rotationY,
    rotationY,
    target: null,
    waitMs: pickWaitMs(random),
    walkPhase: 0,
  };
}

/**
 * 経過時間ぶんだけ、NPCの歩行を1回進める。
 *
 * 目的地へ着いたとき、または障害物で進めなくなったときは、立ち止まって次の目的地を決める。
 * 進めないまま同じ方向へ押し続けないようにするため。
 *
 * 移動には `moveWithinMap` を使うので、建物・木・岩・他のNPCにはぶつかって止まる。
 * **自分自身は `ignoreId` で判定から外す。** 外さないと自分の当たり判定に阻まれて動けない。
 *
 * @param state - 現在の状態
 * @param deltaMs - 前回からの経過時間（ミリ秒）
 * @param objects - マップオブジェクト一覧（本人を含んでよい）
 * @param random - 0以上1未満を返す関数
 * @returns 次の状態。元の状態は書き換えない
 */
export function stepNpcWander(
  state: NpcWanderState,
  deltaMs: number,
  objects: readonly MapObject[],
  random: () => number,
): NpcWanderState {
  const stepMs = clampStepMs(deltaMs);
  const next = stepWander(state, stepMs, objects, random);
  // 手足を振るかどうかは、実際に進めたかで決める。立ち止まっている間や、
  // 障害物に当たって進めなかったフレームは、今の1歩を終えたところで手足をそろえる
  const moved = next.position.x !== state.position.x || next.position.z !== state.position.z;
  return { ...next, walkPhase: stepWalkPhase(state.walkPhase, stepMs, moved, STEP_SPEED_PER_MS) };
}

/**
 * 歩き回らせずに、手足だけをそろえる（Issue #377）。
 *
 * 会話中や画面遷移中は `stepNpcWander` を呼ばずに住人を止める。そのままだと、
 * 足を振り上げた途中の姿勢で固まるため、こちらで今の1歩を最後まで進めてそろえる。
 * @param state - 現在の状態
 * @param deltaMs - 前回からの経過時間（ミリ秒）
 * @returns 次の状態。位置・向き・目的地は変えない
 */
export function settleNpcWalk(state: NpcWanderState, deltaMs: number): NpcWanderState {
  const walkPhase = stepWalkPhase(state.walkPhase, clampStepMs(deltaMs), false, STEP_SPEED_PER_MS);
  return walkPhase === state.walkPhase ? state : { ...state, walkPhase };
}

/**
 * 今の体の浮き上がり量（ワールド座標）を求める。1歩ごとに1回弾む（Issue #377）。
 *
 * **拡大率を掛ける。** 手足の振りはルートの拡大率（マップデータの `scale`）で一緒に大きくなるのに、
 * 弾みだけ決まった高さのままだと、拡大した住人（およそ1.1倍以上）で足の角が地面へ潜る（PR #378 レビュー対応）。
 * @param state - 現在の状態
 * @param scale - 住人の拡大率（マップデータの `scale`。未指定なら1を渡す）
 * @returns 地面からの浮き上がり（0 〜 NPC_BOB_HEIGHT × scale）
 */
export function getNpcBodyLift(state: Pick<NpcWanderState, "walkPhase">, scale: number): number {
  return getWalkBob(state.walkPhase, NPC_BOB_HEIGHT * scale);
}

/**
 * 1回の更新で進める時間を、0 〜 MAX_STEP_MS に収める。
 * @param deltaMs - 前回からの経過時間（ミリ秒）
 * @returns 進める時間（ミリ秒）
 */
function clampStepMs(deltaMs: number): number {
  return Math.min(Math.max(deltaMs, 0), MAX_STEP_MS);
}

/**
 * 歩き回る位置・向き・目的地を1回進める（`stepNpcWander` の本体）。手足の位相は触らない。
 * @param state - 現在の状態
 * @param stepMs - 進める時間（ミリ秒）。上限で切ってあるもの
 * @param objects - マップオブジェクト一覧（本人を含んでよい）
 * @param random - 0以上1未満を返す関数
 * @returns 次の状態
 */
function stepWander(
  state: NpcWanderState,
  stepMs: number,
  objects: readonly MapObject[],
  random: () => number,
): NpcWanderState {

  // 立ち止まっている間に、向きを元へ戻す
  if (state.waitMs > 0) {
    const waitMs = state.waitMs - stepMs;
    const rotationY = turnBack(state, stepMs);
    if (waitMs > 0) return { ...state, rotationY, waitMs };
    return { ...state, rotationY, target: pickTarget(state.home, random), waitMs: 0 };
  }

  const target = state.target ?? pickTarget(state.home, random);
  const dx = target.x - state.position.x;
  const dz = target.z - state.position.z;
  const distance = Math.hypot(dx, dz);

  if (distance <= ARRIVE_DISTANCE) {
    return { ...state, target: null, waitMs: pickWaitMs(random) };
  }

  const ratio = Math.min(SPEED_PER_MS * stepMs, distance) / distance;
  const next = moveWithinMap(
    state.position,
    { x: dx * ratio, z: dz * ratio },
    objects,
    state.id,
  );

  // 1ミリも進めなかった＝障害物に当たっている。壁へ向かって歩き続けないよう目的地を決め直す
  if (next.x === state.position.x && next.z === state.position.z) {
    return { ...state, target: null, waitMs: pickWaitMs(random) };
  }

  return {
    ...state,
    position: next,
    // 右手系でY軸まわりに回すと、正面(+Z)は (sin, cos) の向きになる。
    //
    // **目的地の向きを使い、そこへ少しずつ回す。** 実際に動いた向きを使って毎フレーム
    // 入れ直すと、プレイヤーに小突かれたり障害物をかすめたりして片方の軸がふさがれた
    // 瞬間に、体が横へ飛ぶ（Issue #214）。目的地の向きなら、ぶつかっても向きは変わらない。
    rotationY: turnToward(state.rotationY, Math.atan2(dx, dz), TURN_PER_MS * stepMs),
    target,
  };
}
