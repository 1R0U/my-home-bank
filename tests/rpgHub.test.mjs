import assert from "node:assert/strict";
import test from "node:test";
import { RPG_HUB_ASSETS, resolveAssetId } from "../lib/rpg-hub/assets.ts";
import { parseMapObject, parseMapObjects } from "../lib/rpg-hub/mapObjects.ts";
import { moveWithinMap } from "../lib/rpg-hub/movement.ts";
import { getSeason } from "../lib/rpg-hub/season.ts";

const validBuilding = {
  collidable: true,
  collisionSize: { depth: 2, width: 3 },
  id: "bank",
  interactionRadius: 3,
  interactive: true,
  model: RPG_HUB_ASSETS.bank,
  position: { x: 0, y: 1, z: 2 },
  route: "balance-child",
  type: "building",
};

test("許可された建物データをパースできる", () => {
  const result = parseMapObject(validBuilding);
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.object.type, "building");
});

test("未知のアセット・ルート・不正な数値を拒否する", () => {
  const result = parseMapObject({
    ...validBuilding,
    interactionRadius: -1,
    model: "https://example.com/evil.glb",
    position: { x: Number.NaN, y: 0, z: 0 },
    route: "/unknown",
  });
  assert.equal(result.success, false);
});

test("装飾をインタラクティブにはできない", () => {
  const result = parseMapObject({
    ...validBuilding,
    interactive: true,
    model: RPG_HUB_ASSETS.tree,
    type: "decoration",
  });
  assert.equal(result.success, false);
});

test("重複IDをmapStoreへ渡さない", () => {
  const result = parseMapObjects([validBuilding, validBuilding]);
  assert.equal(result.objects.length, 1);
  assert.equal(result.errors.length, 1);
});

test("AssetIdは辞書にある値だけ解決する", () => {
  assert.equal(resolveAssetId(RPG_HUB_ASSETS.player), RPG_HUB_ASSETS.player);
  assert.equal(resolveAssetId("unknown"), null);
});

test("月から季節を判定する", () => {
  assert.equal(getSeason(new Date(2026, 3, 1)), "spring");
  assert.equal(getSeason(new Date(2026, 6, 1)), "summer");
  assert.equal(getSeason(new Date(2026, 9, 1)), "autumn");
  assert.equal(getSeason(new Date(2026, 0, 1)), "winter");
});

test("プレイヤー位置をマップ境界内に制限する", () => {
  assert.deepEqual(moveWithinMap({ x: 5.8, z: -5.8 }, { x: 1, z: -1 }), { x: 6, z: -6 });
  assert.deepEqual(moveWithinMap({ x: 0, z: 0 }, { x: 0.5, z: -0.5 }), { x: 0.5, z: -0.5 });
});
