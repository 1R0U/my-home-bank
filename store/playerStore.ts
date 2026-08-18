import { create } from "zustand";
import { moveWithinMap } from "../lib/rpg-hub/movement";

type Direction = "down" | "left" | "right" | "up";

type PlayerStore = {
  direction: Direction;
  move: (x: number, z: number, direction: Direction) => void;
  position: { x: number; z: number };
};

export const usePlayerStore = create<PlayerStore>((set) => ({
  direction: "up",
  move: (x, z, direction) =>
    set((state) => ({
      direction,
      position: moveWithinMap(state.position, { x, z }),
    })),
  position: { x: 0, z: 3 },
}));
