import assert from "node:assert/strict";
import test from "node:test";
import { HOUSE_ZONE_BOUNDS, INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import { SEASON_COLORS } from "../lib/rpg-hub/seasonalLook.ts";
import {
  BUILDING_MAP_LABELS,
  MINIMAP_ROTATION_DEG,
  facingYToRotationDeg,
  getMapGroundColor,
  getMapMarkerSizes,
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

test("getMinimapBounds: 家の中はプレイヤーの位置に関わらず同じ範囲", () => {
  const atOrigin = getMinimapBounds("house", ORIGIN);
  const movedFar = getMinimapBounds("house", { x: 1000, z: -1000 });
  assert.deepEqual(atOrigin, movedFar);
});

test("getMinimapBounds: 家の中は正方形になる（元の壁の範囲は正方形でない）", () => {
  const house = getMinimapBounds("house", ORIGIN);
  assert.equal(house.maxX - house.minX, house.maxZ - house.minZ);
});

test("getMinimapBounds: 家の中はHOUSE_ZONE_BOUNDSを囲む範囲になる", () => {
  const ground = getMinimapBounds("house", ORIGIN);
  // 壁の4隅（回転前）のどれよりも広い範囲になっていること
  const corners = [
    [HOUSE_ZONE_BOUNDS.minX, HOUSE_ZONE_BOUNDS.minZ],
    [HOUSE_ZONE_BOUNDS.minX, HOUSE_ZONE_BOUNDS.maxZ],
    [HOUSE_ZONE_BOUNDS.maxX, HOUSE_ZONE_BOUNDS.minZ],
    [HOUSE_ZONE_BOUNDS.maxX, HOUSE_ZONE_BOUNDS.maxZ],
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

const ROUTES = ["bank", "board", "exit", "history", "house", "store", "tasks", "wardrobe"];

test("getMapMarkerSizes: 等倍では表示の種類ごとの大きさ", () => {
  assert.deepEqual(getMapMarkerSizes(true), {
    decorationIconSize: 26 * 0.7,
    iconSize: 26,
    markerWidth: 72,
  });
  assert.deepEqual(getMapMarkerSizes(false), {
    decorationIconSize: 14 * 0.7,
    iconSize: 14,
    markerWidth: 14,
  });
});

test("getMapMarkerSizes: 拡大すると目印はゆるやかに大きくなり、最大（3倍）で1.5倍（Issue #413）", () => {
  const base = getMapMarkerSizes(true, 1);
  const max = getMapMarkerSizes(true, 3);
  assert.equal(max.iconSize, base.iconSize * 1.5);
  assert.equal(max.decorationIconSize, base.decorationIconSize * 1.5);
  // 拡大率が上がるほど大きくなるが、地図ほど（拡大率と同じ比率）は大きくならない
  let previous = base.iconSize;
  for (const zoom of [1.5, 2, 2.5, 3]) {
    const { iconSize } = getMapMarkerSizes(true, zoom);
    assert.ok(iconSize > previous, `zoom ${zoom}`);
    assert.ok(iconSize < base.iconSize * zoom, `zoom ${zoom}`);
    previous = iconSize;
  }
});

test("getMapMarkerSizes: ラベルの幅は目印より狭くならない", () => {
  for (const zoom of [1, 2, 3, 10]) {
    const { iconSize, markerWidth } = getMapMarkerSizes(true, zoom);
    assert.ok(markerWidth >= iconSize);
  }
});

test("getMapMarkerSizes: 1未満や数値でない拡大率は1として扱う", () => {
  const base = getMapMarkerSizes(true, 1);
  for (const zoom of [0.5, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(getMapMarkerSizes(true, zoom), base);
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

const SEASONS = ["spring", "summer", "autumn", "winter"];

test("getMapGroundColor: 町の地の色は、3Dの地面と同じ季節の色になる（Issue #413）", () => {
  for (const season of SEASONS) {
    assert.equal(getMapGroundColor("town", season), SEASON_COLORS[season].ground);
  }
  // 季節ごとに色が変わっていること（全部同じ色だと季節が反映されていない）
  assert.equal(new Set(SEASONS.map((season) => getMapGroundColor("town", season))).size, SEASONS.length);
});

test("getMapGroundColor: 家の中は季節によらず床の色", () => {
  const colors = new Set(SEASONS.map((season) => getMapGroundColor("house", season)));
  assert.equal(colors.size, 1);
  assert.ok(!SEASONS.some((season) => colors.has(SEASON_COLORS[season].ground)));
});
