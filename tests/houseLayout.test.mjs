// 自分の家の中の「もようがえ」（Issue #425）のテスト。
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_HOUSE_LAYOUT,
  EMPTY_HOUSE_LAYOUT,
  findFreeX,
  getPlacedFurnitureId,
  getRoomFurniture,
  getStoredFurniture,
  HOUSE_PLACEABLE_FURNITURE,
  isMovableFurniture,
  isStorableFurniture,
  moveFurniture,
  parseHouseLayout,
  placeFurniture,
  storeFurniture,
} from "../lib/rpg-hub/houseLayout.ts";
import { HOUSE_FLOORS, HOUSE_ROOMS, ROOM_WIDTH } from "../lib/rpg-hub/houseRoom.ts";
import { getFurnitureHalfWidth, HOUSE_FURNITURE_SHAPES } from "../lib/rpg-hub/houseRoomParts.ts";

/** 部屋の家具が、壁からはみ出さず、床の上どうしで重ならないことを確かめる */
function assertNoOverlap(floor, layout) {
  const spans = getRoomFurniture(floor, layout).map((furniture) => {
    const half = getFurnitureHalfWidth(furniture.kind) / ROOM_WIDTH;
    assert.ok(furniture.x - half >= -1e-9 && furniture.x + half <= 1 + 1e-9, `${floor} の ${furniture.id} が壁からはみ出す`);
    return { furniture, max: furniture.x + half, min: furniture.x - half };
  });
  const onFloor = spans.filter((span) => !HOUSE_FURNITURE_SHAPES[span.furniture.kind].onWall);
  for (let i = 0; i < onFloor.length; i++) {
    for (let j = i + 1; j < onFloor.length; j++) {
      const a = onFloor[i];
      const b = onFloor[j];
      assert.ok(a.max <= b.min + 1e-9 || b.max <= a.min + 1e-9, `${floor} の ${a.furniture.id} と ${b.furniture.id} が重なる`);
    }
  }
}

test("まだ配置を保存していない利用者は、もようがえを入れる前と同じ家具が置いてある部屋から始まる（1R0Uレビュー指摘）", () => {
  const kindsOn = (floor) => getRoomFurniture(floor, DEFAULT_HOUSE_LAYOUT).map((item) => item.kind);
  assert.deepEqual(kindsOn("ground"), ["door", "closet", "window", "stairsUp", "sofa", "plant"]);
  assert.deepEqual(kindsOn("upstairs"), ["stairsDown", "window", "bed", "bookshelf", "toyBox"]);
  assert.equal(getStoredFurniture(DEFAULT_HOUSE_LAYOUT).length, 0);
});

test("最初の配置は、どの家具も壁からはみ出さず、重ならず、そのまま読み直せる", () => {
  for (const floor of HOUSE_FLOORS) assertNoOverlap(floor, DEFAULT_HOUSE_LAYOUT);
  // 置ける位置へずらされない（読み直しても同じ）
  assert.deepEqual(parseHouseLayout(JSON.parse(JSON.stringify(DEFAULT_HOUSE_LAYOUT))), DEFAULT_HOUSE_LAYOUT);
});

test("家具を1つも置いていなければ、はじめから付いている物だけが部屋にあり、家具は全部しまってある", () => {
  for (const floor of HOUSE_FLOORS) {
    assert.deepEqual(getRoomFurniture(floor, EMPTY_HOUSE_LAYOUT), HOUSE_ROOMS[floor].furniture);
  }
  assert.equal(getStoredFurniture(EMPTY_HOUSE_LAYOUT).length, HOUSE_PLACEABLE_FURNITURE.length);
});

