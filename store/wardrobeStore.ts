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
  /**
   * `equipment` が「どの利用者について確定済みか」（Issue #306）。
   * 考え方は appearanceStore の `characterTypeLoadedFor` と同じ。
   *
   * 実利用者のIDなら、その人について読み込みが終わっている（取得に失敗して何も着ていない
   * 状態にした場合も含む）。`null` は「未ログイン、またはモックアカウントで既定の装備に
   * 確定している」。`undefined` は**まだ確定していない**（利用者が変わった直後の空の状態など）。
   *
   * アイコンの肖像（`CharacterAvatar`）は、これと今の利用者を比べて一致するまで描かない。
   * 読み込み前の「何も着ていない姿」を描いてしまい、すぐ描き直すことになるため。
   */
  equipmentLoadedFor: string | null | undefined;
  /**
   * 読み込み結果を反映する。
   * loadedFor は対象の利用者ID（未ログイン・モックはnull）。省略すると未確定として扱う
   */
  setWardrobe: (ownedAssetIds: AssetId[], equipment: EquipmentMap, loadedFor?: string | null) => void;
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
  equipmentLoadedFor: undefined,
  ownedAssetIds: [],
  setWardrobe: (ownedAssetIds, equipment, loadedFor) =>
    set((state) => {
      // **中身が同じなら参照を変えない。** 変えると画面側の effect が再実行され、
      // WebView へ同じ装備を送り直して帽子を作り直す（#223 で setMap が
      // 二重に飛んでいたのと同じ形）。
      const sameOwned =
        state.ownedAssetIds.length === ownedAssetIds.length &&
        state.ownedAssetIds.every((assetId, index) => assetId === ownedAssetIds[index]);
      const sameEquipment = isSameEquipment(state.equipment, equipment);
      const sameLoadedFor = state.equipmentLoadedFor === loadedFor;
      if (sameOwned && sameEquipment && sameLoadedFor) return {};

      return {
        equipment: sameEquipment ? state.equipment : equipment,
        equipmentLoadedFor: loadedFor,
        ownedAssetIds: sameOwned ? state.ownedAssetIds : ownedAssetIds,
      };
    }),
}));
