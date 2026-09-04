import { beforeEach, expect, test } from "@jest/globals";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets";
import { useMapStore } from "../store/mapStore";
import { usePlayerStore } from "../store/playerStore";
import type { MapObject } from "../types/map";

const building: MapObject = {
  collidable: true,
  collisionSize: { depth: 2, width: 3 },
  entranceOffset: { x: 0, y: 0, z: 1.5 },
  id: "test-building",
  interactionRadius: 1,
  interactive: true,
  model: RPG_HUB_ASSETS.bank,
  position: { x: 3, y: 1, z: 0 },
  route: "bank",
  type: "building",
};

beforeEach(() => {
  usePlayerStore.setState({ direction: "up", nearbyBuildingId: null, position: { x: 1, z: 0 } });
  useMapStore.setState({ objects: [building] });
});

test("moveはmapStoreの建物を参照して衝突時にpositionを変えない", () => {
  usePlayerStore.getState().move(0.5, 0, "right");

  expect(usePlayerStore.getState().position).toEqual({ x: 1, z: 0 });
});

test("衝突しない移動はmoveを通じてpositionへ反映される", () => {
  usePlayerStore.getState().move(0, 0.5, "down");

  expect(usePlayerStore.getState().position).toEqual({ x: 1, z: 0.5 });
});

test("建物の入口に近づくとnearbyBuildingIdがそのidになる", () => {
  // 建物の入口は(3, 1.5)。プレイヤーをx=1から+2動かしx=3にすると、入口までの距離0.5でinteractionRadius(1)内に入る
  usePlayerStore.setState({ position: { x: 1, z: 1.5 } });

  usePlayerStore.getState().move(2, 0, "right");

  expect(usePlayerStore.getState().nearbyBuildingId).toBe("test-building");
});

test("建物の入口から離れるとnearbyBuildingIdがnullに戻る", () => {
  // 初期位置(1, 0)は入口(3, 1.5)から離れているため、わずかな移動でnullへ戻ることを確認する
  usePlayerStore.setState({ nearbyBuildingId: "test-building" });

  usePlayerStore.getState().move(0, 0.5, "down");

  expect(usePlayerStore.getState().nearbyBuildingId).toBeNull();
});
