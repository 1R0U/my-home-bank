import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";
import { getBuildingParts, getDecorationPlacement, getPlaceableDecorations } from "../lib/rpg-hub/catalog.ts";
import { HOUSE_FURNITURE_SHAPES } from "../lib/rpg-hub/houseInteriorParts.ts";
import { checkFurnitureChange, rotateQuarterTurn } from "../lib/rpg-hub/decorationEdit.ts";
import {
  applyFurnitureLayouts,
  findEditableAt,
  getFurnitureCells,
  getFurnitureRotationCenter,
  isEditableId,
  isFurnitureSpotBlocked,
  isMovableFurnitureId,
  isStorableFurnitureId,
  MOVABLE_FURNITURE_IDS,
  placeFurnitureAt,
  STORED_FURNITURE_ASSETS,
} from "../lib/rpg-hub/houseFurniture.ts";
import { HOUSE_GRID_ORIGIN, HOUSE_ROOM_CENTER } from "../lib/rpg-hub/houseInterior.ts";
import { filterObjectsByLocation, INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import { findNearbyInteractiveId, getBuildingExitPoint } from "../lib/rpg-hub/movement.ts";
import { createDecorationCandidate } from "../lib/rpg-hub/placementSpot.ts";
import { getBlockedCells, getObjectCells, TOWN_CELL_SIZE } from "../lib/rpg-hub/townGrid.ts";

/**
 * 家の中の家具（クローゼット）を、かざるの編集モードで動かす・回す（Issue #477）。
 *
 * 家具は長方形（クローゼットは横2 × 奥行き1マス）で、回すと占めるマスが変わる。
 * いちばん大事なのは、**どう動かしても、きがえ（クローゼットの正面）に行けなくならないこと**。
 */

const CLOSET = INITIAL_MAP_OBJECTS.find((object) => object.id === "house-closet");
const SOFA = INITIAL_MAP_OBJECTS.find((object) => object.id === "house-sofa");
const PLANT = INITIAL_MAP_OBJECTS.find((object) => object.id === "house-plant");
const HOUSE_OBJECTS = filterObjectsByLocation(INITIAL_MAP_OBJECTS, "house");
/** 家の中のプレイヤー。部屋のまん中より少し手前に立たせる */
const PLAYER = { x: HOUSE_ROOM_CENTER.x, z: HOUSE_ROOM_CENTER.z + 2.5 };

/**
 * 家の中のマスの中心。
 * @param col - 列
 * @param row - 行
 */
const cellCenter = (col, row) => ({
  x: HOUSE_GRID_ORIGIN.x + (col + 0.5) * TOWN_CELL_SIZE,
  z: HOUSE_GRID_ORIGIN.z + (row + 0.5) * TOWN_CELL_SIZE,
});

/** 数がほぼ同じか */
const near = (a, b) => Math.abs(a - b) < 1e-9;

test("動かせる家具はクローゼット・ソファ・植木で、DBの一覧（house_furniture_items）と同じ", () => {
  assert.deepEqual(MOVABLE_FURNITURE_IDS, ["house-closet", "house-sofa", "house-plant"]);
  for (const id of MOVABLE_FURNITURE_IDS) assert.ok(isMovableFurnitureId(id), id);
  // 置いた装飾と家具は選べる。窓・玄関や町の物は選べない
  assert.ok(isEditableId("placed-abc"));
  assert.ok(isEditableId("house-closet"));
  assert.ok(isEditableId("house-sofa"));
  assert.ok(!isEditableId("house-window"));
  assert.ok(!isEditableId("house-door"));

  // DBの一覧と、しまったときに持ち物へ入る装飾の対応がアプリと同じ（Issue #506）
  const sql = readFileSync("supabase/migrations/20261024162418_store_house_furniture.sql", "utf8");
  const insert = sql.match(/insert into public\.house_furniture_items\(furniture_id, stored_asset_id\) values([\s\S]*?);/);
  assert.ok(insert, "house_furniture_items の insert が見つからない");
  const rows = [...insert[1].matchAll(/\('([^']+)', (?:null|'([^']+)')\)/g)].map((match) => [match[1], match[2] ?? null]);
  assert.deepEqual(rows.map((row) => row[0]).sort(), [...MOVABLE_FURNITURE_IDS].sort());
  assert.deepEqual(Object.fromEntries(rows.filter((row) => row[1] !== null)), STORED_FURNITURE_ASSETS);
});