test("家具を置くと部屋に出て、しまってある一覧から消える。近づくとひとこと話す", () => {
  const layout = placeFurniture(EMPTY_HOUSE_LAYOUT, "upstairs", "bed", 0.5);
  assert.ok(layout);
  const bed = getRoomFurniture("upstairs", layout).find((item) => item.id === getPlacedFurnitureId("bed"));
  assert.equal(bed?.action, "react");
  assert.equal(bed?.label, "ベッド");
  assert.ok(bed?.reaction);
  assert.equal(bed?.x, 0.5);
  // 1階には出ない
  assert.equal(getRoomFurniture("ground", layout).some((item) => item.kind === "bed"), false);
  assert.equal(getStoredFurniture(layout).some((item) => item.kind === "bed"), false);
});

test("同じ家具を2つは置けない", () => {
  const layout = placeFurniture(EMPTY_HOUSE_LAYOUT, "ground", "plant", 0.5);
  assert.equal(placeFurniture(layout, "upstairs", "plant", 0.5), null);
});

test("置きたい所がふさがっていれば、近くの空いている所へずらして置く", () => {
  // 1階の上りの階段の真上に置こうとしても、階段と重ならない所に置く
  const stairs = HOUSE_ROOMS.ground.furniture.find((item) => item.id === "stairs-up");
  const layout = placeFurniture(EMPTY_HOUSE_LAYOUT, "ground", "plant", stairs.x);
  assert.ok(layout);
  assert.notEqual(layout.placed[0].x, stairs.x);
  assertNoOverlap("ground", layout);
});

test("窓の前（壁に掛ける物の前）には重ねて置ける", () => {
  const windowX = HOUSE_ROOMS.ground.furniture.find((item) => item.id === "window").x;
  const layout = placeFurniture(EMPTY_HOUSE_LAYOUT, "ground", "sofa", windowX);
  assert.equal(layout?.placed[0].x, windowX);
});

test("空いている所が無ければ置けない", () => {
  // 1階は扉・クローゼット・階段の間が狭いので、大きい家具を順に置いていくと、いつか入らなくなる
  let layout = EMPTY_HOUSE_LAYOUT;
  const results = HOUSE_PLACEABLE_FURNITURE.map((item) => {
    const next = placeFurniture(layout, "ground", item.kind, 0.5);
    if (next) layout = next;
    return next !== null;
  });
  assert.ok(results.includes(false), "1階に全部の家具が入ってしまった（テストの前提を見直す）");
  assertNoOverlap("ground", layout);
});

test("家具を動かすと、その位置へ動く。ほかの家具とは重ならず、すぐ隣で止まる", () => {
  let layout = placeFurniture(EMPTY_HOUSE_LAYOUT, "upstairs", "bed", 0.4);
  layout = placeFurniture(layout, "upstairs", "toyBox", 0.8);
  const moved = moveFurniture(layout, "upstairs", getPlacedFurnitureId("toyBox"), 0.65);
  assert.equal(moved.placed.find((item) => item.kind === "toyBox").x, 0.65);

  // ベッドの真上へ動かそうとすると、ベッドの隣で止まる
  const blocked = moveFurniture(layout, "upstairs", getPlacedFurnitureId("toyBox"), 0.42);
  assert.notEqual(blocked.placed.find((item) => item.kind === "toyBox").x, 0.42);
  assertNoOverlap("upstairs", blocked);
});

test("家具は部屋の壁の外へは動かせず、壁ぎわで止まる", () => {
  const layout = placeFurniture(EMPTY_HOUSE_LAYOUT, "upstairs", "plant", 0.8);
  const moved = moveFurniture(layout, "upstairs", getPlacedFurnitureId("plant"), 3);
  const x = moved.placed[0].x;
  assert.equal(x, 1 - getFurnitureHalfWidth("plant") / ROOM_WIDTH);
  assertNoOverlap("upstairs", moved);
});

test("クローゼットは1階の中で動かせるが、しまえない", () => {
  assert.equal(isMovableFurniture("closet"), true);
  assert.equal(isStorableFurniture("closet"), false);
  const moved = moveFurniture(EMPTY_HOUSE_LAYOUT, "ground", "closet", 0.55);
  assert.equal(moved.closetX, 0.55);
  assert.equal(getRoomFurniture("ground", moved).find((item) => item.id === "closet")?.x, 0.55);
  // きがえができるクローゼットのまま
  assert.equal(getRoomFurniture("ground", moved).find((item) => item.id === "closet")?.action, "wardrobe");
  assert.equal(storeFurniture(moved, "closet"), moved);
  // 2階からは動かせない
  assert.equal(moveFurniture(EMPTY_HOUSE_LAYOUT, "upstairs", "closet", 0.55), EMPTY_HOUSE_LAYOUT);
});

