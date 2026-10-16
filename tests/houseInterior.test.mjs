// 自分の家の中（Issue #444）。町と同じ3Dシーンの中の部屋を、前後左右に歩き回れること。
import assert from "node:assert/strict";
import test from "node:test";
import {
  getHouseLocation,
  HOUSE_INTERIOR_OBJECTS,
  HOUSE_ROOM_CENTER,
  HOUSE_ZONE_BOUNDS,
} from "../lib/rpg-hub/houseInterior.ts";
import { INVISIBLE_ASSETS, RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";
import { HOUSE_ROOM_SIZE } from "../lib/rpg-hub/houseInteriorParts.ts";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import { findNearbyInteractiveId, getBuildingExitPoint, isBlocked } from "../lib/rpg-hub/movement.ts";
import { TELEPORT_DESTINATIONS } from "../lib/rpg-hub/routes.ts";

const buildingByRoute = (route) =>
  INITIAL_MAP_OBJECTS.find((object) => object.type === "building" && object.route === route);

/** 歩いて調べるときの1歩の幅 */
const STEP = 0.25;

/**
 * 立っている位置から、歩いて行ける場所を塗りつぶして集める。
 * 区画（HOUSE_ZONE_BOUNDS）の外へ出たら止める（壁を抜けて外へ出られたことが分かるように）。
 * @param start - 歩き始める位置
 * @returns 行ける場所と、区画の外へ出られたか
 */
function walkFrom(start) {
  const bounds = HOUSE_ZONE_BOUNDS;
  const toKey = (x, z) => `${Math.round(x / STEP)},${Math.round(z / STEP)}`;
  const visited = new Map([[toKey(start.x, start.z), start]]);
  const queue = [start];
  let escaped = false;
  while (queue.length > 0) {
    const point = queue.pop();
    if (point.x < bounds.minX || point.x > bounds.maxX || point.z < bounds.minZ || point.z > bounds.maxZ) {
      escaped = true;
      continue;
    }
    for (const [dx, dz] of [
      [STEP, 0],
      [-STEP, 0],
      [0, STEP],
      [0, -STEP],
    ]) {
      const next = { x: point.x + dx, z: point.z + dz };
      const key = toKey(next.x, next.z);
      if (visited.has(key) || isBlocked(next.x, next.z, INITIAL_MAP_OBJECTS)) continue;
      visited.set(key, next);
      queue.push(next);
    }
  }
  return { escaped, points: [...visited.values()] };
}

test("町の家に入ると玄関の前に着き、奥を向いている。玄関から出ると町の家の前に着く", () => {
  const door = buildingByRoute(TELEPORT_DESTINATIONS.house);
  const entry = getBuildingExitPoint(door);
  assert.equal(getHouseLocation(entry.x, entry.z), "house");
  assert.equal(isBlocked(entry.x, entry.z, INITIAL_MAP_OBJECTS), false, "着いた場所が何かに重なっている");
  // 着いてすぐ、玄関のボタン（そとへ でる）が出る
  assert.equal(findNearbyInteractiveId(entry, INITIAL_MAP_OBJECTS), door.id);
  // 手前から奥（-Z）へ向かって入っていく
  assert.ok(Math.abs(Math.abs(entry.facingY) - Math.PI) < 1e-9, `向きが奥ではない（${entry.facingY}）`);

  const town = getBuildingExitPoint(buildingByRoute(TELEPORT_DESTINATIONS.exit));
  assert.equal(getHouseLocation(town.x, town.z), "town");
});

test("玄関は部屋の手前の真ん中から飛び出していて、クローゼットは奥の壁にある", () => {
  const door = buildingByRoute("exit");
  const closet = buildingByRoute("wardrobe");
  const roomFrontZ = HOUSE_ROOM_CENTER.z + HOUSE_ROOM_SIZE.depth / 2;
  // 入ってすぐ立つ場所も、出口も、四角い部屋の手前の辺より外（飛び出した玄関の中）にある
  const entry = getBuildingExitPoint(door);
  assert.ok(entry.z > roomFrontZ, "入ったときの立ち位置が、飛び出した玄関の中にない");
  assert.ok(door.position.z > roomFrontZ, "出口が部屋の手前の辺より外にない");
  assert.equal(door.position.x, HOUSE_ROOM_CENTER.x, "玄関が手前の真ん中にない");
  assert.ok(closet.position.z < HOUSE_ROOM_CENTER.z, "クローゼットが奥（-Z）にない");
});

test("部屋の手前と右には、床とマットのほかに見える物を置かない（シルバニアファミリーの家のように開けておく）", () => {
  const roomFrontZ = HOUSE_ROOM_CENTER.z + HOUSE_ROOM_SIZE.depth / 2;
  const roomRightX = HOUSE_ROOM_CENTER.x + HOUSE_ROOM_SIZE.width / 2;
  const allowed = new Set([RPG_HUB_ASSETS.houseEntranceFloor, RPG_HUB_ASSETS.houseMat]);
  const visibleOnNearSides = HOUSE_INTERIOR_OBJECTS.filter(
    (object) =>
      (object.position.z > roomFrontZ || object.position.x > roomRightX) &&
      !INVISIBLE_ASSETS.has(object.model) &&
      !allowed.has(object.model),
  );
  assert.deepEqual(
    visibleOnNearSides.map((object) => object.id),
    [],
  );
  // 見える壁は奥と左だけ
  for (const wall of HOUSE_INTERIOR_OBJECTS.filter((object) => object.model === RPG_HUB_ASSETS.houseWall)) {
    assert.ok(
      wall.position.z < HOUSE_ROOM_CENTER.z - HOUSE_ROOM_SIZE.depth / 2 ||
        wall.position.x < HOUSE_ROOM_CENTER.x - HOUSE_ROOM_SIZE.width / 2,
      `${wall.id} が奥・左以外にある`,
    );
  }
});

test("家の中は前後左右に歩けて、壁の外へは出られず、機能のある家具すべての前まで行ける", () => {
  const entry = getBuildingExitPoint(buildingByRoute(TELEPORT_DESTINATIONS.house));
  const { escaped, points } = walkFrom(entry);
  assert.equal(escaped, false, "壁・見えない壁・玄関を抜けて外へ出られる");

  // 前後（z）にも左右（x）にも、それなりの広さを歩ける（真横から見ていた頃は左右だけだった）
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  assert.ok(Math.max(...xs) - Math.min(...xs) >= 8, "左右に歩ける幅が狭い");
  assert.ok(Math.max(...zs) - Math.min(...zs) >= 4, "前後に歩ける幅が狭い");

  const buildings = HOUSE_INTERIOR_OBJECTS.filter((object) => object.type === "building");
  assert.ok(buildings.length > 0);
  for (const building of buildings) {
    const front = getBuildingExitPoint(building);
    const reachable = points.some((point) => Math.hypot(point.x - front.x, point.z - front.z) <= STEP);
    assert.ok(reachable, `${building.id} の前まで歩いて行けない`);
    assert.equal(findNearbyInteractiveId(front, INITIAL_MAP_OBJECTS), building.id);
  }
});

test("家の中の機能のある家具は、そとへ・きがえの2つで、名札が付いている", () => {
  const tags = HOUSE_INTERIOR_OBJECTS.filter((object) => object.type === "building")
    .map((object) => `${object.route}:${object.tag}`)
    .sort();
  assert.deepEqual(tags, ["exit:そとへ", "wardrobe:きがえ"]);
});

test("家の中の物は、どれも家の区画の中にあり、町の家は町にある", () => {
  for (const object of HOUSE_INTERIOR_OBJECTS) {
    assert.equal(getHouseLocation(object.position.x, object.position.z), "house", `${object.id} が家の外にある`);
  }
  const house = buildingByRoute("house");
  assert.equal(getHouseLocation(house.position.x, house.position.z), "town");
});

test("家の中の家具は、壁にも他の家具にもめり込んでいない", () => {
  // 当たり判定を持つ家具の四角が、壁や他の家具の四角と重なっていないかを調べる
  const solids = HOUSE_INTERIOR_OBJECTS.filter((object) => object.collidable && object.collisionSize);
  const extents = (object) => {
    const sideways = Math.abs(Math.sin(object.rotationY ?? 0)) > 0.5;
    const width = sideways ? object.collisionSize.depth : object.collisionSize.width;
    const depth = sideways ? object.collisionSize.width : object.collisionSize.depth;
    return {
      maxX: object.position.x + width / 2,
      maxZ: object.position.z + depth / 2,
      minX: object.position.x - width / 2,
      minZ: object.position.z - depth / 2,
    };
  };
  const isWall = (object) => object.id.includes("-wall-");
  // 端が触れているだけ（玄関と両隣の壁）は重なりに数えない
  const EPSILON = 1e-9;
  for (const [index, a] of solids.entries()) {
    if (isWall(a)) continue;
    for (const b of solids.slice(index + 1)) {
      const boxA = extents(a);
      const boxB = extents(b);
      const overlaps =
        boxA.minX < boxB.maxX - EPSILON &&
        boxB.minX < boxA.maxX - EPSILON &&
        boxA.minZ < boxB.maxZ - EPSILON &&
        boxB.minZ < boxA.maxZ - EPSILON;
      assert.equal(overlaps, false, `${a.id} と ${b.id} が重なっている`);
    }
  }
});

test("区画の判定は、部屋の中心で家、町の広場で町を返す", () => {
  assert.equal(getHouseLocation(HOUSE_ROOM_CENTER.x, HOUSE_ROOM_CENTER.z), "house");
  assert.equal(getHouseLocation(0, 0), "town");
});

test("マップのオブジェクトのIDは重ならない", () => {
  const ids = INITIAL_MAP_OBJECTS.map((object) => object.id);
  assert.equal(new Set(ids).size, ids.length);
});