test("ソファ・植木はしまえて、しまうと入る装飾は「かざる」で置ける。クローゼットはしまえない（Issue #506）", () => {
  assert.ok(isStorableFurnitureId("house-sofa"));
  assert.ok(isStorableFurnitureId("house-plant"));
  assert.ok(!isStorableFurnitureId("house-closet"), "きがえに使うので、しまえない");
  assert.ok(!isStorableFurnitureId("toString"), "Object の持ち物の名前で、しまえる扱いにならない");
  const placeable = getPlaceableDecorations();
  for (const assetId of Object.values(STORED_FURNITURE_ASSETS)) {
    assert.ok(placeable.includes(assetId), `${assetId} を置けない`);
  }
  // 置いた装飾としてのソファは 2×2 マスに収まる（装飾は正方形のマスを占める）
  assert.equal(getDecorationPlacement("decoration-sofa").cells, 2);
  assert.ok(getDecorationPlacement("decoration-sofa").size <= 2 * TOWN_CELL_SIZE);
});

test("ソファは横2 × 奥行き1マス、植木は1マスを占め、最初の位置もマスにそろっている（Issue #506）", () => {
  assert.deepEqual(getFurnitureCells(SOFA), { cols: 2, rows: 1 });
  assert.deepEqual(getFurnitureCells(PLANT), { cols: 1, rows: 1 });
  for (const furniture of [SOFA, PLANT]) {
    // 持ち上げて同じマスへ下ろしただけで動かない
    const again = placeFurnitureAt(furniture, furniture.position, 0);
    assert.ok(near(again.position.x, furniture.position.x), furniture.id);
    assert.ok(near(again.position.z, furniture.position.z), furniture.id);
  }
  // 最初の位置で、家具どうしのマスが重ならない
  const furnitures = [CLOSET, SOFA, PLANT];
  for (let a = 0; a < furnitures.length; a += 1) {
    for (let b = a + 1; b < furnitures.length; b += 1) {
      const [p, q] = [getObjectCells(furnitures[a]), getObjectCells(furnitures[b])];
      const overlap = p.col < q.col + q.cols && q.col < p.col + p.cols && p.row < q.row + q.rows && q.row < p.row + p.rows;
      assert.ok(!overlap, `${furnitures[a].id} と ${furnitures[b].id} が重なる`);
    }
  }
});

test("クローゼットは横2 × 奥行き1マスを占め、最初の位置もマスにそろっている", () => {
  assert.deepEqual(getFurnitureCells(CLOSET), { cols: 2, rows: 1 });
  const cells = getObjectCells(CLOSET);
  assert.equal(cells.grid, "house");
  assert.equal(cells.cols, 2);
  assert.equal(cells.rows, 1);
  // 同じ場所へ置き直しても位置は変わらない（持ち上げて同じマスへ下ろしただけで動かない）
  const again = placeFurnitureAt(CLOSET, CLOSET.position, 0);
  assert.ok(near(again.position.x, CLOSET.position.x));
  assert.ok(near(again.position.z, CLOSET.position.z));
});

test("回すと横と奥行きが入れ替わり、正面（きがえるときに立つ所）も一緒に回る", () => {
  const turned = placeFurnitureAt(CLOSET, cellCenter(5, 4), Math.PI / 2);

  assert.deepEqual(getFurnitureCells(turned), { cols: 1, rows: 2 });
  const cells = getObjectCells(turned);
  assert.equal(cells.cols, 1);
  assert.equal(cells.rows, 2);
  // 最初は +Z（部屋の手前）を向いている。90度回すと +X を向く
  assert.ok(CLOSET.entranceOffset.z > 0 && near(CLOSET.entranceOffset.x, 0));
  assert.ok(turned.entranceOffset.x > 0 && near(turned.entranceOffset.z, 0));
  assert.ok(near(Math.hypot(turned.entranceOffset.x, turned.entranceOffset.z), Math.hypot(CLOSET.entranceOffset.x, CLOSET.entranceOffset.z)));
  // 回した正面の側に立つと、「きがえる」の相手になる。裏側に立っても相手にならない
  const exit = getBuildingExitPoint(turned);
  assert.ok(exit.x > turned.position.x);
  assert.equal(findNearbyInteractiveId(exit, [turned]), turned.id);
  assert.equal(findNearbyInteractiveId({ x: turned.position.x - 1.6, z: turned.position.z }, [turned]), null);
});

