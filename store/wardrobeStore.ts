import { create } from "zustand";
import { EQUIPMENT_SLOTS } from "../types/map";
import type { EquipmentMap } from "../lib/rpg-hub/equipment";
import type { AssetId } from "../types/map";

/**
 * 着せ替えの状態（Issue #222）。
 *
 * 「何を持っていて、いま何を着けているか」をDBから読んだ結果を持つ。
 * 見た目と付く位置は持たない（それは `lib/rpg-hub/catalog.ts`）。
 */
type WardrobeStore = {
  /** いま着けているもの */
  equipment: EquipmentMap;
  /** 持っている着せ替え品（カタログの順） */
  ownedAssetIds: AssetId[];
  /** 読み込み結果を反映する */
  setWardrobe: (ownedAssetIds: AssetId[], equipment: EquipmentMap) => void;
};

/**
 * 着せている内容が同じかどうかを判定する。
 * @param a - 比較する装備
 * @param b - 比較する装備
 * @returns すべての枠が同じなら true
 */
function isSameEquipment(a: EquipmentMap, b: EquipmentMap): boolean {
  return EQUIPMENT_SLOTS.every((slot) => a[slot] === b[slot]);
}

export const useWardrobeStore = create<WardrobeStore>((set) => ({
  equipment: {},
  ownedAssetIds: [],
  setWardrobe: (ownedAssetIds, equipment) =>
    set((state) => {
      // **中身が同じなら参照を変えない。** 変えると画面側の effect が再実行され、
      // WebView へ同じ装備を送り直して帽子を作り直す（#223 で setMap が
      // 二重に飛んでいたのと同じ形）。
      const sameOwned =
        state.ownedAssetIds.length === ownedAssetIds.length &&
        state.ownedAssetIds.every((assetId, index) => assetId === ownedAssetIds[index]);
      const sameEquipment = isSameEquipment(state.equipment, equipment);
      if (sameOwned && sameEquipment) return {};

      return {
        equipment: sameEquipment ? state.equipment : equipment,
        ownedAssetIds: sameOwned ? state.ownedAssetIds : ownedAssetIds,
      };
    }),
}));
