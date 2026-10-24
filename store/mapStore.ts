import { create } from "zustand";
import { EMPTY_FAMILY_TOWN_STATUS, type FamilyTownStatus } from "../lib/rpg-hub/familyNpcs";
import { applyHouseFinishes, type HouseFinishes, STARTER_HOUSE_FINISHES } from "../lib/rpg-hub/houseFinishes";
import { applyFurnitureLayouts, type HouseFurnitureLayout } from "../lib/rpg-hub/houseFurniture";
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
 * 家族のNPC（Issue #255）も同じ理由で別に持つ。家族の人数は家庭ごとに変わるため、
 * 定数には書かず、取得した家族から組み立てる（`useFamilyTown`）。
 *
 * 家の中の家具の位置と向き（Issue #477）も、同じ理由で別に持つ。家具そのものは定数で、
 * 動かした分だけをDBから読み、定数の家具に重ねる（`applyFurnitureLayouts`）。
 * 壁紙・床板（Issue #480）も同じで、選んだものだけをDBから読み、定数の壁・床の見た目を替える
 * （`applyHouseFinishes`）。
 *
 * `objects` は描画用に連結したもの。画面側はこれだけを見ればよい。
 */
type MapStore = {
  /**
   * 今の季節。起動したときの日付で決め、季節の変わり目で `refreshSeason` が更新する。
   * **季節はここ1か所で決める。** 画面や WebView はこの値を表示に使うだけ。
   */
  currentSeason: Season;
  /** 取得した家族から組み立てたNPC（自分は含まない） */
  familyNpcs: MapObject[];
  /** 家の中の家具の位置と向き（動かした家具だけ） */
  furnitureLayouts: HouseFurnitureLayout[];
  /** 家の中の壁紙・床板 */
  houseFinishes: HouseFinishes;
  /**
   * 家族の状況（クエスト数・残高）。家族NPCの会話を組み立てるのに使う。
   * **見た目（`familyNpcs`）とは分けて持つ。** 残高が変わるたびに `objects` を作り直すと、
   * 画面が setMap を送り直して町全体を組み直してしまうため。
   */
  familyStatus: FamilyTownStatus;
  /** 町の固定物（家具は動かした位置）＋ 家族のNPC ＋ 置いた装飾。描画に使う */
  objects: MapObject[];
  /** DBから読み込んだ、置いた装飾 */
  placedDecorations: MapObject[];
  /**
   * 日付から季節を決め直す（Issue #282）。季節が変わっていなければ何もしない。
   * アプリを開いたまま季節の変わり目をまたいだときのために、`useSeasonClock` が呼ぶ。
   */
  refreshSeason: (date: Date) => void;
  /**
   * 家族のNPCと状況を差し替える。NPCの中身が変わっていなければ `objects` は作り直さない
   * （フォーカスのたびに取り直すため。作り直すと住人の位置まで初期化される）。
   */
  setFamily: (npcs: MapObject[], status: FamilyTownStatus) => void;
  /** 家具の位置と向きを差し替える。`objects` も合わせて作り直す */
  setFurnitureLayouts: (layouts: HouseFurnitureLayout[]) => void;
  /** 壁紙・床板を差し替える。変わったときだけ `objects` も合わせて作り直す */
  setHouseFinishes: (finishes: HouseFinishes) => void;
  /** 置いた装飾を差し替える。`objects` も合わせて作り直す */
  setPlacedDecorations: (decorations: MapObject[]) => void;
};

/** 描画に使う一覧の材料 */
type ObjectSources = Pick<MapStore, "familyNpcs" | "furnitureLayouts" | "houseFinishes" | "placedDecorations">;

/**
 * 描画に使う一覧を組み立てる。
 * @param sources - 家具の位置と向き・壁紙と床板・家族のNPC・置いた装飾
 * @returns 町の固定物（家具は動かした位置、壁・床は選んだ見た目）＋ 家族のNPC ＋ 置いた装飾
 */
function composeObjects(sources: ObjectSources): MapObject[] {
  const fixed = applyHouseFinishes(applyFurnitureLayouts(INITIAL_MAP_OBJECTS, sources.furnitureLayouts), sources.houseFinishes);
  return [...fixed, ...sources.familyNpcs, ...sources.placedDecorations];
}

export const useMapStore = create<MapStore>((set) => ({
  currentSeason: getSeason(new Date()),
  familyNpcs: [],
  furnitureLayouts: [],
  houseFinishes: STARTER_HOUSE_FINISHES,
  familyStatus: EMPTY_FAMILY_TOWN_STATUS,
  objects: INITIAL_MAP_OBJECTS,
  placedDecorations: [],
  refreshSeason: (date) =>
    set((state) => {
      const season = getSeason(date);
      // 同じ季節を書き直さない。書き直すと画面が setSeason を送り直す
      return season === state.currentSeason ? {} : { currentSeason: season };
    }),
  setFamily: (npcs, status) =>
    set((state) => {
      // NPCは数体ぶんの小さな配列なので、中身を丸ごと比べる
      if (JSON.stringify(state.familyNpcs) === JSON.stringify(npcs)) {
        return { familyStatus: status };
      }
      return {
        familyNpcs: npcs,
        familyStatus: status,
        objects: composeObjects({ ...state, familyNpcs: npcs }),
      };
    }),
  setPlacedDecorations: (decorations) =>
    set((state) => {
      // 空のまま空を書き直さない。`objects` を作り直すと画面が setMap を送り直し、
      // WebView 側がメッシュを全部捨てて組み直す（住人の位置も初期化される）。
      // 読み込みの入口で「前の人の装飾を消す」→「取得できなければ空にする」と
      // 空の代入が続くため、ここで止める。
      if (state.placedDecorations.length === 0 && decorations.length === 0) return {};
      return {
        objects: composeObjects({ ...state, placedDecorations: decorations }),
        placedDecorations: decorations,
      };
    }),
  setFurnitureLayouts: (layouts) =>
    set((state) => {
      // 空のまま空を書き直さない（setPlacedDecorations と同じ理由。作り直すと setMap が送り直される）
      if (state.furnitureLayouts.length === 0 && layouts.length === 0) return {};
      return {
        furnitureLayouts: layouts,
        objects: composeObjects({ ...state, furnitureLayouts: layouts }),
      };
    }),
  setHouseFinishes: (finishes) =>
    set((state) => {
      // 同じ見た目を書き直さない（setPlacedDecorations と同じ理由。作り直すと setMap が送り直される）
      const current = state.houseFinishes;
      if (current.flooringId === finishes.flooringId && current.wallpaperId === finishes.wallpaperId) return {};
      return {
        houseFinishes: finishes,
        objects: composeObjects({ ...state, houseFinishes: finishes }),
      };
    }),
}));
