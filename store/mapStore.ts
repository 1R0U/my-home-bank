import { create } from "zustand";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects";
import { getSeason } from "../lib/rpg-hub/season";
import type { MapObject, Season } from "../types/map";

/**
 * RPGハブのマップ。
 *
 * **町の固定物と、置いた装飾を分けて持つ**（Issue #223）。
 * 固定物（建物・道・散らした木）はコード内の定数で、家庭ごとに変わらない。
 * 置いた装飾だけがDBから来る。混ぜて1つにすると、町のレイアウトを直すのに
 * マイグレーションが要るようになる。
 *
 * `objects` は描画用に2つを連結したもの。画面側はこれだけを見ればよい。
 */
type MapStore = {
  currentSeason: Season;
  /** 町の固定物 ＋ 置いた装飾。描画に使う */
  objects: MapObject[];
  /** DBから読み込んだ、置いた装飾 */
  placedDecorations: MapObject[];
  /** 置いた装飾を差し替える。`objects` も合わせて作り直す */
  setPlacedDecorations: (decorations: MapObject[]) => void;
};

export const useMapStore = create<MapStore>((set) => ({
  currentSeason: getSeason(new Date()),
  objects: INITIAL_MAP_OBJECTS,
  placedDecorations: [],
  setPlacedDecorations: (decorations) =>
    set({
      objects: [...INITIAL_MAP_OBJECTS, ...decorations],
      placedDecorations: decorations,
    }),
}));
