import { create } from "zustand";
import { findNearbyBuildingId, moveWithinMap } from "../lib/rpg-hub/movement";
import { useMapStore } from "./mapStore";

type Direction = "down" | "left" | "right" | "up";

type PlayerStore = {
  direction: Direction;
  move: (x: number, z: number, direction: Direction) => void;
  nearbyBuildingId: string | null;
  position: { x: number; z: number };
};

export const usePlayerStore = create<PlayerStore>((set) => ({
  direction: "up",
  move: (x, z, direction) =>
    set((state) => {
      const objects = useMapStore.getState().objects;
      const position = moveWithinMap(state.position, { x, z }, objects);
      return {
        direction,
        nearbyBuildingId: findNearbyBuildingId(position, objects),
        position,
      };
    }),
  nearbyBuildingId: null,
  position: { x: 0, z: 0 },
}));
