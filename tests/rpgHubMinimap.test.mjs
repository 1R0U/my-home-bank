import assert from "node:assert/strict";
import test from "node:test";
import { HOUSE_ZONE_BOUNDS } from "../lib/rpg-hub/mapObjects.ts";
import {
  BUILDING_MAP_ICONS,
  facingYToRotationDeg,
  getMinimapBounds,
  projectToMinimap,
} from "../lib/rpg-hub/minimap.ts";

test("getMinimapBounds: townは原点中心の正方形", () => {
  const bounds = getMinimapBounds("town");
  assert.equal(bounds.minX, -bounds.maxX);
  assert.equal(bounds.minZ, -bounds.maxZ);
  assert.ok(bounds.maxX > 0);
});

test("getMinimapBounds: ground/upstairsはHOUSE_ZONE_BOUNDSを少し広げた範囲", () => {
  const ground = getMinimapBounds("ground");
  assert.ok(ground.minX < HOUSE_ZONE_BOUNDS.ground.minX);
  assert.ok(ground.maxX > HOUSE_ZONE_BOUNDS.ground.maxX);
  assert.ok(ground.minZ < HOUSE_ZONE_BOUNDS.ground.minZ);
  assert.ok(ground.maxZ > HOUSE_ZONE_BOUNDS.ground.maxZ);

  const upstairs = getMinimapBounds("upstairs");
  assert.ok(upstairs.minX < HOUSE_ZONE_BOUNDS.upstairs.minX);
  assert.ok(upstairs.maxX > HOUSE_ZONE_BOUNDS.upstairs.maxX);
});

test("projectToMinimap: 範囲の中心はマップの中心(size/2)になる", () => {
  const bounds = { maxX: 10, maxZ: 10, minX: -10, minZ: -10 };
  const { left, top } = projectToMinimap(0, 0, bounds, 100);
  assert.equal(left, 50);
  assert.equal(top, 50);
});

test("projectToMinimap: 四隅が正しいピクセルに対応する", () => {
  const bounds = { maxX: 10, maxZ: 10, minX: -10, minZ: -10 };
  assert.deepEqual(projectToMinimap(-10, -10, bounds, 100), { left: 0, top: 0 });
  assert.deepEqual(projectToMinimap(10, 10, bounds, 100), { left: 100, top: 100 });
});

test("projectToMinimap: 範囲の外に出ても端にクランプする", () => {
  const bounds = { maxX: 10, maxZ: 10, minX: -10, minZ: -10 };
  const { left, top } = projectToMinimap(1000, -1000, bounds, 100);
  assert.equal(left, 100);
  assert.equal(top, 0);
});

test("facingYToRotationDeg: +Z（facingY=0）を向いているときは画面の下向き(180度)", () => {
  assert.equal(facingYToRotationDeg(0), 180);
});

test("facingYToRotationDeg: 90度（facingY=π/2）は画面の右向き(90度)", () => {
  assert.ok(Math.abs(facingYToRotationDeg(Math.PI / 2) - 90) < 1e-9);
});

test("BUILDING_MAP_ICONS: すべてのMapRouteIdにアイコンがある", () => {
  const routes = ["bank", "downstairs", "history", "house", "store", "tasks", "upstairs", "wardrobe"];
  for (const route of routes) {
    assert.equal(typeof BUILDING_MAP_ICONS[route], "string");
    assert.ok(BUILDING_MAP_ICONS[route].length > 0);
  }
});
