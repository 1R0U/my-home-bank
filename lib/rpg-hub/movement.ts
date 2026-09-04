import type { MapObject } from "../../types/map";

const MAP_LIMIT = 6;

// Player.tsx の capsuleGeometry 半径（[0.45, 0.7, 8, 16]）に合わせた衝突判定用の半径
export const PLAYER_COLLISION_RADIUS = 0.45;

// 1ステップあたりの移動量の上限。目的地だけを判定すると、移動量が大きい場合に
// 建物をすり抜けられてしまう（トンネリング）ため、建物の最小の幅・奥行きより
// 十分小さい値に区切って各区間ごとに衝突判定する。
const MAX_COLLISION_STEP = 0.1;

/**
 * 値をマップの範囲内にクランプする。
 * @param value - クランプする値
 * @returns -MAP_LIMIT 〜 MAP_LIMIT の範囲内に収めた値
 */
const clamp = (value: number) => Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, value));

/**
 * ページ座標をビュー内のローカル座標に変換する（バーチャルパッド用）。
 * @param pageX - ページのX座標
 * @param pageY - ページのY座標
 * @param viewX - ビューのX座標
 * @param viewY - ビューのY座標
 * @returns ビュー内のローカル座標
 */
export function getLocalTouchPosition(
  pageX: number,
  pageY: number,
  viewX: number,
  viewY: number,
): { x: number; y: number } {
  return { x: pageX - viewX, y: pageY - viewY };
}

/**
 * 指定した座標が建物などの障害物に重なっているかを判定する。
 * @param x - X座標
 * @param z - Z座標
 * @param objects - マップオブジェクト一覧
 * @returns 障害物に重なっている場合は true
 */
function isBlocked(x: number, z: number, objects: readonly MapObject[]): boolean {
  return objects.some((object) => {
    if (!object.collidable || object.type !== "building") return false;
    const halfWidth = object.collisionSize.width / 2 + PLAYER_COLLISION_RADIUS;
    const halfDepth = object.collisionSize.depth / 2 + PLAYER_COLLISION_RADIUS;
    return (
      Math.abs(x - object.position.x) < halfWidth && Math.abs(z - object.position.z) < halfDepth
    );
  });
}

/**
 * プレイヤーの移動を計算する（マップ範囲と障害物の衝突判定付き）。
 * 建物の角にひっかからず壁沿いに滑るように、X軸・Z軸を別々に判定する。
 * @param position - 現在の位置
 * @param delta - 移動量
 * @param objects - マップオブジェクト一覧
 * @returns 移動後の位置
 */
export function moveWithinMap(
  position: { x: number; z: number },
  delta: { x: number; z: number },
  objects: readonly MapObject[] = [],
): { x: number; z: number } {
  const distance = Math.hypot(delta.x, delta.z);
  const steps = Math.max(1, Math.ceil(distance / MAX_COLLISION_STEP));

  // X軸・Z軸を別々に判定することで、建物の角にひっかからず壁沿いに滑るように移動できる。
  // 各ステップの座標は毎回 position/delta から直接算出するため、加算を積み重ねる
  // ことによる浮動小数点誤差が結果に乗らない。
  let x = position.x;
  let z = position.z;
  let blockedX = false;
  let blockedZ = false;

  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps;

    if (!blockedX) {
      const candidateX = clamp(position.x + delta.x * ratio);
      if (isBlocked(candidateX, z, objects)) {
        blockedX = true;
      } else {
        x = candidateX;
      }
    }

    if (!blockedZ) {
      const candidateZ = clamp(position.z + delta.z * ratio);
      if (isBlocked(x, candidateZ, objects)) {
        blockedZ = true;
      } else {
        z = candidateZ;
      }
    }

    if (blockedX && blockedZ) break;
  }

  return { x, z };
}

/**
 * プレイヤーに最も近い、入口が接近範囲(interactionRadius)内にある建物のIDを求める。
 * 候補が複数ある場合はXZ平面上の距離が最短のものを選び、同距離の場合はidの昇順で決定する
 * （docs/RPG_HUB_ARCHITECTURE.md 6.2節）。
 *
 * 現状は建物専用（Issue #125のスコープ）。同節ではNPCも含めた汎用的な
 * nearbyObjectIdとして設計されており、NPCとの会話機能（「話す」ボタン）を
 * 追加する際はこの関数・戻り値の命名を汎用化する必要がある。
 * @param position - プレイヤーの現在位置
 * @param objects - マップオブジェクト一覧
 * @returns 最も近い建物のid。範囲内に建物がなければ null
 */
export function findNearbyBuildingId(
  position: { x: number; z: number },
  objects: readonly MapObject[],
): string | null {
  let closestId: string | null = null;
  let closestDistance = Infinity;

  for (const object of objects) {
    if (object.type !== "building") continue;

    const entranceX = object.position.x + object.entranceOffset.x;
    const entranceZ = object.position.z + object.entranceOffset.z;
    const distance = Math.hypot(position.x - entranceX, position.z - entranceZ);
    if (distance > object.interactionRadius) continue;

    const isCloser = closestId === null || distance < closestDistance;
    const isTie = closestId !== null && distance === closestDistance && object.id < closestId;
    if (isCloser || isTie) {
      closestDistance = distance;
      closestId = object.id;
    }
  }

  return closestId;
}

/**
 * バーチャルパッドのドラッグ量から、プレイヤーの移動量と向きを計算する。
 * @param dragX - ドラッグのX方向の距離
 * @param dragY - ドラッグのY方向の距離
 * @param radius - バーチャルパッドの半径（制限範囲）
 * @param maxStep - 移動量の最大値（フレームあたり）
 * @returns 移動量（x, z）、ノブの表示位置（knobX, knobY）、向き（direction）
 */
export function getJoystickMovement(
  dragX: number,
  dragY: number,
  radius: number,
  maxStep: number,
): {
  direction: "down" | "left" | "right" | "up" | null;
  knobX: number;
  knobY: number;
  x: number;
  z: number;
} {
  const distance = Math.hypot(dragX, dragY);
  if (!Number.isFinite(distance) || distance < 4 || radius <= 0 || maxStep <= 0) {
    return { direction: null, knobX: 0, knobY: 0, x: 0, z: 0 };
  }

  const clampedDistance = Math.min(distance, radius);
  const unitX = dragX / distance;
  const unitY = dragY / distance;
  const strength = clampedDistance / radius;
  const direction = Math.abs(unitX) > Math.abs(unitY)
    ? unitX > 0 ? "right" : "left"
    : unitY > 0 ? "down" : "up";

  return {
    direction,
    knobX: unitX * clampedDistance,
    knobY: unitY * clampedDistance,
    x: unitX * maxStep * strength,
    z: unitY * maxStep * strength,
  };
}
