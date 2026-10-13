import assert from "node:assert/strict";
import test from "node:test";
import { getDecorationPlacement, groundedY } from "../lib/rpg-hub/catalog.ts";
import { FAMILY_NPC_POSTS } from "../lib/rpg-hub/familyNpcs.ts";
import { HOUSE_ZONE_BOUNDS, INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import {
  PLAYER_COLLISION_RADIUS,
  WALKABLE_BOUNDS,
  getCollisionHalfExtents,
  moveWithinMap,
} from "../lib/rpg-hub/movement.ts";
import { canPlaceDecoration } from "../lib/rpg-hub/placement.ts";
import { BEACH_DEPTH, SHORE_Z, WORLD_HALF, isInsideWorld } from "../lib/rpg-hub/worldBounds.ts";

/**
 * 我が家タウンの広さと境界（Issue #194）。
 *
 * 歩ける範囲の判定・置ける範囲の判定・境界の見た目（柵・森・海）が、
 * **すべて worldBounds.ts の同じ値から決まっていること**を確かめる。
 * 以前は歩ける範囲（MAP_LIMIT）と地面の大きさが別々に定義されていて、見えない壁で止まっていた。
 */

const TOWN_OBJECTS = INITIAL_MAP_OBJECTS.filter((object) =>
  isInsideWorld(object.position.x, object.position.z),
);

// --- 歩ける範囲 ---

test("立てる範囲は、境界から当たり判定の半径ぶん内側", () => {
  assert.deepEqual(WALKABLE_BOUNDS, {
    maxX: WORLD_HALF - PLAYER_COLLISION_RADIUS,
    maxZ: WORLD_HALF - PLAYER_COLLISION_RADIUS,
    minX: -WORLD_HALF + PLAYER_COLLISION_RADIUS,
    minZ: -WORLD_HALF + PLAYER_COLLISION_RADIUS,
  });
});

test("4辺のどちらへ歩き続けても、境界の外へは出られない", () => {
  const directions = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
  ];
  for (const direction of directions) {
    // 境界のすぐ手前から、1歩より大きく踏み出す
    const start = { x: direction.x * (WORLD_HALF - 1), z: direction.z * (WORLD_HALF - 1) };
    const result = moveWithinMap(start, { x: direction.x * 3, z: direction.z * 3 });

    assert.ok(result.x >= WALKABLE_BOUNDS.minX && result.x <= WALKABLE_BOUNDS.maxX, `x=${result.x}`);
    assert.ok(result.z >= WALKABLE_BOUNDS.minZ && result.z <= WALKABLE_BOUNDS.maxZ, `z=${result.z}`);
    // 止まるのは境界ぎわ（1ステップぶん以内）で、手前で止まらない
    const reached = Math.abs(direction.x ? result.x : result.z);
    assert.ok(reached > WALKABLE_BOUNDS.maxX - 0.1, `${JSON.stringify(direction)} で手前に止まった: ${reached}`);
  }
});

test("境界にぶつかっても、境界に沿う向きへは滑って進める", () => {
  // 角に引っかからないよう軸ごとに判定する、建物と同じ動き
  const start = { x: WALKABLE_BOUNDS.maxX - 0.05, z: 0 };
  const result = moveWithinMap(start, { x: 1, z: 1 });

  assert.equal(result.x, start.x);
  assert.equal(result.z, 1);
});

test("初期マップの砂浜を北へ歩くと、波打ちぎわで止まる", () => {
  const start = { x: 0, z: SHORE_Z - BEACH_DEPTH + 0.5 };
  const result = moveWithinMap(start, { x: 0, z: 5 }, INITIAL_MAP_OBJECTS);

  assert.equal(result.x, 0);
  assert.ok(result.z <= WALKABLE_BOUNDS.maxZ && result.z > WALKABLE_BOUNDS.maxZ - 0.1, `z=${result.z}`);
});

test("境界ぎわ（立てる範囲の外）に置かれても、内側へは戻れる", () => {
  // 置き直し（placePlayer）や古いデータで外側に立たされても、閉じ込めない
  const start = { x: WORLD_HALF - 0.1, z: 0 };

  assert.deepEqual(moveWithinMap(start, { x: -1, z: 0 }), { x: start.x - 1, z: 0 });
  assert.deepEqual(moveWithinMap(start, { x: 1, z: 0 }), start);
});

test("家の中（町の外にある別の場所）では、町の境界は効かない", () => {
  // 家の中は z = -60 / -90 にあり、壁で囲まれている。境界で止めると一歩も動けなくなる
  for (const [zone, bounds] of Object.entries(HOUSE_ZONE_BOUNDS)) {
    const center = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
    assert.equal(isInsideWorld(center.x, center.z), false, `${zone} が町の中にある`);
    assert.deepEqual(moveWithinMap(center, { x: 0.5, z: 0.5 }), {
      x: center.x + 0.5,
      z: center.z + 0.5,
    });
  }
});

