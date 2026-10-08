import assert from "node:assert/strict";
import test from "node:test";
import { HOUSE_ZONE_BOUNDS, INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import {
  BUILDING_MAP_ICONS,
  BUILDING_MAP_LABELS,
  MINIMAP_ROTATION_DEG,
  facingYToRotationDeg,
  getMinimapBounds,
  isPathTile,
  isWithinMinimapBounds,
  projectToMinimap,
  worldSizeToMinimapPixels,
} from "../lib/rpg-hub/minimap.ts";

const ORIGIN = { x: 0, z: 0 };

test("getMinimapBounds: townはプレイヤーを中心にした正方形", () => {
  const bounds = getMinimapBounds("town", ORIGIN);
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  assert.equal(spanX, spanZ);
  assert.ok(spanX > 0);
});

test("getMinimapBounds: townではプレイヤーが動くと範囲も一緒に動く（スクロールする）", () => {
  const atOrigin = getMinimapBounds("town", ORIGIN);
  const movedFar = getMinimapBounds("town", { x: 1000, z: -1000 });
  // 範囲の大きさ（半幅）は変わらない
  assert.equal(movedFar.maxX - movedFar.minX, atOrigin.maxX - atOrigin.minX);
  // 範囲そのものは動く
  assert.notEqual(movedFar.minX, atOrigin.minX);
});

test("getMinimapBounds: ground/upstairsはプレイヤーの位置に関わらず同じ範囲", () => {
  const atOrigin = getMinimapBounds("ground", ORIGIN);
  const movedFar = getMinimapBounds("ground", { x: 1000, z: -1000 });
  assert.deepEqual(atOrigin, movedFar);
});

test("getMinimapBounds: ground/upstairsは正方形になる（元の壁の範囲は正方形でない）", () => {
  const ground = getMinimapBounds("ground", ORIGIN);
  assert.equal(ground.maxX - ground.minX, ground.maxZ - ground.minZ);

  const upstairs = getMinimapBounds("upstairs", ORIGIN);
  assert.equal(upstairs.maxX - upstairs.minX, upstairs.maxZ - upstairs.minZ);
});

test("getMinimapBounds: ground/upstairsはHOUSE_ZONE_BOUNDSを囲む範囲になる", () => {
  const ground = getMinimapBounds("ground", ORIGIN);
  // 壁の4隅（回転前）のどれよりも広い範囲になっていること
  const corners = [
    [HOUSE_ZONE_BOUNDS.ground.minX, HOUSE_ZONE_BOUNDS.ground.minZ],
    [HOUSE_ZONE_BOUNDS.ground.minX, HOUSE_ZONE_BOUNDS.ground.maxZ],
    [HOUSE_ZONE_BOUNDS.ground.maxX, HOUSE_ZONE_BOUNDS.ground.minZ],
    [HOUSE_ZONE_BOUNDS.ground.maxX, HOUSE_ZONE_BOUNDS.ground.maxZ],
  ];
  for (const [x, z] of corners) {
    const { left, top } = projectToMinimap(x, z, ground, 100);
    assert.ok(left >= 0 && left <= 100);
    assert.ok(top >= 0 && top <= 100);
    // 壁ぎりぎりではなく、少し内側（余白あり）に収まる
    assert.ok(left > 2 && left < 98);
    assert.ok(top > 2 && top < 98);
  }
});

test("projectToMinimap: プレイヤー自身の位置はその区画の範囲の中心に来る", () => {
  const player = { x: 12, z: -7 };
  const bounds = getMinimapBounds("town", player);
  const { left, top } = projectToMinimap(player.x, player.z, bounds, 100);
  assert.ok(Math.abs(left - 50) < 1e-9);
  assert.ok(Math.abs(top - 50) < 1e-9);
});

test("projectToMinimap: 範囲の外に出ても端にクランプする", () => {
  const bounds = { maxX: 10, maxZ: 10, minX: -10, minZ: -10 };
  // 回転後（画面の向き）でも両軸とも極端な値になるよう、x=zにする
  const { left, top } = projectToMinimap(1000, 1000, bounds, 100);
  assert.equal(left, 50); // (x-z)は0なので横方向は中心のまま
  assert.equal(top, 100); // (x+z)は極端に大きいので端にクランプ
});

test("isWithinMinimapBounds: 範囲の内側ならtrue、外側ならfalse", () => {
  const bounds = { maxX: 10, maxZ: 10, minX: -10, minZ: -10 };
  assert.equal(isWithinMinimapBounds(0, 0, bounds), true);
  assert.equal(isWithinMinimapBounds(1000, 1000, bounds), false);
});

test("isWithinMinimapBounds: townでプレイヤーから離れた物は表示範囲の外になる", () => {
  const player = { x: 0, z: 0 };
  const bounds = getMinimapBounds("town", player);
  assert.equal(isWithinMinimapBounds(0, 0, bounds), true);
  assert.equal(isWithinMinimapBounds(1000, -1000, bounds), false);
});

// 3Dカメラ（scene.tsのCAMERA_OFFSET = {x:9,y:11,z:9}）は、画面の「上」がワールドの
// (-X,-Z)、「右」が(+X,-Z)になるよう見下ろしている（1R0Uさんレビュー指摘）。
// マップもこれに合わせる。
test("projectToMinimap: ワールドの(-X,-Z)方向は画面の上方向になる（3Dカメラに合わせる）", () => {
  const bounds = { maxX: 50, maxZ: 50, minX: -50, minZ: -50 };
  const origin = projectToMinimap(0, 0, bounds, 100);
  const up = projectToMinimap(-10, -10, bounds, 100);
  assert.ok(Math.abs(up.left - origin.left) < 1e-9, "横方向は変わらない");
  assert.ok(up.top < origin.top, "画面の上（topが小さい）へ動く");
});

test("projectToMinimap: ワールドの(+X,-Z)方向は画面の右方向になる", () => {
  const bounds = { maxX: 50, maxZ: 50, minX: -50, minZ: -50 };
  const origin = projectToMinimap(0, 0, bounds, 100);
  const right = projectToMinimap(10, -10, bounds, 100);
  assert.ok(right.left > origin.left, "画面の右へ動く");
  assert.ok(Math.abs(right.top - origin.top) < 1e-9, "縦方向は変わらない");
});

test("facingYToRotationDeg: 画面の上方向（ワールドの(-X,-Z)）を向いていると矢印は上(0度)", () => {
  // forward = (sin(facingY), cos(facingY)) が (-1,-1)/√2 方向になる facingY
  const facingY = Math.atan2(-1, -1);
  assert.ok(Math.abs(facingYToRotationDeg(facingY)) < 1e-9);
});

test("facingYToRotationDeg: 画面の右方向（ワールドの(+X,-Z)）を向いていると矢印は右(90度)", () => {
  const facingY = Math.atan2(1, -1);
  assert.ok(Math.abs(facingYToRotationDeg(facingY) - 90) < 1e-9);
});

test("isPathTile: 町の初期マップには道のタイルが含まれる", () => {
  const paths = INITIAL_MAP_OBJECTS.filter(isPathTile);
  assert.ok(paths.length > 0);
  for (const path of paths) {
    assert.equal(path.type, "decoration");
  }
});

test("isPathTile: 建物は道ではない", () => {
  const building = INITIAL_MAP_OBJECTS.find((object) => object.type === "building");
  assert.equal(isPathTile(building), false);
});

test("worldSizeToMinimapPixels: 正方形の範囲なら幅と高さが同じになる", () => {
  const bounds = { maxX: 10, maxZ: 10, minX: -10, minZ: -10 };
  const { height, width } = worldSizeToMinimapPixels(2, bounds, 100);
  assert.equal(width, 10);
  assert.equal(height, 10);
});

const ROUTES = ["bank", "downstairs", "history", "house", "store", "tasks", "upstairs", "wardrobe"];

test("BUILDING_MAP_ICONS: すべてのMapRouteIdにアイコンがある", () => {
  for (const route of ROUTES) {
    assert.equal(typeof BUILDING_MAP_ICONS[route], "string");
    assert.ok(BUILDING_MAP_ICONS[route].length > 0);
  }
});

test("BUILDING_MAP_LABELS: すべてのMapRouteIdにラベルがある", () => {
  for (const route of ROUTES) {
    assert.equal(typeof BUILDING_MAP_LABELS[route], "string");
    assert.ok(BUILDING_MAP_LABELS[route].length > 0);
  }
});

test("MINIMAP_ROTATION_DEG: 現在のカメラ（45度）に合わせた回転角になる", () => {
  assert.ok(Math.abs(MINIMAP_ROTATION_DEG - 45) < 1e-9);
});
