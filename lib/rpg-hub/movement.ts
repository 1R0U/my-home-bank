import type { BuildingMapObject, MapObject, NpcMapObject } from "../../types/map";

// 歩ける範囲の上限は設けていない。障害物に当たらない限りどこまでも歩ける。
// 地面メッシュは有限（100×100）だが、WebView 側がプレイヤーに合わせて地面を動かすため、
// 端が見えることはない（webview/rpg-hub/scene.ts）。

// Player.tsx の capsuleGeometry 半径（[0.45, 0.7, 8, 16]）に合わせた衝突判定用の半径
export const PLAYER_COLLISION_RADIUS = 0.45;

// 1ステップあたりの移動量の上限。目的地だけを判定すると、移動量が大きい場合に
// 障害物をすり抜けられてしまう（トンネリング）ため、障害物の最小の幅・奥行きより
// 十分小さい値に区切って各区間ごとに衝突判定する。
// 現在いちばん薄い障害物はいちばん小さい木の当たり判定（0.6 × scale 0.85 ≒ 0.51）なので、
// その半分よりさらに小さくしている。
const MAX_COLLISION_STEP = 0.1;

/**
 * オブジェクトの拡縮率を取り出す。
 * WebView 側はメッシュ全体に `scale` を掛けて描画するため、判定側も同じ値を掛けないと
 * 見た目と当たり判定・入口の位置がずれる（docs/RPG_HUB_ARCHITECTURE.md 5.1節）。
 * @param object - マップオブジェクト
 * @returns 拡縮率。未指定なら1
 */
const getScale = (object: MapObject) => object.scale ?? 1;

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
 * 指定した座標が、ある障害物ひとつに重なっているかを判定する。
 *
 * 対象は `type` ではなく `collidable` と `collisionSize` で決める（Issue #193）。
 * 建物だけを対象にしていたときは、装飾物が `collidable: true` でもすり抜けられた。
 * `collisionSize` を持たないものは大きさが決まらないため、判定対象にしない。
 *
 * `collisionSize` はモデルのローカル座標（未拡縮）の値なので、`scale` を掛けてから使う。
 * @param x - X座標
 * @param z - Z座標
 * @param object - 判定する障害物
 * @returns 重なっている場合は true
 */
function overlapsObject(x: number, z: number, object: MapObject): boolean {
  if (!object.collidable || !object.collisionSize) return false;
  const scale = getScale(object);
  const halfWidth = (object.collisionSize.width * scale) / 2 + PLAYER_COLLISION_RADIUS;
  const halfDepth = (object.collisionSize.depth * scale) / 2 + PLAYER_COLLISION_RADIUS;
  return (
    Math.abs(x - object.position.x) < halfWidth && Math.abs(z - object.position.z) < halfDepth
  );
}

/**
 * 指定した座標が、いずれかの障害物に重なっているかを判定する。
 * @param x - X座標
 * @param z - Z座標
 * @param objects - マップオブジェクト一覧
 * @param ignoreIds - 判定から外すオブジェクトのid
 * @returns 障害物に重なっている場合は true
 */
function isBlocked(
  x: number,
  z: number,
  objects: readonly MapObject[],
  ignoreIds?: ReadonlySet<string>,
): boolean {
  return objects.some(
    (object) => !ignoreIds?.has(object.id) && overlapsObject(x, z, object),
  );
}

/**
 * 判定から外すidを集める。
 *
 * 動かす本人に加えて、**動き出す前からすでに重なっている障害物**も外す。
 * NPCは相手の位置を見ずに歩くのでプレイヤーへ乗り上げることがあり、そのまま判定すると
 * どの向きへ進んでも「障害物の中」になって**一歩も動けなくなる**（Issue #214）。
 * 重なっている相手だけを外せば、抜け出す方向へは動けて、別の壁には止められたままになる。
 * @param position - 現在の位置
 * @param objects - マップオブジェクト一覧
 * @param ignoreId - 動かす本人のid
 * @returns 判定から外すidの集合。外すものが無ければ undefined
 */
function collectIgnoredIds(
  position: { x: number; z: number },
  objects: readonly MapObject[],
  ignoreId?: string,
): ReadonlySet<string> | undefined {
  let ignored: Set<string> | undefined;
  if (ignoreId !== undefined) ignored = new Set([ignoreId]);

  for (const object of objects) {
    if (object.id === ignoreId) continue;
    if (!overlapsObject(position.x, position.z, object)) continue;
    ignored = ignored ?? new Set<string>();
    ignored.add(object.id);
  }
  return ignored;
}

/**
 * 障害物を避けながらの移動を計算する。
 * 建物の角にひっかからず壁沿いに滑るように、X軸・Z軸を別々に判定する。
 *
 * プレイヤーだけでなく、歩き回るNPC（`lib/rpg-hub/npcWander.ts`）からも使う。
 * NPC自身も `objects` に入っているため、`ignoreId` で本人を外さないと**自分の当たり判定に
 * 阻まれて一歩も動けない**。毎フレーム配列を作り直さずに済むよう、引数で渡す形にしている。
 * @param position - 現在の位置
 * @param delta - 移動量
 * @param objects - マップオブジェクト一覧
 * @param ignoreId - 判定から外すオブジェクトのid。動かす本人を指定する
 * @returns 移動後の位置
 */
