import { beforeEach, expect, test } from "@jest/globals";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets";
import { useMapStore } from "../store/mapStore";
import { usePlayerStore } from "../store/playerStore";
import type { MapObject } from "../types/map";

const building: MapObject = {
  collidable: true,
  collisionSize: { depth: 2, width: 3 },
  id: "test-building",
  interactionRadius: 3,
  interactive: true,
  model: RPG_HUB_ASSETS.bank,
  position: { x: 3, y: 1, z: 0 },
  route: "balance-child",
  type: "building",
};

beforeEach(() => {
  usePlayerStore.setState({ direction: "up", position: { x: 1, z: 0 } });
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
