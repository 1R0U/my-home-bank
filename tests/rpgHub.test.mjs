import assert from "node:assert/strict";
import test from "node:test";
import { RPG_HUB_ASSETS, resolveAssetId } from "../lib/rpg-hub/assets.ts";
import { parseMapObject, parseMapObjects } from "../lib/rpg-hub/mapObjects.ts";
import { getJoystickMovement, moveWithinMap } from "../lib/rpg-hub/movement.ts";
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

test("collidableはbooleanだけを受け入れる", () => {
  assert.equal(parseMapObject({ ...validBuilding, collidable: true }).success, true);
  assert.equal(parseMapObject({ ...validBuilding, collidable: false }).success, true);
  assert.equal(parseMapObject({ ...validBuilding, collidable: "true" }).success, false);
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

test("衝突判定が有効な建物には進入できない", () => {
  // 建物(x=3, width=3)の衝突範囲はプレイヤー半径込みで x: 1.05〜4.95
  const building = { ...validBuilding, position: { x: 3, y: 1, z: 0 } };

  const result = moveWithinMap({ x: 1, z: 0 }, { x: 0.5, z: 0 }, [building]);

  assert.deepEqual(result, { x: 1, z: 0 });
});

test("衝突する建物があっても、ブロックされない軸方向へは壁沿いに移動できる", () => {
  // z方向の衝突範囲はプレイヤー半径込みで z: -1.45〜1.45 なので、z=2への移動はブロックされない
  const building = { ...validBuilding, position: { x: 3, y: 1, z: 0 } };

  const result = moveWithinMap({ x: 1, z: 0 }, { x: 0.5, z: 2 }, [building]);

  assert.equal(result.x, 1);
  assert.equal(result.z, 2);
});

test("collidable: falseの装飾物は移動を妨げない", () => {
  const tree = {
    collidable: false,
    id: "tree",
    interactive: false,
    model: RPG_HUB_ASSETS.tree,
    position: { x: 1, y: 0.8, z: 0 },
    type: "decoration",
  };

  const result = moveWithinMap({ x: 0, z: 0 }, { x: 1, z: 0 }, [tree]);

  assert.deepEqual(result, { x: 1, z: 0 });
});

test("ジョイスティックのドラッグ方向と強さを移動量へ変換する", () => {
  const right = getJoystickMovement(50, 0, 40, 0.2);
  assert.equal(right.direction, "right");
  assert.equal(right.knobX, 40);
  assert.equal(right.x, 0.2);
  assert.equal(right.z, 0);

  const diagonal = getJoystickMovement(-20, -20, 40, 0.2);
  assert.equal(diagonal.direction, "up");
  assert.ok(diagonal.x < 0);
  assert.ok(diagonal.z < 0);
  assert.ok(Math.hypot(diagonal.knobX, diagonal.knobY) <= 40);
});

test("ジョイスティック中央のデッドゾーンでは移動しない", () => {
  assert.deepEqual(getJoystickMovement(2, 1, 40, 0.2), {
    direction: null,
    knobX: 0,
    knobY: 0,
    x: 0,
    z: 0,
  });
});