export function moveWithinMap(
  position: { x: number; z: number },
  delta: { x: number; z: number },
  objects: readonly MapObject[] = [],
  ignoreId?: string,
): { x: number; z: number } {
  const distance = Math.hypot(delta.x, delta.z);
  const steps = Math.max(1, Math.ceil(distance / MAX_COLLISION_STEP));
  const ignoreIds = collectIgnoredIds(position, objects, ignoreId);

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
      const candidateX = position.x + delta.x * ratio;
      if (isBlocked(candidateX, z, objects, ignoreIds)) {
        blockedX = true;
      } else {
        x = candidateX;
      }
    }

    if (!blockedZ) {
      const candidateZ = position.z + delta.z * ratio;
      if (isBlocked(x, candidateZ, objects, ignoreIds)) {
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
 * 接近判定の基準点を求める。
 *
 * 建物は「入口（見た目上の扉）」、NPCは本人の立ち位置を基準にする。
 * 建物だけ基準がずれるのは、扉の前に立ったときに反応してほしいため。
 * `entranceOffset` はモデルのローカル座標なので `scale` を掛ける。
 * @param object - 接近判定の対象
 * @returns 基準点のXZ座標
 */
function getInteractionPoint(object: BuildingMapObject | NpcMapObject): { x: number; z: number } {
  if (object.type !== "building") return { x: object.position.x, z: object.position.z };

  const scale = getScale(object);
  return {
    x: object.position.x + object.entranceOffset.x * scale,
    z: object.position.z + object.entranceOffset.z * scale,
  };
}

/**
 * プレイヤーに最も近い、接近範囲(interactionRadius)内にある `interactive` なオブジェクトを求める。
 *
 * 対象は建物とNPCの両方。候補が複数ある場合はXZ平面上の距離が最短のものを選び、
 * 同距離の場合はidの昇順で決定する（docs/RPG_HUB_ARCHITECTURE.md 6.2節）。
 * 建物とNPCのどちらが選ばれても、**距離だけで決まる**（種類による優先はしない）。
 * 接近したものが建物かNPCかによる動作の違いは、RN側が type を見て分ける。
 *
 * `interactionRadius` はワールド座標の距離なので `scale` を掛けない（設計書5.1節）。
 * @param position - プレイヤーの現在位置
 * @param objects - マップオブジェクト一覧
 * @returns 最も近いオブジェクトのid。範囲内に何も無ければ null
 */
export function findNearbyInteractiveId(
  position: { x: number; z: number },
  objects: readonly MapObject[],
): string | null {
  let closestId: string | null = null;
  let closestDistance = Infinity;

  for (const object of objects) {
    if (object.type !== "building" && object.type !== "npc") continue;

    const point = getInteractionPoint(object);
    const distance = Math.hypot(position.x - point.x, position.z - point.z);
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

/** 建物から出てきたときに、当たり判定のふちからどれだけ離して立たせるか。 */
const BUILDING_EXIT_MARGIN = 0.25;

/**
 * 建物から出てきたときに立つ位置と向きを求める。
 *
 * 扉のある側（`entranceOffset` の向き）へ、**当たり判定の箱を抜けるまで**中心から
 * 伸ばした点を返す。扉の座標そのものだと建物の中になってしまい、そこへ置くと
 * 出た瞬間に動けなくなる。
 *
 * 向きは建物に背を向ける側（出てきた向き）にする。4棟とも扉は +Z を向いているので、
 * カメラに顔が見える向きになる。
 * @param building - 出てくる建物
 * @returns 立ち位置（x, z）と向き（facingY、ラジアン）
 */
export function getBuildingExitPoint(building: BuildingMapObject): {
  facingY: number;
  x: number;
  z: number;
} {
  const scale = getScale(building);
  const offsetLength = Math.hypot(building.entranceOffset.x, building.entranceOffset.z);
  // entranceOffset が原点だと向きが決められないため、+Z（4棟とも扉はこちら）を既定にする
  const dirX = offsetLength > 0 ? building.entranceOffset.x / offsetLength : 0;
  const dirZ = offsetLength > 0 ? building.entranceOffset.z / offsetLength : 1;

  const halfWidth = (building.collisionSize.width * scale) / 2 + PLAYER_COLLISION_RADIUS;
  const halfDepth = (building.collisionSize.depth * scale) / 2 + PLAYER_COLLISION_RADIUS;
  // 中心から扉の向きへ伸ばしたとき、先に抜ける面までの距離
  const reaches: number[] = [];
  if (Math.abs(dirX) > 1e-6) reaches.push(halfWidth / Math.abs(dirX));
  if (Math.abs(dirZ) > 1e-6) reaches.push(halfDepth / Math.abs(dirZ));
  const distance = Math.min(...reaches) + BUILDING_EXIT_MARGIN;

  return {
    // 右手系でY軸まわりに回すと、正面(+Z)は (sin, cos) の向きになる
    facingY: Math.atan2(dirX, dirZ),
    x: building.position.x + dirX * distance,
    z: building.position.z + dirZ * distance,
  };
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