test("その場で4回まわすと、向きも位置も元に戻る（まわすたびにずれていかない。CodeRabbitレビュー指摘）", () => {
  let rotation = 0;
  let current = placeFurnitureAt(CLOSET, cellCenter(6, 4), 0);
  const start = current;
  const pivotCells = getObjectCells(start);
  for (let index = 0; index < 4; index += 1) {
    rotation = rotateQuarterTurn(rotation);
    current = placeFurnitureAt(current, getFurnitureRotationCenter(current, rotation), rotation);
    // 軸のマス（回す前の、正面から見て右奥のマス）は、どの向きでも占めたまま
    const cells = getObjectCells(current);
    const pivot = { col: pivotCells.col + pivotCells.cols - 1, row: pivotCells.row };
    assert.ok(
      pivot.col >= cells.col && pivot.col < cells.col + cells.cols && pivot.row >= cells.row && pivot.row < cells.row + cells.rows,
      `${index + 1}回目: 軸のマスから外れた`,
    );
  }
  assert.ok(near(current.position.x, start.position.x), `x が ${start.position.x} → ${current.position.x}`);
  assert.ok(near(current.position.z, start.position.z), `z が ${start.position.z} → ${current.position.z}`);
  assert.ok(near(current.entranceOffset.x, start.entranceOffset.x));
  assert.ok(near(current.entranceOffset.z, start.entranceOffset.z));
});

test("正面のマスは、ほかの物を置けないマスとして予約する（家具の前に装飾を置いて、きがえられなくしない）", () => {
  const blocked = getBlockedCells(CLOSET);
  assert.equal(blocked.length, 2);
  const [cells, front] = blocked;
  // 正面（+Z）のすぐ外の1列
  assert.deepEqual(front, { ...cells, row: cells.row + 1, rows: 1 });
});

test("保存されている位置と向きをマップに反映する。動かせない家具の行は無視する", () => {
  const point = cellCenter(8, 4);
  const sofaPoint = { x: HOUSE_GRID_ORIGIN.x + 3 * TOWN_CELL_SIZE, z: cellCenter(0, 6).z };
  const objects = applyFurnitureLayouts(INITIAL_MAP_OBJECTS, [
    { furnitureId: "house-closet", rotationY: Math.PI, x: point.x, z: point.z },
    { furnitureId: "house-sofa", rotationY: 0, x: sofaPoint.x, z: sofaPoint.z },
    { furnitureId: "house-window", rotationY: 0, x: 0, z: 0 },
  ]);
  const closet = objects.find((object) => object.id === "house-closet");
  const sofa = objects.find((object) => object.id === "house-sofa");
  const windowObject = objects.find((object) => object.id === "house-window");

  assert.ok(near(closet.rotationY, Math.PI));
  assert.ok(closet.entranceOffset.z < 0, "180度回すと奥（-Z）を向く");
  assert.equal(getObjectCells(sofa).row, 6, "ソファも保存した位置へ動く");
  assert.deepEqual(windowObject, INITIAL_MAP_OBJECTS.find((object) => object.id === "house-window"));
  // 行が無ければ、元の一覧と同じ
  assert.deepEqual(applyFurnitureLayouts(INITIAL_MAP_OBJECTS, []), INITIAL_MAP_OBJECTS);
});

test("しまった家具は家の中に出さない。クローゼットは印が付いていても消さない（Issue #506）", () => {
  const objects = applyFurnitureLayouts(INITIAL_MAP_OBJECTS, [
    { furnitureId: "house-sofa", rotationY: 0, stored: true, x: 0, z: 0 },
    { furnitureId: "house-closet", rotationY: 0, stored: true, x: CLOSET.position.x, z: CLOSET.position.z },
  ]);

  assert.equal(objects.some((object) => object.id === "house-sofa"), false);
  assert.equal(objects.some((object) => object.id === "house-plant"), true, "しまっていない植木は残る");
  assert.equal(objects.some((object) => object.id === "house-closet"), true, "きがえられなくならない");
  assert.equal(objects.length, INITIAL_MAP_OBJECTS.length - 1);
});

