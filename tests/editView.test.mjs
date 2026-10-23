import assert from "node:assert/strict";
import test from "node:test";
import {
  applyEditView,
  clampEditView,
  fitOrthoToPoints,
  getEditArea,
  getEditAreaCenter,
  getEditAreaCorners,
  getEditStandPoint,
  INITIAL_EDIT_VIEW,
  MAX_EDIT_ZOOM,
  panEditView,
  TOWN_EDIT_HALF_CELLS,
  zoomEditViewAt,
} from "../lib/rpg-hub/editView.ts";
import { HOUSE_ROOM_CENTER, isOnHouseFloor } from "../lib/rpg-hub/houseInterior.ts";
import { HOUSE_ROOM_SIZE } from "../lib/rpg-hub/houseInteriorParts.ts";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import { getBuildingExitPoint } from "../lib/rpg-hub/movement.ts";
import { TOWN_CELL_SIZE } from "../lib/rpg-hub/townGrid.ts";

/**
 * かざるの編集モード（Issue #477）で、カメラに映す範囲と映し方。
 * 置きたいマスが画面に入っていないと、引っぱって置けない。
 */

test("家の中では、部屋の床全体を映す", () => {
  const area = getEditArea({ x: HOUSE_ROOM_CENTER.x + 1, z: HOUSE_ROOM_CENTER.z - 2 });

  assert.ok(Math.abs(area.maxX - area.minX - HOUSE_ROOM_SIZE.width) < 1e-9);
  assert.ok(Math.abs(area.maxZ - area.minZ - HOUSE_ROOM_SIZE.depth) < 1e-9);
  const center = getEditAreaCenter(area);
  assert.ok(Math.abs(center.x - HOUSE_ROOM_CENTER.x) < 1e-9);
  assert.ok(Math.abs(center.z - HOUSE_ROOM_CENTER.z) < 1e-9);
  // 床の四隅が範囲に入っている（範囲がそのまま床）
  assert.ok(isOnHouseFloor(area.minX, area.minZ));
  assert.ok(isOnHouseFloor(area.maxX, area.maxZ));
  // 奥の壁の上まで映すよう、高さは壁の高さ
  assert.equal(area.height, HOUSE_ROOM_SIZE.wallHeight);
});

test("町では、足元のマスを真ん中に、東西南北へ決まったマス数ぶんを映す", () => {
  const player = { x: 3.3, z: -5.1 };
  const area = getEditArea(player);
  const span = (TOWN_EDIT_HALF_CELLS * 2 + 1) * TOWN_CELL_SIZE;

  assert.ok(Math.abs(area.maxX - area.minX - span) < 1e-9);
  assert.ok(Math.abs(area.maxZ - area.minZ - span) < 1e-9);
  assert.ok(area.minX < player.x && player.x < area.maxX);
  assert.ok(area.minZ < player.z && player.z < area.maxZ);
  // 範囲の縁はマスの境目（マス目の線が途中で切れない）
  for (const edge of [area.minX, area.maxX, area.minZ, area.maxZ]) {
    const cells = edge / TOWN_CELL_SIZE;
    assert.ok(Math.abs(cells - Math.round(cells)) < 1e-9, `${edge} がマスの境目でない`);
  }
});

test("範囲の角は、床の高さと物の高さの8つ", () => {
  const corners = getEditAreaCorners({ height: 2, maxX: 1, maxZ: 1, minX: -1, minZ: -1 });

  assert.equal(corners.length, 8);
  assert.equal(new Set(corners.map((corner) => `${corner.x},${corner.y},${corner.z}`)).size, 8);
});

/**
 * 正射影の範囲の中で、点が画面のどこに来るか（上端からのピクセル）。
 * @param bounds - 正射影の範囲
 * @param screen - 画面の大きさ
 * @param point - カメラから見た点
 */
const toScreen = (bounds, screen, point) => ({
  x: ((point.x - bounds.left) / (bounds.right - bounds.left)) * screen.width,
  y: ((bounds.top - point.y) / (bounds.top - bounds.bottom)) * screen.height,
});

test("映す点はすべて、上下のUIに隠れない部分に収まる", () => {
  const points = [
    { x: -6, y: -3 },
    { x: 6, y: -3 },
    { x: -6, y: 5 },
    { x: 6, y: 5 },
  ];
  const screen = { height: 844, width: 390 };
  const insets = { bottom: 260, top: 130 };
  const bounds = fitOrthoToPoints(points, screen, insets);

  for (const point of points) {
    const at = toScreen(bounds, screen, point);
    assert.ok(at.x >= 0 && at.x <= screen.width, `横にはみ出す: ${at.x}`);
    assert.ok(at.y >= insets.top && at.y <= screen.height - insets.bottom, `UIに隠れる: ${at.y}`);
  }
});

test("縦横の縮尺は同じにする（部屋がつぶれて見えない）", () => {
  const screen = { height: 844, width: 390 };
  const bounds = fitOrthoToPoints(
    [
      { x: -1, y: -10 },
      { x: 1, y: 10 },
    ],
    screen,
    { bottom: 200, top: 100 },
  );

  const unitsPerPixelX = (bounds.right - bounds.left) / screen.width;
  const unitsPerPixelY = (bounds.top - bounds.bottom) / screen.height;
  assert.ok(Math.abs(unitsPerPixelX - unitsPerPixelY) < 1e-9);
});

