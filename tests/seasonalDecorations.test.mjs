import assert from "node:assert/strict";
import test from "node:test";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";
import { getPlaceableDecorations } from "../lib/rpg-hub/catalog.ts";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import { scatterSeasonalDecorations } from "../lib/rpg-hub/seasonalDecorations.ts";

/** 2つの軸平行な四角が重なっているか。 */
const overlaps = (a, aHalf, b, bHalf) =>
  Math.abs(a.x - b.x) < aHalf.x + bHalf.x && Math.abs(a.z - b.z) < aHalf.z + bHalf.z;

/** 季節の飾りの半分の大きさ（カタログの size は、雪だまりで 1.8）。 */
const decorationHalf = (object) => {
  const size = object.model === RPG_HUB_ASSETS.seasonSnow ? 1.8 : 0.9;
  return { x: (size * object.scale) / 2, z: (size * object.scale) / 2 };
};

test("夏は季節の飾りを散らさない", () => {
  assert.deepEqual(scatterSeasonalDecorations("summer", INITIAL_MAP_OBJECTS), []);
});

test("春は花びら、秋は落ち葉、冬は雪だまりを散らす", () => {
  const expected = {
    autumn: RPG_HUB_ASSETS.seasonLeaves,
    spring: RPG_HUB_ASSETS.seasonPetals,
    winter: RPG_HUB_ASSETS.seasonSnow,
  };
  for (const [season, model] of Object.entries(expected)) {
    const decorations = scatterSeasonalDecorations(season, INITIAL_MAP_OBJECTS);
    assert.ok(decorations.length >= 50, `${season} は ${decorations.length} 個`);
    assert.ok(decorations.every((object) => object.model === model), season);
  }
});

test("同じマップと季節からは、毎回同じ並びになる", () => {
  const first = scatterSeasonalDecorations("autumn", INITIAL_MAP_OBJECTS);
  const second = scatterSeasonalDecorations("autumn", INITIAL_MAP_OBJECTS);
  assert.deepEqual(first, second);
});

test("季節の飾りは踏んで歩け、話しかけられない", () => {
  for (const season of ["spring", "autumn", "winter"]) {
    for (const object of scatterSeasonalDecorations(season, INITIAL_MAP_OBJECTS)) {
      assert.equal(object.collidable, false);
      assert.equal(object.collisionSize, undefined);
      assert.equal(object.interactive, false);
      assert.equal(object.type, "decoration");
    }
  }
});

test("季節の飾りは、建物・木などの当たり判定と道に重ならない", () => {
  const obstacles = INITIAL_MAP_OBJECTS.filter(
    (object) => object.collisionSize || object.model === RPG_HUB_ASSETS.path,
  ).map((object) => {
    const scale = object.scale ?? 1;
    const half = object.collisionSize
      ? { x: (object.collisionSize.width * scale) / 2, z: (object.collisionSize.depth * scale) / 2 }
      : { x: 0.9 * scale, z: 0.9 * scale };
    return { half, object };
  });
  assert.ok(obstacles.some((entry) => entry.object.model === RPG_HUB_ASSETS.path));

  for (const season of ["spring", "autumn", "winter"]) {
    for (const decoration of scatterSeasonalDecorations(season, INITIAL_MAP_OBJECTS)) {
      const half = decorationHalf(decoration);
      const hit = obstacles.find((entry) =>
        overlaps(decoration.position, half, entry.object.position, entry.half),
      );
      assert.equal(hit, undefined, `${decoration.id} が ${hit?.object.id} に重なっている`);
    }
  }
});

test("季節の飾りどうしは重ならない", () => {
  for (const season of ["spring", "autumn", "winter"]) {
    const decorations = scatterSeasonalDecorations(season, INITIAL_MAP_OBJECTS);
    for (let i = 0; i < decorations.length; i += 1) {
      for (let j = i + 1; j < decorations.length; j += 1) {
        const a = decorations[i];
        const b = decorations[j];
        assert.ok(
          !overlaps(a.position, decorationHalf(a), b.position, decorationHalf(b)),
          `${a.id} と ${b.id}`,
        );
      }
    }
  }
});

test("季節の飾りのIDは、マップのIDと重ならない", () => {
  const mapIds = new Set(INITIAL_MAP_OBJECTS.map((object) => object.id));
  for (const season of ["spring", "autumn", "winter"]) {
    const ids = scatterSeasonalDecorations(season, INITIAL_MAP_OBJECTS).map((object) => object.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id) => !mapIds.has(id)));
  }
});

test("季節の飾りは、子供が庭に置く装飾の一覧に出ない", () => {
  const placeable = getPlaceableDecorations();
  for (const model of [
    RPG_HUB_ASSETS.seasonLeaves,
    RPG_HUB_ASSETS.seasonPetals,
    RPG_HUB_ASSETS.seasonSnow,
  ]) {
    assert.ok(!placeable.includes(model), model);
  }
});
