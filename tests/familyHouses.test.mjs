import assert from "node:assert/strict";
import test from "node:test";
import { buildFamilyHouses, FAMILY_HOUSE_POSTS } from "../lib/rpg-hub/familyHouses.ts";
import { FAMILY_NPC_POSTS } from "../lib/rpg-hub/familyNpcs.ts";
import { INITIAL_MAP_OBJECTS, parseMapObject } from "../lib/rpg-hub/mapObjects.ts";
import { getCollisionHalfExtents, overlapsObject } from "../lib/rpg-hub/movement.ts";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";

/** 持ち場を全部埋めるだけの家族（自分を含めて1人多い）。 */
const fullFamily = Array.from({ length: FAMILY_HOUSE_POSTS.length + 1 }, (_, index) => ({ id: `user-${index}` }));

/** 自分以外の全員が持ち場に立った状態の家族の家（建物＋道）。 */
const fullHouses = buildFamilyHouses(fullFamily, "user-0");
const fullBuildings = fullHouses.filter((object) => object.type === "building");

test("持ち場がすべて埋まる人数でも、自分を除いた全員ぶんの家が建つ", () => {
  assert.equal(fullBuildings.length, FAMILY_HOUSE_POSTS.length);
});

test("持ち場より多い家族は、あふれた人の家を建てない", () => {
  const many = Array.from({ length: FAMILY_HOUSE_POSTS.length + 3 }, (_, index) => ({ id: `user-${index}` }));
  const buildings = buildFamilyHouses(many, "someone-else").filter((object) => object.type === "building");
  assert.equal(buildings.length, FAMILY_HOUSE_POSTS.length);
});

test("自分の家は建てない", () => {
  const houses = buildFamilyHouses(
    [{ id: "me" }, { id: "mom" }],
    "me",
  ).filter((object) => object.type === "building");
  assert.deepEqual(houses.map((house) => house.houseOwnerId), ["mom"]);
});

test("持ち場は渡した順に割り当てる（自分を飛ばして詰める）", () => {
  const houses = buildFamilyHouses(
    [{ id: "mom" }, { id: "me" }, { id: "dad" }],
    "me",
  ).filter((object) => object.type === "building");

  assert.equal(houses[0].position.x, FAMILY_HOUSE_POSTS[0].x);
  assert.equal(houses[0].position.z, FAMILY_HOUSE_POSTS[0].z);
  assert.equal(houses[1].position.x, FAMILY_HOUSE_POSTS[1].x);
  assert.equal(houses[1].position.z, FAMILY_HOUSE_POSTS[1].z);
});

test("家の建物は、持ち主のidと家であることを持つ", () => {
  const [house] = buildFamilyHouses([{ id: "mom" }], "me").filter((object) => object.type === "building");
  assert.equal(house.houseOwnerId, "mom");
  assert.equal(house.route, "house");
  assert.equal(house.model, RPG_HUB_ASSETS.house);
});

test("家族の家は、既存の建物・NPCの持ち場・自然物の当たり判定に重ならない場所に建つ", () => {
  // 重なっていると、歩いて近づけない・すり抜けられないなど町が壊れる
  for (const house of fullBuildings) {
    const overlapping = INITIAL_MAP_OBJECTS.filter((object) => overlapsObject(house.position.x, house.position.z, object));
    assert.deepEqual(
      overlapping.map((object) => object.id),
      [],
      `${house.id}（${house.position.x}, ${house.position.z}）が重なっている`,
    );
  }
});

test("家族の家どうしも重ならない", () => {
  for (const house of fullBuildings) {
    const half = getCollisionHalfExtents(house.collisionSize, house.scale ?? 1, house.rotationY ?? 0);
    const overlapping = fullBuildings.filter((other) => {
      if (other.id === house.id) return false;
      const otherHalf = getCollisionHalfExtents(other.collisionSize, other.scale ?? 1, other.rotationY ?? 0);
      return (
        Math.abs(house.position.x - other.position.x) < half.width + otherHalf.width &&
        Math.abs(house.position.z - other.position.z) < half.depth + otherHalf.depth
      );
    });
    assert.deepEqual(overlapping.map((object) => object.id), [], `${house.id} がほかの家と重なっている`);
  }
});