test("家の中・2階の区画は、まるごと町の外にある", () => {
  for (const [zone, bounds] of Object.entries(HOUSE_ZONE_BOUNDS)) {
    const corners = [
      [bounds.minX, bounds.minZ],
      [bounds.minX, bounds.maxZ],
      [bounds.maxX, bounds.minZ],
      [bounds.maxX, bounds.maxZ],
    ];
    for (const [x, z] of corners) {
      assert.equal(isInsideWorld(x, z), false, `${zone} の角 (${x}, ${z}) が町の中にある`);
    }
  }
});

// --- 町の中の物 ---

test("建物と家族の持ち場は、すべて立てる範囲の中にある", () => {
  const buildings = TOWN_OBJECTS.filter((object) => object.type === "building");
  assert.ok(buildings.length > 0);
  for (const building of buildings) {
    const half = getCollisionHalfExtents(building.collisionSize, building.scale ?? 1, building.rotationY ?? 0);
    // 建物の前（扉側）にも人が立てる余白が要る
    assert.ok(Math.abs(building.position.x) + half.width + 2 < WORLD_HALF, building.id);
    assert.ok(Math.abs(building.position.z) + half.depth + 2 < WORLD_HALF, building.id);
  }
  for (const post of FAMILY_NPC_POSTS) {
    assert.ok(isInsideWorld(post.x, post.z), JSON.stringify(post));
  }
});

test("当たり判定を持つ物は、すべて町の中か家の中にある（柵の外の森はすり抜け）", () => {
  for (const object of INITIAL_MAP_OBJECTS) {
    if (!object.collidable) continue;
    const inHouse = Object.values(HOUSE_ZONE_BOUNDS).some(
      (bounds) =>
        object.position.x >= bounds.minX &&
        object.position.x <= bounds.maxX &&
        object.position.z >= bounds.minZ &&
        object.position.z <= bounds.maxZ,
    );
    assert.ok(isInsideWorld(object.position.x, object.position.z) || inHouse, object.id);
  }
});

test("砂浜には散らした自然物が生えていない", () => {
  // 砂浜（波打ちぎわから BEACH_DEPTH）に木が立つと、浜に見えない
  for (const object of TOWN_OBJECTS) {
    if (!object.id.startsWith("scatter-")) continue;
    assert.ok(object.position.z < SHORE_Z - BEACH_DEPTH, `${object.id} が砂浜にある`);
  }
});

// --- 境界の見た目 ---

const fences = INITIAL_MAP_OBJECTS.filter((object) => object.id.startsWith("fence-"));
const FENCE_LENGTH = getDecorationPlacement("decoration-fence").size;

/**
 * 1辺の柵が、端から端まで隙間なく並んでいるかを調べる。
 * @param side - 辺の名前（IDの一部）
 * @param fixedAxis - 柵が並ぶ線の座標軸
 * @param fixed - その線の座標
 */
const assertFenceCoversSide = (side, fixedAxis, fixed) => {
  const alongAxis = fixedAxis === "x" ? "z" : "x";
  const segments = fences
    .filter((object) => object.id.startsWith(`fence-${side}-`))
    .sort((a, b) => a.position[alongAxis] - b.position[alongAxis]);

  assert.ok(segments.length > 0, `${side} に柵がない`);
  for (const segment of segments) assert.equal(segment.position[fixedAxis], fixed, segment.id);

  let covered = -WORLD_HALF;
  for (const segment of segments) {
    const from = segment.position[alongAxis] - FENCE_LENGTH / 2;
    assert.ok(from <= covered + 1e-9, `${side} の ${covered} に隙間がある`);
    covered = segment.position[alongAxis] + FENCE_LENGTH / 2;
  }
  assert.ok(covered >= WORLD_HALF - 1e-9, `${side} の柵が ${covered} で途切れている`);
};

test("柵は西・東・南の3辺の境界線の上に、端から端まで隙間なく並ぶ", () => {
  assertFenceCoversSide("west", "x", -WORLD_HALF);
  assertFenceCoversSide("east", "x", WORLD_HALF);
  assertFenceCoversSide("south", "z", -WORLD_HALF);
});

test("北（海）の辺には柵を置かない", () => {
  assert.ok(fences.every((object) => object.position.z < SHORE_Z));
  assert.ok(fences.every((object) => /^fence-(west|east|south)-/.test(object.id)));
});