test("クローゼットの正面のマットは形の一部で、物を置けない正面のマスにぴったり収まる", () => {
  // 別の物にすると、持ち上げて動かしている間や回したときに、マットだけ置いてきぼりになる
  assert.equal(INITIAL_MAP_OBJECTS.some((object) => object.id === "mat-house-closet"), false);
  const matParts = getBuildingParts(CLOSET.model).filter(
    (part) => part.shape === "box" && part.position.z > HOUSE_FURNITURE_SHAPES.closet.depth / 2 && part.height < 0.05,
  );
  assert.ok(matParts.length > 0, "マットのパーツが無い");
  const [cells, front] = getBlockedCells(CLOSET);
  const frontCenterZ = HOUSE_GRID_ORIGIN.z + (front.row + 0.5) * TOWN_CELL_SIZE;
  for (const part of matParts) {
    // 家具の中心から見て、正面のマスの真ん中に敷いてあり、そのマスからはみ出さない
    assert.ok(near(CLOSET.position.z + part.position.z, frontCenterZ));
    assert.ok(part.width <= front.cols * TOWN_CELL_SIZE && part.depth <= TOWN_CELL_SIZE);
  }
  assert.equal(cells.cols, front.cols);
  // マットを足しても、当たり判定の横幅は本体のまま
  assert.ok(near(CLOSET.collisionSize.width, 1.6));
});

test("部屋の空いている所へは、クローゼットを動かせる", () => {
  const result = checkFurnitureChange("house-closet", cellCenter(3, 4), 0, INITIAL_MAP_OBJECTS, PLAYER);

  assert.equal(result.rejection, null);
  assert.equal(result.candidate.id, "house-closet");
  assert.equal(result.candidate.route, "wardrobe");
});

test("その場で回せる（向きだけ変える）", () => {
  const result = checkFurnitureChange("house-closet", CLOSET.position, Math.PI / 2, INITIAL_MAP_OBJECTS, PLAYER);

  assert.equal(result.rejection, null);
  assert.ok(near(result.candidate.rotationY, Math.PI / 2));
});

test("最初の位置（奥の壁ぎわ）で90度まわすと、部屋の内側へ伸びる向きになり、回せる", () => {
  const center = getFurnitureRotationCenter(CLOSET, Math.PI / 2);
  const result = checkFurnitureChange("house-closet", center, Math.PI / 2, INITIAL_MAP_OBJECTS, PLAYER);

  assert.equal(result.rejection, null);
  const cells = getObjectCells(result.candidate);
  assert.equal(cells.row, getObjectCells(CLOSET).row, "奥の壁ぎわの行から、手前へ伸びる");
  assert.equal(cells.rows, 2);
});

test("奥の壁へ正面を向けると、きがえる場所が無くなるので回せない", () => {
  // 奥の壁ぎわの行で180度回すと、正面のマスが壁の向こう（床の外）になる
  const result = checkFurnitureChange("house-closet", CLOSET.position, Math.PI, INITIAL_MAP_OBJECTS, PLAYER);

  assert.notEqual(result.rejection, null);
});

test("ほかの家具・置いた装飾・床の外には動かせない", () => {
  const sofa = INITIAL_MAP_OBJECTS.find((object) => object.id === "house-sofa");
  assert.notEqual(checkFurnitureChange("house-closet", sofa.position, 0, INITIAL_MAP_OBJECTS, PLAYER).rejection, null);

  const rock = { ...createDecorationCandidate(RPG_HUB_ASSETS.rock, cellCenter(3, 4)), id: "placed-rock" };
  const withRock = [...INITIAL_MAP_OBJECTS, rock];
  assert.equal(checkFurnitureChange("house-closet", cellCenter(3, 4), 0, withRock, PLAYER).rejection, "blocked");

  const outside = { x: HOUSE_GRID_ORIGIN.x + 14 * TOWN_CELL_SIZE + 1, z: HOUSE_ROOM_CENTER.z };
  assert.notEqual(checkFurnitureChange("house-closet", outside, 0, INITIAL_MAP_OBJECTS, PLAYER).rejection, null);
});

