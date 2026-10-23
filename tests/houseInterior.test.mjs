// 自分の家の中（Issue #444）。町と同じ3Dシーンの中の部屋を、前後左右に歩き回れること。
import assert from "node:assert/strict";
import test from "node:test";
import {
  getHouseLocation,
  HOUSE_GRID_ORIGIN,
  HOUSE_INTERIOR_OBJECTS,
  HOUSE_ROOM_CENTER,
  HOUSE_ZONE_BOUNDS,
  isOnHouseFloor,
  LEGACY_HOUSE_ZONE_BOUNDS,
} from "../lib/rpg-hub/houseInterior.ts";
import { readFileSync, readdirSync } from "node:fs";
import {
  canPlaceDecoration,
  createDecorationCandidate,
  isPlacementSpotBlocked,
} from "../lib/rpg-hub/placement.ts";
import { INVISIBLE_ASSETS, RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";
import {
  HOUSE_CELL_SIZE,
  HOUSE_ENTRANCE_SIZE,
  HOUSE_ROOM_SIZE,
  HOUSE_WALL_TILE_LENGTH,
} from "../lib/rpg-hub/houseInteriorParts.ts";
import { filterObjectsByLocation, INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import { findNearbyInteractiveId, getBuildingExitPoint, isBlocked } from "../lib/rpg-hub/movement.ts";
import { TELEPORT_DESTINATIONS } from "../lib/rpg-hub/routes.ts";
import { TOWN_CELL_SIZE } from "../lib/rpg-hub/townGrid.ts";

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

/**
 * 当たり判定を持つ物のうち、指定した物と重なっている物のIDを集める。
 * 端が触れているだけ（玄関の出口と左右の見えない壁など）は重なりに数えない。
 * @param target - 調べる物
 * @param solids - 比べる相手（target 自身を含んでいてよい）
 * @returns 重なっている物のID
 */
function overlappingIds(target, solids) {
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
  const EPSILON = 1e-9;
  const boxA = extents(target);
  return solids
    .filter((other) => other.id !== target.id)
    .filter((other) => {
      const boxB = extents(other);
      return (
        boxA.minX < boxB.maxX - EPSILON &&
        boxB.minX < boxA.maxX - EPSILON &&
        boxA.minZ < boxB.maxZ - EPSILON &&
        boxB.minZ < boxA.maxZ - EPSILON
      );
    })
    .map((other) => other.id);
}

const SOLIDS = HOUSE_INTERIOR_OBJECTS.filter((object) => object.collidable && object.collisionSize);
const isWall = (object) => object.id.includes("-wall-");

test("家の中の家具は、壁（見えない壁を含む）にも他の家具にもめり込んでいない", () => {
  // 家具1つずつを、壁を含む当たり判定を持つすべての物と比べる（1R0Uさんレビュー指摘：
  // 以前は並び順のせいで、家具より前に並ぶ壁と一度も比べていなかった）
  const furniture = SOLIDS.filter((object) => !isWall(object));
  assert.ok(furniture.length > 0);
  assert.ok(SOLIDS.some(isWall));
  for (const item of furniture) {
    assert.deepEqual(overlappingIds(item, SOLIDS), [], `${item.id} が重なっている`);
  }
});

test("家具を壁に埋めると、重なりの判定がそれを見つける（判定そのものの確認）", () => {
  const closet = SOLIDS.find((object) => object.id === "house-closet");
  const sunk = { ...closet, position: { ...closet.position, z: closet.position.z - 0.5 } };
  assert.ok(overlappingIds(sunk, SOLIDS).some((id) => id.startsWith("house-wall-back")));
});

test("区画の判定は、部屋の中心で家、町の広場で町を返す", () => {
  assert.equal(getHouseLocation(HOUSE_ROOM_CENTER.x, HOUSE_ROOM_CENTER.z), "house");
  assert.equal(getHouseLocation(0, 0), "town");
});

test("マップのオブジェクトのIDは重ならない", () => {
  const ids = INITIAL_MAP_OBJECTS.map((object) => object.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("新しい部屋は、以前の3Dの家の中（Issue #235）の区画と重ならない", () => {
  // 重なると、そのころ置いた装飾が新しい部屋の中に現れ、入った直後に重なって動けなくなる
  for (const legacy of LEGACY_HOUSE_ZONE_BOUNDS) {
    const overlaps =
      HOUSE_ZONE_BOUNDS.minX < legacy.maxX &&
      legacy.minX < HOUSE_ZONE_BOUNDS.maxX &&
      HOUSE_ZONE_BOUNDS.minZ < legacy.maxZ &&
      legacy.minZ < HOUSE_ZONE_BOUNDS.maxZ;
    assert.equal(overlaps, false, `旧区画 ${JSON.stringify(legacy)} と重なっている`);
  }
});

test("旧区画の装飾を片付けるマイグレーションは、LEGACY_HOUSE_ZONE_BOUNDS と同じ範囲を消す", () => {
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const file = readdirSync(directory).find((name) => name.endsWith("_remove_legacy_house_decorations.sql"));
  assert.ok(file, "マイグレーションが見つからない");
  const sql = readFileSync(new URL(file, directory), "utf8");
  for (const zone of LEGACY_HOUSE_ZONE_BOUNDS) {
    const expected = `position_x between ${zone.minX} and ${zone.maxX} and position_z between ${zone.minZ} and ${zone.maxZ}`;
    assert.ok(sql.includes(expected), `SQL に「${expected}」が無い`);
  }
});

test("家の中では、置く場所が部屋の床の外になると置けない（見えない壁の向こう）", () => {
  const houseObjects = filterObjectsByLocation(INITIAL_MAP_OBJECTS, "house");
  const rightX = HOUSE_ROOM_CENTER.x + HOUSE_ROOM_SIZE.width / 2;
  const frontZ = HOUSE_ROOM_CENTER.z + HOUSE_ROOM_SIZE.depth / 2;
  // 右の見えない壁に接して立ち、壁の向こう（床の外）まで指を引っぱる
  const atRightEdge = { x: rightX - 0.5, z: HOUSE_ROOM_CENTER.z };
  // 手前の見えない壁の向こうへ引っぱったときも同じ
  const atFrontEdge = { x: HOUSE_ROOM_CENTER.x - 3, z: frontZ - 0.5 };
  for (const [player, point] of [
    [atRightEdge, { x: rightX + 1.1, z: atRightEdge.z }],
    [atFrontEdge, { x: atFrontEdge.x, z: frontZ + 1.1 }],
  ]) {
    for (const assetId of [RPG_HUB_ASSETS.lamp, RPG_HUB_ASSETS.grass]) {
      const candidate = createDecorationCandidate(assetId, point);
      assert.equal(isOnHouseFloor(candidate.position.x, candidate.position.z), false);
      assert.equal(canPlaceDecoration(candidate, houseObjects, player, 0), "outside", `${assetId} を床の外に置けてしまう`);
      // 置き場所の目印も「置けない」色になる
      assert.equal(isPlacementSpotBlocked(candidate, houseObjects, player), true);
    }
  }
});

test("中心は床の内側でも、大きい装飾の四角が床の外へはみ出す場所には置けない（1R0Uさんレビュー指摘）", () => {
  const houseObjects = filterObjectsByLocation(INITIAL_MAP_OBJECTS, "house");
  const rightX = HOUSE_ROOM_CENTER.x + HOUSE_ROOM_SIZE.width / 2;
  // 置く場所の中心が、右の縁の 0.3 内側に来るようにする
  const player = { x: rightX - 1.9, z: HOUSE_ROOM_CENTER.z };
  const point = { x: rightX - 0.3, z: HOUSE_ROOM_CENTER.z };

  // 花壇（一辺1.7）は半分の 0.85 が縁を越えてはみ出す
  const flowerbed = createDecorationCandidate(RPG_HUB_ASSETS.flowerbed, point);
  assert.equal(isOnHouseFloor(flowerbed.position.x, flowerbed.position.z), true, "中心は床の内側のはず");
  assert.equal(canPlaceDecoration(flowerbed, houseObjects, player, 0), "outside");
  assert.equal(isPlacementSpotBlocked(flowerbed, houseObjects, player), true);

  // ランプ（一辺0.4）は1マスで、床の内側に収まるマスなら「outside」にはしない。
  // 置く場所はマスへ寄せるので（Issue #445）、縁のマスは部屋の外へはみ出す。1マス内側で確かめる
  const lamp = createDecorationCandidate(RPG_HUB_ASSETS.lamp, { x: point.x - TOWN_CELL_SIZE, z: point.z });
  assert.notEqual(canPlaceDecoration(lamp, houseObjects, player, 0), "outside");
});

test("家の床はマスで割り切れる大きさで、マス目が端で半端に切れない（Issue #477）", () => {
  // 家の中のマスの一辺は、町のマスと同じ（循環を避けて別に持っている値）
  assert.equal(HOUSE_CELL_SIZE, TOWN_CELL_SIZE);
  const cols = HOUSE_ROOM_SIZE.width / TOWN_CELL_SIZE;
  const rows = HOUSE_ROOM_SIZE.depth / TOWN_CELL_SIZE;
  assert.ok(Math.abs(cols - Math.round(cols)) < 1e-9, `横が ${cols} マス`);
  assert.ok(Math.abs(rows - Math.round(rows)) < 1e-9, `奥行きが ${rows} マス`);
  // 壁の1枚も、横・奥行きのどちらでも割り切れる
  for (const length of [HOUSE_ROOM_SIZE.width, HOUSE_ROOM_SIZE.depth]) {
    const tiles = length / HOUSE_WALL_TILE_LENGTH;
    assert.ok(Math.abs(tiles - Math.round(tiles)) < 1e-9, `${length} が壁 ${tiles} 枚ぶん`);
  }
  // 玄関の幅もマスにそろっていて、部屋のまん中の2マスの前に付く
  const entranceLeftCells = (HOUSE_ROOM_CENTER.x - HOUSE_ENTRANCE_SIZE.width / 2 - HOUSE_GRID_ORIGIN.x) / TOWN_CELL_SIZE;
  assert.ok(Math.abs(entranceLeftCells - Math.round(entranceLeftCells)) < 1e-9);
});

test("家の床の端のマスは、どれも床からはみ出さずに置ける。そのすぐ外のマスには置けない（Issue #477）", () => {
  const houseObjects = filterObjectsByLocation(INITIAL_MAP_OBJECTS, "house");
  const cols = Math.round(HOUSE_ROOM_SIZE.width / TOWN_CELL_SIZE);
  const rows = Math.round(HOUSE_ROOM_SIZE.depth / TOWN_CELL_SIZE);
  const cellCenter = (col, row) => ({
    x: HOUSE_GRID_ORIGIN.x + (col + 0.5) * TOWN_CELL_SIZE,
    z: HOUSE_GRID_ORIGIN.z + (row + 0.5) * TOWN_CELL_SIZE,
  });
  // 手前の行・右の列（以前は床の縁をまたいで、置けなかった）
  const edgeCells = [
    ...Array.from({ length: cols }, (_, col) => [col, rows - 1]),
    ...Array.from({ length: rows }, (_, row) => [cols - 1, row]),
  ];
  const player = { x: HOUSE_ROOM_CENTER.x, z: HOUSE_ROOM_CENTER.z };
  for (const [col, row] of edgeCells) {
    const grass = createDecorationCandidate(RPG_HUB_ASSETS.grass, cellCenter(col, row));
    assert.notEqual(canPlaceDecoration(grass, houseObjects, player, 0), "outside", `マス(${col}, ${row}) が床の外になっている`);
  }
  // 床のすぐ外（手前・右）のマスには置けない
  for (const [col, row] of [[2, rows], [cols, 2]]) {
    const grass = createDecorationCandidate(RPG_HUB_ASSETS.grass, cellCenter(col, row));
    assert.equal(canPlaceDecoration(grass, houseObjects, player, 0), "outside", `マス(${col}, ${row}) に置けてしまう`);
  }
});

test("家の中のマスは床の角から数えるので、奥の壁ぎわの行にも置ける（Issue #445）", () => {
  const houseObjects = filterObjectsByLocation(INITIAL_MAP_OBJECTS, "house");
  // いちばん奥の行（z が -80 〜 -79.1）に置く
  const backRowCenterZ = HOUSE_GRID_ORIGIN.z + TOWN_CELL_SIZE / 2;
  const columns = Math.floor(HOUSE_ROOM_SIZE.width / TOWN_CELL_SIZE);
  let placeable = 0;
  for (let col = 0; col < columns; col += 1) {
    const x = HOUSE_GRID_ORIGIN.x + (col + 0.5) * TOWN_CELL_SIZE;
    const player = { x, z: backRowCenterZ + 1.6 };
    const grass = createDecorationCandidate(RPG_HUB_ASSETS.grass, { x, z: backRowCenterZ });
    assert.ok(Math.abs(grass.position.z - backRowCenterZ) < 1e-9, `列${col}: 奥の行に置こうとしている`);
    const rejection = canPlaceDecoration(grass, houseObjects, player, 0);
    // 家具のあるマスには置けないが、床の外として断ることはない
    assert.notEqual(rejection, "outside", `列${col}: 奥の壁ぎわが床の外になっている`);
    if (rejection === null) placeable += 1;
  }
  assert.ok(placeable > 0, "奥の壁ぎわに置けるマスが1つもない");
});

test("家の中でも、床の上なら置ける。町では床の判定をしない", () => {
  const houseObjects = filterObjectsByLocation(INITIAL_MAP_OBJECTS, "house");
  const player = { x: HOUSE_ROOM_CENTER.x, z: HOUSE_ROOM_CENTER.z };
  const candidate = createDecorationCandidate(RPG_HUB_ASSETS.lamp, { x: player.x, z: player.z + 1.6 });
  assert.equal(isOnHouseFloor(candidate.position.x, candidate.position.z), true);
  assert.equal(canPlaceDecoration(candidate, houseObjects, player, 0), null);

  // 町に置くときは、家の床の外であっても「outside」にはしない
  const townObjects = filterObjectsByLocation(INITIAL_MAP_OBJECTS, "town");
  const townCandidate = createDecorationCandidate(RPG_HUB_ASSETS.grass, { x: 20, z: 21.6 });
  assert.notEqual(canPlaceDecoration(townCandidate, townObjects, { x: 20, z: 20 }, 0), "outside");
});
