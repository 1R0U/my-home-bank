import type { AssetId } from "../../types/map";

// AssetIdへの変換はこの辞書だけで行い、外部入力を直接キャストしない。
const createAssetId = (value: string) => value as AssetId;

export const RPG_HUB_ASSETS = {
  bank: createAssetId("building-bank"),
  player: createAssetId("player-default"),
  store: createAssetId("building-store"),
  tasks: createAssetId("building-tasks"),
  tree: createAssetId("decoration-tree"),
} as const;

const assetIds = new Map<string, AssetId>(
  Object.values(RPG_HUB_ASSETS).map((assetId) => [assetId, assetId]),
);

export function resolveAssetId(value: unknown): AssetId | null {
  return typeof value === "string" ? (assetIds.get(value) ?? null) : null;
}