test("家の正面に足す道は、既存の建物・自然物の当たり判定に重ならない", () => {
  const paths = fullHouses.filter((object) => object.type === "decoration" && object.model === RPG_HUB_ASSETS.path);
  assert.ok(paths.length > 0);
  for (const path of paths) {
    const overlapping = INITIAL_MAP_OBJECTS.filter((object) => overlapsObject(path.position.x, path.position.z, object));
    assert.deepEqual(
      overlapping.map((object) => object.id),
      [],
      `${path.id}（${path.position.x}, ${path.position.z}）が重なっている`,
    );
  }
});

test("家族の家は、NPCの持ち場にも重ならない", () => {
  for (const house of fullBuildings) {
    const half = getCollisionHalfExtents(house.collisionSize, house.scale ?? 1, house.rotationY ?? 0);
    const overlapping = FAMILY_NPC_POSTS.filter(
      (post) => Math.abs(house.position.x - post.x) < half.width + 0.4 && Math.abs(house.position.z - post.z) < half.depth + 0.4,
    );
    assert.deepEqual(overlapping, [], `${house.id} がNPCの持ち場と重なっている`);
  }
});

test("家族の家は、マップデータとして検証を通る", () => {
  for (const house of fullBuildings) {
    const result = parseMapObject(house);
    assert.ok(result.success, `${house.id}: ${result.success ? "" : result.errors.join(", ")}`);
  }
});

// --- 置いてある装飾との重なり（1R0Uさんレビュー指摘） ---

test("持ち場に重なる装飾があれば、その持ち場は使わない", () => {
  const decorations = [
    {
      collidable: true,
      collisionSize: { depth: 1, width: 1 },
      id: "decoration-on-post-0",
      interactive: false,
      model: RPG_HUB_ASSETS.tree,
      position: { x: FAMILY_HOUSE_POSTS[0].x, y: 0, z: FAMILY_HOUSE_POSTS[0].z },
      type: "decoration",
    },
  ];
  const houses = buildFamilyHouses([{ id: "mom" }, { id: "dad" }], "me", decorations).filter(
    (object) => object.type === "building",
  );

  // 持ち場0は使わず、持ち場1から詰めて割り当てる
  assert.equal(houses.length, 2);
  assert.equal(houses[0].position.x, FAMILY_HOUSE_POSTS[1].x);
  assert.equal(houses[0].position.z, FAMILY_HOUSE_POSTS[1].z);
  assert.equal(houses[1].position.x, FAMILY_HOUSE_POSTS[2].x);
});

test("当たり判定の無い装飾（草むらなど）とは重なってよい", () => {
  const decorations = [
    {
      collidable: false,
      id: "grass-on-post-0",
      interactive: false,
      model: RPG_HUB_ASSETS.tree,
      position: { x: FAMILY_HOUSE_POSTS[0].x, y: 0, z: FAMILY_HOUSE_POSTS[0].z },
      type: "decoration",
    },
  ];
  const houses = buildFamilyHouses([{ id: "mom" }], "me", decorations).filter(
    (object) => object.type === "building",
  );

  assert.equal(houses.length, 1);
  assert.equal(houses[0].position.x, FAMILY_HOUSE_POSTS[0].x);
});

test("遠くにある装飾とは重ならない扱いになる", () => {
  const decorations = [
    {
      collidable: true,
      collisionSize: { depth: 1, width: 1 },
      id: "decoration-far-away",
      interactive: false,
      model: RPG_HUB_ASSETS.tree,
      position: { x: 0, y: 0, z: 0 },
      type: "decoration",
    },
  ];
  const houses = buildFamilyHouses([{ id: "mom" }], "me", decorations).filter(
    (object) => object.type === "building",
  );

  assert.equal(houses.length, 1);
  assert.equal(houses[0].position.x, FAMILY_HOUSE_POSTS[0].x);
});
