import { create } from "zustand";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects";
import { getSeason } from "../lib/rpg-hub/season";
import type { BuildingMapObject, MapObject, Season } from "../types/map";

/**
 * RPGハブのマップ。
 *
 * **町の固定物と、後から足すものを分けて持つ**（Issue #223）。
 * 固定物（建物・道・散らした木）はコード内の定数で、家庭ごとに変わらない。
 * 家庭ごとに変わるのは次の3つで、いずれもDBから来る。
 *
 * - 家族の家: 誰が家族かで軒数も表札も変わる
 * - 家の中（部屋）: 家1軒につき1部屋
 * - 置いた装飾: 家族の誰かが置いたもの（庭は置いた人のぶんだけ、家の中はその家の持ち主のぶん）
 *
 * 混ぜて1つにすると、町のレイアウトを直すのにマイグレーションが要るようになる。
 *
 * `objects` は描画用にすべて連結したもの。画面側はこれだけを見ればよい。
 */
type MapStore = {
  currentSeason: Season;
  /** DBの家族から作った家（建物） */
  familyHouses: BuildingMapObject[];
  /** 家の中（壁・姿見・備え付けの家具）。家と同じ並び順で1部屋ずつ */
  houseInteriors: MapObject[];
  /** 町の固定物 ＋ 家族の家 ＋ 家の中 ＋ 置いた装飾。描画に使う */
  objects: MapObject[];
  /** DBから読み込んだ、置いた装飾 */
  placedDecorations: MapObject[];
  /** 家族の家と、その中の部屋を差し替える。`objects` も合わせて作り直す */
  setFamilyHouses: (houses: BuildingMapObject[], interiors: MapObject[]) => void;
  /** 置いた装飾を差し替える。`objects` も合わせて作り直す */
  setPlacedDecorations: (decorations: MapObject[]) => void;
};

/**
 * 描画に渡す一覧を組み立てる。**並び順は固定物→家→家の中→装飾。**
 * 順番を決めておくと、同じ内容なら毎回同じ並びになり、差分を見比べやすい。
 * @param familyHouses - 家族の家
 * @param houseInteriors - 家の中
 * @param placedDecorations - 置いた装飾
 * @returns 連結した一覧
 */
const buildObjects = (
  familyHouses: MapObject[],
  houseInteriors: MapObject[],
  placedDecorations: MapObject[],
): MapObject[] => [
  ...INITIAL_MAP_OBJECTS,
  ...familyHouses,
  ...houseInteriors,
  ...placedDecorations,
];

/**
 * 2つの一覧が「同じ見た目になる」かをidと表示名で判定する。
 *
 * **中身が同じなら作り直さない。** `objects` を作り直すと画面が setMap を送り直し、
 * WebView 側がメッシュを全部捨てて組み直す（住人の位置も初期化される）。
 * 家族の取得は画面を開くたびに走るので、毎回同じ結果で組み直されると目に見えてちらつく。
 * @param a - 比較する一覧
 * @param b - 比較する一覧
 * @returns 同じ内容とみなせる場合は true
 */
const sameObjects = (a: readonly MapObject[], b: readonly MapObject[]): boolean =>
  a.length === b.length
  && a.every((object, index) => {
    const other = b[index];
    return (
      object.id === other.id
      && object.position.x === other.position.x
      && object.position.z === other.position.z
      && (object as { name?: string }).name === (other as { name?: string }).name
    );
  });

export const useMapStore = create<MapStore>((set) => ({
  currentSeason: getSeason(new Date()),
  familyHouses: [],
  houseInteriors: [],
  objects: INITIAL_MAP_OBJECTS,
  placedDecorations: [],
  setFamilyHouses: (houses, interiors) =>
    set((state) => {
      if (sameObjects(state.familyHouses, houses)) return {};
      return {
        familyHouses: houses,
        houseInteriors: interiors,
        objects: buildObjects(houses, interiors, state.placedDecorations),
      };
    }),
  setPlacedDecorations: (decorations) =>
    set((state) => {
      // 空のまま空を書き直さない。読み込みの入口で「前の人の装飾を消す」→
      // 「取得できなければ空にする」と空の代入が続くため、ここで止める。
      if (state.placedDecorations.length === 0 && decorations.length === 0) return {};
      return {
        objects: buildObjects(state.familyHouses, state.houseInteriors, decorations),
        placedDecorations: decorations,
      };
    }),
}));
