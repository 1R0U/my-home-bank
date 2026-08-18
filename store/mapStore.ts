import { create } from "zustand";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects";
import { getSeason } from "../lib/rpg-hub/season";
import type { MapObject, Season } from "../types/map";

type MapStore = {
  currentSeason: Season;
  objects: MapObject[];
  setObjects: (objects: MapObject[]) => void;
};

export const useMapStore = create<MapStore>((set) => ({
  currentSeason: getSeason(new Date()),
  objects: INITIAL_MAP_OBJECTS,
  setObjects: (objects) => set({ objects }),
}));
