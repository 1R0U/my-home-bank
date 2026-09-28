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
  /**
   * 今の季節。起動したときの日付で決め、季節の変わり目で `refreshSeason` が更新する。
   * **季節はここ1か所で決める。** 画面や WebView はこの値を表示に使うだけ。
   */
  currentSeason: Season;
  /** 町の固定物 ＋ 置いた装飾。描画に使う */
  objects: MapObject[];
  /** DBから読み込んだ、置いた装飾 */
  placedDecorations: MapObject[];
  /**
   * 日付から季節を決め直す（Issue #282）。季節が変わっていなければ何もしない。
   * アプリを開いたまま季節の変わり目をまたいだときのために、`useSeasonClock` が呼ぶ。
   */
  refreshSeason: (date: Date) => void;
  /** 置いた装飾を差し替える。`objects` も合わせて作り直す */
  setPlacedDecorations: (decorations: MapObject[]) => void;
};

export const useMapStore = create<MapStore>((set) => ({
  currentSeason: getSeason(new Date()),
  objects: INITIAL_MAP_OBJECTS,
  placedDecorations: [],
  refreshSeason: (date) =>
    set((state) => {
      const season = getSeason(date);
      // 同じ季節を書き直さない。書き直すと画面が setSeason を送り直す
      return season === state.currentSeason ? {} : { currentSeason: season };
    }),
  setPlacedDecorations: (decorations) =>
    set((state) => {
      // 空のまま空を書き直さない。`objects` を作り直すと画面が setMap を送り直し、
      // WebView 側がメッシュを全部捨てて組み直す（住人の位置も初期化される）。
      // 読み込みの入口で「前の人の装飾を消す」→「取得できなければ空にする」と
      // 空の代入が続くため、ここで止める。
      if (state.placedDecorations.length === 0 && decorations.length === 0) return {};
      return {
        objects: [...INITIAL_MAP_OBJECTS, ...decorations],
        placedDecorations: decorations,
      };
    }),
}));
