import type { AssetId } from "../../types/map";

/**
 * 文字列を AssetId 型にキャストする（型安全性のため、この関数以外でキャストしない）。
 * @param value - アセットID文字列
 * @returns AssetId 型の値
 */
const createAssetId = (value: string) => value as AssetId;

/**
 * RPGハブで使用するアセットIDの定義。
 *
 * 自然物（木・低木・岩・草むら）は1種類につき4つの形を用意してある。
 * 同じ形だけを並べると、散らしても模様のように見えてしまうため
 * （置くときは lib/rpg-hub/mapObjects.ts がランダムに選ぶ）。
 */
export const RPG_HUB_ASSETS = {
  bank: createAssetId("building-bank"),
  bush: createAssetId("decoration-bush"),
  bushBerry: createAssetId("decoration-bush-berry"),
  bushTall: createAssetId("decoration-bush-tall"),
  bushWide: createAssetId("decoration-bush-wide"),
  flowerbed: createAssetId("decoration-flowerbed"),
  grass: createAssetId("decoration-grass"),
  grassFlower: createAssetId("decoration-grass-flower"),
  grassTall: createAssetId("decoration-grass-tall"),
  grassWide: createAssetId("decoration-grass-wide"),
  history: createAssetId("building-history"),
  lamp: createAssetId("decoration-lamp"),
  path: createAssetId("decoration-path"),
  player: createAssetId("player-default"),
  rock: createAssetId("decoration-rock"),
  rockFlat: createAssetId("decoration-rock-flat"),
  rockPile: createAssetId("decoration-rock-pile"),
  rockTall: createAssetId("decoration-rock-tall"),
  store: createAssetId("building-store"),
  tasks: createAssetId("building-tasks"),
  tree: createAssetId("decoration-tree"),
  treePine: createAssetId("decoration-tree-pine"),
  treeTall: createAssetId("decoration-tree-tall"),
  treeYoung: createAssetId("decoration-tree-young"),
  villager: createAssetId("character-villager"),
} as const;

/** 許可されたアセットIDの検証用 Map */
const assetIds = new Map<string, AssetId>(
  Object.values(RPG_HUB_ASSETS).map((assetId) => [assetId, assetId]),
);

/**
 * 外部入力を検証し、許可されたアセットIDに変換する。
 * @param value - 検証する値
 * @returns 許可されたアセットID。不正な場合は null
 */
export function resolveAssetId(value: unknown): AssetId | null {
  return typeof value === "string" ? (assetIds.get(value) ?? null) : null;
}
