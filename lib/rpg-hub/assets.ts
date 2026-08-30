import type { AssetId } from "../../types/map";

/**
 * 文字列を AssetId 型にキャストする（型安全性のため、この関数以外でキャストしない）。
 * @param value - アセットID文字列
 * @returns AssetId 型の値
 */
const createAssetId = (value: string) => value as AssetId;

/** RPGハブで使用するアセットIDの定義 */
export const RPG_HUB_ASSETS = {
  bank: createAssetId("building-bank"),
  history: createAssetId("building-history"),
  player: createAssetId("player-default"),
  store: createAssetId("building-store"),
  tasks: createAssetId("building-tasks"),
  tree: createAssetId("decoration-tree"),
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