test("点は、隠れていない部分の真ん中に来る", () => {
  const screen = { height: 800, width: 400 };
  const insets = { bottom: 300, top: 100 };
  const bounds = fitOrthoToPoints(
    [
      { x: -2, y: -1 },
      { x: 2, y: 1 },
    ],
    screen,
    insets,
  );

  const center = toScreen(bounds, screen, { x: 0, y: 0 });
  assert.ok(Math.abs(center.x - screen.width / 2) < 1e-6);
  assert.ok(Math.abs(center.y - (insets.top + (screen.height - insets.top - insets.bottom) / 2)) < 1e-6);
});

test("UIが画面のほとんどを覆っても、範囲がつぶれたり裏返ったりしない", () => {
  const bounds = fitOrthoToPoints(
    [
      { x: -1, y: -1 },
      { x: 1, y: 1 },
    ],
    { height: 500, width: 300 },
    { bottom: 400, top: 300 },
  );

  assert.ok(bounds.right > bounds.left);
  assert.ok(bounds.top > bounds.bottom);
  assert.ok([bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite));
});

// --- 指でのズームと移動 ---

const BASE = { bottom: -6, left: -4, right: 4, top: 10 };

test("倍率は1倍〜上限に収め、倍率1ではずらせない（範囲全体より外を映さない）", () => {
  assert.equal(clampEditView(BASE, { pan: { x: 0, y: 0 }, zoom: 0.5 }).zoom, 1);
  assert.equal(clampEditView(BASE, { pan: { x: 0, y: 0 }, zoom: 9 }).zoom, MAX_EDIT_ZOOM);
  assert.equal(clampEditView(BASE, { pan: { x: 0, y: 0 }, zoom: Number.NaN }).zoom, 1);
  assert.deepEqual(clampEditView(BASE, { pan: { x: 3, y: -2 }, zoom: 1 }).pan, { x: 0, y: 0 });
});

test("拡大して動かしても、見えている範囲は範囲全体が収まる見え方からはみ出さない", () => {
  for (const pan of [{ x: 100, y: 100 }, { x: -100, y: -100 }, { x: 1, y: -1 }]) {
    const view = clampEditView(BASE, { pan, zoom: 2 });
    const bounds = applyEditView(BASE, view);
    assert.ok(bounds.left >= BASE.left - 1e-9 && bounds.right <= BASE.right + 1e-9, JSON.stringify(bounds));
    assert.ok(bounds.bottom >= BASE.bottom - 1e-9 && bounds.top <= BASE.top + 1e-9, JSON.stringify(bounds));
  }
});

test("倍率1で動かしていなければ、範囲全体が収まる見え方そのまま", () => {
  assert.deepEqual(applyEditView(BASE, INITIAL_EDIT_VIEW), BASE);
});

test("2本指のまん中にある物は、拡大しても指のまん中に残る", () => {
  const focus = { u: 0.25, v: 0.7 };
  const before = applyEditView(BASE, INITIAL_EDIT_VIEW);
  const pointX = before.left + (before.right - before.left) * focus.u;
  const pointY = before.top - (before.top - before.bottom) * focus.v;

  const zoomed = zoomEditViewAt(BASE, INITIAL_EDIT_VIEW, 2, focus);
  const after = applyEditView(BASE, zoomed);

  assert.equal(zoomed.zoom, 2);
  assert.ok(Math.abs(after.left + (after.right - after.left) * focus.u - pointX) < 1e-9);
  assert.ok(Math.abs(after.top - (after.top - after.bottom) * focus.v - pointY) < 1e-9);
});

test("なぞると床が指についてくる（指を右・下へ動かすと、見えている範囲は左・上へ動く）", () => {
  const screen = { height: 800, width: 400 };
  const zoomed = { pan: { x: 0, y: 0 }, zoom: 2 };

  const moved = panEditView(BASE, zoomed, { x: 40, y: 50 }, screen);

  // 1ピクセルあたり、横は (8 / 2) / 400、縦は (16 / 2) / 800
  assert.ok(Math.abs(moved.pan.x - -40 * (4 / 400)) < 1e-9);
  assert.ok(Math.abs(moved.pan.y - 50 * (8 / 800)) < 1e-9);
});

// --- 編集モードではキャラクターを消す（Issue #477） ---

test("家の中では、玄関の出口の前に立っているものとして判定する（見えないキャラクターにぶつからない）", () => {
  const door = INITIAL_MAP_OBJECTS.find((object) => object.type === "building" && object.route === "exit");
  const exit = getBuildingExitPoint(door);

  const stand = getEditStandPoint({ x: HOUSE_ROOM_CENTER.x, z: HOUSE_ROOM_CENTER.z }, INITIAL_MAP_OBJECTS);

  assert.deepEqual(stand, exit);
  // 玄関はマス目（床）の外なので、どのマスにも重ならない
  assert.equal(isOnHouseFloor(stand.x, stand.z), false);
});

test("町では、今の位置のまま判定する", () => {
  const player = { x: 3, z: -2 };
  assert.deepEqual(getEditStandPoint(player, INITIAL_MAP_OBJECTS), player);
});
