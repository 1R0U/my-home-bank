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
import { moveWithinMap } from "./movement.ts";

/**
 * 家から離れられる距離。この円の内側にだけ目的地を決める。
 * 広くすると「あの人どこ行った」になるため、画面内に収まる程度にしている。
 */
export const WANDER_RADIUS = 2.5;

/**
 * 歩く速さ（ワールド座標 / ミリ秒）。
 * プレイヤーは 0.12 / 50ms = 2.4 per秒 なので、その約6割。
 * プレイヤーより速いと追いつけず、話しかけられなくなる。
 */
const SPEED_PER_MS = 0.00144;

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
};

/**
 * 角度を -π 〜 π に収める。向きを戻すとき、近いほうに回るために使う。
 * @param angle - ラジアン
 * @returns -π 〜 π に収めた角度
 */
function normalizeAngle(angle: number): number {
  const wrapped = (angle + Math.PI) % (Math.PI * 2);
  return (wrapped < 0 ? wrapped + Math.PI * 2 : wrapped) - Math.PI;
}

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
  const diff = normalizeAngle(state.restRotationY - state.rotationY);
  const maxTurn = TURN_BACK_PER_MS * stepMs;
  if (Math.abs(diff) <= maxTurn) return state.restRotationY;
  return normalizeAngle(state.rotationY + Math.sign(diff) * maxTurn);
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
  const stepMs = Math.min(Math.max(deltaMs, 0), MAX_STEP_MS);

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
    // 目的地の向きではなく**実際に動いた向き**を使う。片方の軸が障害物でふさがれると
    // moveWithinMap はもう一方の軸だけを動かすため、目的地の向きだと壁を向いたまま
    // 横へ滑って見える。
    rotationY: Math.atan2(next.x - state.position.x, next.z - state.position.z),
    target,
  };
}