test("正面のマスに置いた装飾があると、そこへは動かせない", () => {
  // クローゼットを (3, 4)〜(4, 4) に置くと、正面は (3, 5)〜(4, 5)。そこに草むらを置いておく
  const grass = { ...createDecorationCandidate(RPG_HUB_ASSETS.grass, cellCenter(4, 5)), id: "placed-grass" };
  const result = checkFurnitureChange("house-closet", cellCenter(3, 4), 0, [...INITIAL_MAP_OBJECTS, grass], PLAYER);

  assert.equal(result.rejection, "blocked");
  // 目印の色の判定（軽い判定）も同じく置けないと出す
  const candidate = placeFurnitureAt(CLOSET, cellCenter(3, 4), 0);
  assert.equal(isFurnitureSpotBlocked(candidate, [...HOUSE_OBJECTS, grass], PLAYER), true);
});

test("自分が立っている所には動かせない", () => {
  const result = checkFurnitureChange("house-closet", PLAYER, 0, INITIAL_MAP_OBJECTS, PLAYER);

  assert.notEqual(result.rejection, null);
});

test("動かせる家具でなければ断る", () => {
  assert.equal(checkFurnitureChange("house-window", cellCenter(3, 4), 0, INITIAL_MAP_OBJECTS, PLAYER).rejection, "blocked");
  assert.equal(checkFurnitureChange("house-missing", cellCenter(3, 4), 0, INITIAL_MAP_OBJECTS, PLAYER).candidate, null);
});

test("ソファ・植木も部屋の空いている所へ動かせ、回せる。ほかの家具の上には動かせない（Issue #506）", () => {
  const moved = checkFurnitureChange("house-sofa", cellCenter(3, 5), 0, INITIAL_MAP_OBJECTS, PLAYER);
  assert.equal(moved.rejection, null);
  assert.equal(moved.candidate.type, "decoration", "飾りの家具のまま");
  assert.equal(getObjectCells(moved.candidate).rows, 1);

  const center = getFurnitureRotationCenter(SOFA, Math.PI / 2);
  const turned = checkFurnitureChange("house-sofa", center, Math.PI / 2, INITIAL_MAP_OBJECTS, PLAYER);
  assert.equal(turned.rejection, null);
  assert.deepEqual(getFurnitureCells(turned.candidate), { cols: 1, rows: 2 });

  assert.equal(checkFurnitureChange("house-plant", cellCenter(6, 3), 0, INITIAL_MAP_OBJECTS, PLAYER).rejection, null);
  assert.notEqual(checkFurnitureChange("house-plant", CLOSET.position, 0, INITIAL_MAP_OBJECTS, PLAYER).rejection, null);
  // クローゼットの正面（きがえるときに立つ所）にも置けない
  const front = getBlockedCells(CLOSET)[1];
  const frontPoint = cellCenter(front.col, front.row);
  assert.notEqual(checkFurnitureChange("house-plant", frontPoint, 0, INITIAL_MAP_OBJECTS, PLAYER).rejection, null);
});

test("点のマスを占めている、選べる物（置いた装飾・動かせる家具）を探す", () => {
  const rock = { ...createDecorationCandidate(RPG_HUB_ASSETS.rock, { x: 0, z: 0 }), id: "placed-rock" };
  // 町の飾り（Issue #509）は選べるので、選べない物の例には柵の id を使う
  const fixedTree = { ...createDecorationCandidate(RPG_HUB_ASSETS.tree, { x: 5, z: 5 }), id: "fence-west-99" };
  const objects = [...INITIAL_MAP_OBJECTS, rock, fixedTree];

  // 2×2 マスの岩は、占める4マスのどこを押しても見つかる
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    assert.equal(findEditableAt(objects, x, z), "placed-rock");
  }
  // 隣のマスや、町の骨組み（柵など、選べない物）は返さない
  assert.equal(findEditableAt(objects, 1.2, 0), null);
  assert.equal(findEditableAt(objects, 5, 5), null);
  // クローゼット・ソファの2マスのどちらを押しても見つかる（Issue #506 でソファ・植木も選べる）
  for (const furniture of [CLOSET, SOFA]) {
    const cells = getObjectCells(furniture);
    for (const col of [cells.col, cells.col + 1]) {
      const point = cellCenter(col, cells.row);
      assert.equal(findEditableAt(objects, point.x, point.z), furniture.id);
    }
  }
  assert.equal(findEditableAt(objects, PLANT.position.x, PLANT.position.z), "house-plant");
  // 動かせない家具（玄関の出口）は返さない
  const door = INITIAL_MAP_OBJECTS.find((object) => object.id === "house-door");
  assert.equal(findEditableAt(objects, door.position.x, door.position.z), null);
});
