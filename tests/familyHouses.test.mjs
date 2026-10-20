import assert from "node:assert/strict";
import test from "node:test";
import { buildFamilyHouses, FAMILY_HOUSE_LOTS } from "../lib/rpg-hub/familyHouses.ts";
import { FAMILY_NPC_POSTS } from "../lib/rpg-hub/familyNpcs.ts";
import { doorRow, INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import { BUILDING_LOT_CELLS, getBlockedCells, cellRangesOverlap, getObjectCells } from "../lib/rpg-hub/townGrid.ts";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";

/** 持ち場を全部埋めるだけの家族（自分を含めて1人多い）。 */
const fullFamily = Array.from({ length: FAMILY_HOUSE_LOTS.length + 1 }, (_, index) => ({ id: `user-${index}` }));

/** 自分以外の全員が区画に立った状態の家族の家（建物＋道）。 */
const fullHouses = buildFamilyHouses(fullFamily, "user-0");
const fullBuildings = fullHouses.filter((object) => object.type === "building");

/** `FAMILY_NPC_POSTS` を、既にいる住人・NPCと同じ「占めるマスを調べられる物」に変える。 */
const npcObjects = FAMILY_NPC_POSTS.map((post, index) => ({
  collidable: true,
  collisionSize: { depth: 0.7, width: 0.7 },
  id: `npc-probe-${index}`,
  interactive: true,
  model: RPG_HUB_ASSETS.villager,
  position: { x: post.x, y: 0.66, z: post.z },
  rotationY: post.rotationY,
  type: "npc",
}));

test("区画がすべて埋まる人数でも、自分を除いた全員ぶんの家が建つ", () => {
  assert.equal(fullBuildings.length, FAMILY_HOUSE_LOTS.length);
});

test("区画より多い家族は、あふれた人の家を建てない", () => {
  const many = Array.from({ length: FAMILY_HOUSE_LOTS.length + 3 }, (_, index) => ({ id: `user-${index}` }));
  const buildings = buildFamilyHouses(many, "someone-else").filter((object) => object.type === "building");
  assert.equal(buildings.length, FAMILY_HOUSE_LOTS.length);
});

test("自分の家は建てない", () => {
  const houses = buildFamilyHouses(
    [{ id: "me" }, { id: "mom" }],
    "me",
  ).filter((object) => object.type === "building");
  assert.deepEqual(houses.map((house) => house.houseOwnerId), ["mom"]);
});

test("区画は渡した順に割り当てる（自分を飛ばして詰める）", () => {
  const houses = buildFamilyHouses(
    [{ id: "mom" }, { id: "me" }, { id: "dad" }],
    "me",
  ).filter((object) => object.type === "building");

  assert.equal(getObjectCells(houses[0]).col, FAMILY_HOUSE_LOTS[0].col);
  assert.equal(getObjectCells(houses[0]).row, FAMILY_HOUSE_LOTS[0].row);
  assert.equal(getObjectCells(houses[1]).col, FAMILY_HOUSE_LOTS[1].col);
  assert.equal(getObjectCells(houses[1]).row, FAMILY_HOUSE_LOTS[1].row);
});

test("家の建物は、持ち主のidと家であることを持つ", () => {
  const [house] = buildFamilyHouses([{ id: "mom" }], "me").filter((object) => object.type === "building");
  assert.equal(house.houseOwnerId, "mom");
  assert.equal(house.route, "house");
  assert.equal(house.model, RPG_HUB_ASSETS.house);
});

test("家族の家は、4×4マスの区画ちょうどを占める（Issue #445）", () => {
  fullBuildings.forEach((house, index) => {
    assert.deepEqual(getObjectCells(house), {
      col: FAMILY_HOUSE_LOTS[index].col,
      cols: BUILDING_LOT_CELLS,
      grid: "town",
      row: FAMILY_HOUSE_LOTS[index].row,
      rows: BUILDING_LOT_CELLS,
    });
  });
});

test("家族の家は、町の既存の建物・道・自然物の当たり判定に重ならない場所に建つ", () => {
  // 重なっていると、歩いて近づけない・すり抜けられないなど町が壊れる
  const existingBlocked = INITIAL_MAP_OBJECTS.flatMap((object) => getBlockedCells(object));
  for (const house of fullBuildings) {
    const houseBlocked = getBlockedCells(house);
    const overlapping = existingBlocked.filter((range) =>
      houseBlocked.some((houseRange) => cellRangesOverlap(houseRange, range)),
    );
    assert.deepEqual(overlapping, [], `${house.id} が既存の町の物と重なっている`);
  }
});

test("家族の家どうしも重ならない", () => {
  for (const house of fullBuildings) {
    const houseBlocked = getBlockedCells(house);
    const overlapping = fullBuildings.filter((other) => {
      if (other.id === house.id) return false;
      return getBlockedCells(other).some((otherRange) =>
        houseBlocked.some((range) => cellRangesOverlap(range, otherRange)),
      );
    });
    assert.deepEqual(overlapping.map((object) => object.id), [], `${house.id} がほかの家と重なっている`);
  }
});

test("家の正面に足す道は、既存の町の建物・自然物の当たり判定に重ならない", () => {
  const existingBlocked = INITIAL_MAP_OBJECTS.flatMap((object) => getBlockedCells(object));
  const paths = fullHouses.filter((object) => object.type === "decoration" && object.model === RPG_HUB_ASSETS.path);
  assert.ok(paths.length > 0);
  for (const path of paths) {
    const pathBlocked = getBlockedCells(path);
    const overlapping = existingBlocked.filter((range) =>
      pathBlocked.some((pathRange) => cellRangesOverlap(pathRange, range)),
    );
    assert.deepEqual(overlapping, [], `${path.id} が既存の町の物と重なっている`);
  }
});

test("家族の家は、扉の前の行も家族NPCの持ち場に重ならない", () => {
  for (const house of fullBuildings) {
    const houseBlocked = getBlockedCells(house);
    const overlapping = npcObjects.filter((npc) => {
      const npcCells = getObjectCells(npc);
      return npcCells && houseBlocked.some((range) => cellRangesOverlap(range, npcCells));
    });
    assert.deepEqual(overlapping, [], `${house.id} がNPCの持ち場と重なっている`);
  }
});

test("家族の家の扉の前の行は、置けないマスとして予約される（Issue #445）", () => {
  for (const house of fullBuildings) {
    const blocked = getBlockedCells(house);
    assert.equal(blocked.length, 2, `${house.id} の扉の前が予約されていない`);
    const cells = getObjectCells(house);
    const front = blocked[1];
    assert.equal(front.row, cells.row + BUILDING_LOT_CELLS);
    assert.equal(doorRow({ col: cells.col, row: cells.row }), front.row);
  }
});

// --- 置いてある装飾との重なり（1R0Uさんレビュー指摘） ---

test("区画に重なる装飾があれば、その区画は使わない", () => {
  const decorations = [
    {
      collidable: true,
      collisionSize: { depth: 1, width: 1 },
      id: "decoration-on-lot-0",
      interactive: false,
      model: RPG_HUB_ASSETS.tree,
      position: { x: fullBuildings[0].position.x, y: 0, z: fullBuildings[0].position.z },
      type: "decoration",
    },
  ];
  const houses = buildFamilyHouses([{ id: "mom" }, { id: "dad" }], "me", decorations).filter(
    (object) => object.type === "building",
  );

  // 区画0は使わず、区画1から詰めて割り当てる
  assert.equal(houses.length, 2);
  assert.equal(getObjectCells(houses[0]).col, FAMILY_HOUSE_LOTS[1].col);
  assert.equal(getObjectCells(houses[0]).row, FAMILY_HOUSE_LOTS[1].row);
  assert.equal(getObjectCells(houses[1]).col, FAMILY_HOUSE_LOTS[2].col);
});

test("正面の道の位置に重なる装飾があれば、その区画は使わない（1R0Uさんレビュー指摘：扉の前も見る）", () => {
  // 家自体の区画ではなく、正面の道（扉の前の予約行の先）にある飾り。実際に建てた道タイルの
  // 位置をそのまま使うので、座標の計算を手で合わせ直す必要がない
  const [frontPathTile] = fullHouses.filter(
    (object) => object.type === "decoration" && object.model === RPG_HUB_ASSETS.path && object.id.includes(fullFamily[1].id),
  );
  assert.ok(frontPathTile, "区画0の家の正面の道が見つからない");
  const decorations = [
    {
      collidable: true,
      collisionSize: { depth: 1, width: 1 },
      id: "decoration-on-front-path",
      interactive: false,
      model: RPG_HUB_ASSETS.tree,
      position: { ...frontPathTile.position },
      type: "decoration",
    },
  ];
  const houses = buildFamilyHouses([{ id: "mom" }, { id: "dad" }], "me", decorations).filter(
    (object) => object.type === "building",
  );

  assert.equal(houses.length, 2);
  assert.equal(getObjectCells(houses[0]).col, FAMILY_HOUSE_LOTS[1].col);
});

// Issue #445 以降、置けるかはマスを占めるかどうかだけで決める（当たり判定の有無は見ない。
// townGrid.ts の方針）。「かざる」で置ける装飾（getPlaceableDecorations）はどれもマスを占める
// ため、当たり判定が無くても区画は使わない。マスを占めない物（道など、置ける装飾の種類ではない）
// だけが重ならない扱いになる。

test("マスを占めない物（道など）とは重なってよい", () => {
  const decorations = [
    {
      collidable: false,
      id: "decoration-without-cells",
      interactive: false,
      model: RPG_HUB_ASSETS.path,
      position: { x: fullBuildings[0].position.x, y: 0, z: fullBuildings[0].position.z },
      type: "decoration",
    },
  ];
  const houses = buildFamilyHouses([{ id: "mom" }], "me", decorations).filter(
    (object) => object.type === "building",
  );

  assert.equal(houses.length, 1);
  assert.equal(getObjectCells(houses[0]).col, FAMILY_HOUSE_LOTS[0].col);
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
  assert.equal(getObjectCells(houses[0]).col, FAMILY_HOUSE_LOTS[0].col);
});