test("柵の外の森と茂みは、すべて町の外にあり、当たり判定を持たない", () => {
  const border = INITIAL_MAP_OBJECTS.filter(
    (object) => object.id.startsWith("forest-") || object.id.startsWith("hedge-"),
  );
  assert.ok(border.length > 0);
  for (const object of border) {
    assert.equal(object.collidable, false, object.id);
    assert.equal(object.collisionSize, undefined, object.id);
    // 幹がちょうど柵の上に来ないよう、柵から1以上離す
    const outside = Math.max(Math.abs(object.position.x), Math.abs(object.position.z)) - WORLD_HALF;
    assert.ok(outside >= 1, `${object.id} が柵に近すぎる（${outside}）`);
    // 海へははみ出さない
    assert.ok(object.position.z < SHORE_Z, `${object.id} が海の上にある`);
  }
});

test("柵の外の森は、家の中（町から離れた別の場所）に届かない", () => {
  const border = INITIAL_MAP_OBJECTS.filter(
    (object) => object.id.startsWith("forest-") || object.id.startsWith("hedge-"),
  );
  for (const object of border) {
    for (const [zone, bounds] of Object.entries(HOUSE_ZONE_BOUNDS)) {
      const inside =
        object.position.x >= bounds.minX - 1 &&
        object.position.x <= bounds.maxX + 1 &&
        object.position.z >= bounds.minZ - 1 &&
        object.position.z <= bounds.maxZ + 1;
      assert.ok(!inside, `${object.id} が ${zone} にある`);
    }
  }
});

// --- かざる ---

let counter = 0;
const decoration = (x, z, assetId = "decoration-rock") => {
  const placement = getDecorationPlacement(assetId);
  const solid = placement.solid !== false;
  return {
    collidable: solid,
    ...(solid ? { collisionSize: { depth: placement.size, width: placement.size } } : {}),
    id: `bounds-test-${counter++}`,
    interactive: false,
    model: assetId,
    position: { x, y: groundedY(placement.halfHeight, 1), z },
    type: "decoration",
  };
};

test("町にいるとき、境界からはみ出す場所には置けない（柵の外・海の上）", () => {
  const player = { x: 0, z: WALKABLE_BOUNDS.maxZ };
  // 波打ちぎわを越えた海の上
  assert.equal(canPlaceDecoration(decoration(0, SHORE_Z + 1), TOWN_OBJECTS, player, 0), "blocked");
  // 大きさの半分だけ柵を越える
  const east = { x: WALKABLE_BOUNDS.maxX, z: 0 };
  assert.equal(canPlaceDecoration(decoration(WORLD_HALF - 0.1, 0), TOWN_OBJECTS, east, 0), "blocked");
});

test("踏んで歩けるもの（草むら）も、海の上には置けない", () => {
  const player = { x: 0, z: WALKABLE_BOUNDS.maxZ };
  const grass = decoration(0, SHORE_Z + 1, "decoration-grass");

  assert.equal(canPlaceDecoration(grass, TOWN_OBJECTS, player, 0), "blocked");
});

test("砂浜の上（境界の内側）には置ける", () => {
  const player = { x: 0, z: SHORE_Z - 3 };

  assert.equal(canPlaceDecoration(decoration(0, SHORE_Z - 1.4), TOWN_OBJECTS, player, 0), null);
});

test("柵ぎわに置いて道を塞ぐと、柵の外を回れるとは見なさない", () => {
  // 柵ぎわの建物と、その左右を塞ぐ岩。残りの1か所を塞ぐと、柵の外を回らない限り入口へ行けない
  const building = {
    collidable: true,
    collisionSize: { depth: 2, width: 3 },
    entranceOffset: { x: 0, y: 0, z: -1 },
    id: "edge-building",
    interactionRadius: 3,
    interactive: true,
    model: "building-bank",
    position: { x: 0, y: 1, z: -WORLD_HALF + 4 },
    route: "bank",
    type: "building",
  };
  // 建物の前（北）を囲む壁。西・東・北をふさぎ、北の真ん中だけ開けておく
  const walls = [];
  // 真ん中（x = 0）は、人がやっと通れる幅だけ開けておく
  for (const x of [-3.5, -2.5, -1.5, 1.5, 2.5, 3.5]) walls.push(decoration(x, -WORLD_HALF + 7.5));
  for (let z = -WORLD_HALF + 0.6; z <= -WORLD_HALF + 7.5; z += 1) {
    walls.push(decoration(-4, z));
    walls.push(decoration(4, z));
  }
  const player = { x: 0, z: -WORLD_HALF + 12 };
  const objects = [building, ...walls];

  // 最後の開口部を塞ぐと、入口へは柵の外を回らない限り行けない
  assert.equal(
    canPlaceDecoration(decoration(0, -WORLD_HALF + 7.5), objects, player, 0),
    "unreachable",
  );
});