test("扉・階段・窓は動かせず、しまえない", () => {
  for (const id of ["door", "stairs-up", "stairs-down", "window"]) {
    assert.equal(isMovableFurniture(id), false, id);
    assert.equal(isStorableFurniture(id), false, id);
    assert.equal(moveFurniture(EMPTY_HOUSE_LAYOUT, "ground", id, 0.5), EMPTY_HOUSE_LAYOUT, id);
  }
});

test("置いた家具はしまえ、しまうとまた置ける", () => {
  const placed = placeFurniture(EMPTY_HOUSE_LAYOUT, "ground", "sofa", 0.5);
  const id = getPlacedFurnitureId("sofa");
  assert.equal(isMovableFurniture(id), true);
  assert.equal(isStorableFurniture(id), true);
  const stored = storeFurniture(placed, id);
  assert.equal(getRoomFurniture("ground", stored).some((item) => item.id === id), false);
  assert.ok(placeFurniture(stored, "upstairs", "sofa", 0.5));
});

test("置ける位置を探すとき、動かしている家具そのものは邪魔にしない", () => {
  const layout = placeFurniture(EMPTY_HOUSE_LAYOUT, "upstairs", "bookshelf", 0.5);
  assert.equal(findFreeX("upstairs", layout, "bookshelf", 0.51, getPlacedFurnitureId("bookshelf")), 0.51);
  assert.notEqual(findFreeX("upstairs", layout, "bookshelf", 0.51), 0.51);
  assert.equal(findFreeX("upstairs", layout, "bookshelf", Number.NaN), null);
});

test("保存してあった配置は読み直せる", () => {
  let layout = moveFurniture(EMPTY_HOUSE_LAYOUT, "ground", "closet", 0.55);
  layout = placeFurniture(layout, "upstairs", "bed", 0.4);
  layout = placeFurniture(layout, "ground", "plant", 0.75);
  assert.deepEqual(parseHouseLayout(JSON.parse(JSON.stringify(layout))), layout);
});

test("壊れた配置は捨てて、使える分だけ残す", () => {
  assert.deepEqual(parseHouseLayout(null), DEFAULT_HOUSE_LAYOUT);
  assert.deepEqual(parseHouseLayout("x"), DEFAULT_HOUSE_LAYOUT);
  const parsed = parseHouseLayout({
    closetX: "left",
    placed: [
      { floor: "upstairs", kind: "bed", x: 0.4 },
      { floor: "upstairs", kind: "bed", x: 0.7 }, // 同じ家具の2つめ
      { floor: "attic", kind: "sofa", x: 0.5 }, // 無い階
      { floor: "ground", kind: "piano", x: 0.5 }, // 無い家具
      { floor: "ground", kind: "plant", x: "0.5" }, // 位置が数でない
      null,
    ],
  });
  assert.equal(parsed.closetX, EMPTY_HOUSE_LAYOUT.closetX);
  assert.deepEqual(parsed.placed, [{ floor: "upstairs", kind: "bed", x: 0.4 }]);
});

test("保存してあった位置で重なる家具は、近くへずらして読む（家具の形が大きくなったときなど）", () => {
  const parsed = parseHouseLayout({
    closetX: 0.08, // 扉と重なる
    placed: [
      { floor: "upstairs", kind: "bed", x: 0.4 },
      { floor: "upstairs", kind: "toyBox", x: 0.4 }, // ベッドと重なる
    ],
  });
  assertNoOverlap("ground", parsed);
  assertNoOverlap("upstairs", parsed);
  assert.equal(parsed.placed.length, 2);
});
