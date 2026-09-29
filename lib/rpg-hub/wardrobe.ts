// DBに保存された「所有」と「装備」を、着せ替えに使える形へ変換する（Issue #222）。
//
// **DBは外から来るデータとして扱う。** カタログから消えたアイテムのIDが残っていても、
// その枠を空として扱って描画を続ける（会話データの `getDialogue` が未知のIDに null を
// 返しているのと同じ考え方）。1件のせいでキャラクターが出なくなるのが一番まずい。
//
// 見た目と付く位置はDBではなくカタログが持つ（lib/rpg-hub/catalog.ts）。
// DBが持つのはアセットIDと枠の名前だけ。

import { ASSET_DEFINITIONS, getWearableSlot } from "./catalog.ts";
import { resolveAssetId } from "./assets.ts";
import type { EquipmentMap } from "./equipment.ts";
import { EQUIPMENT_SLOTS } from "../../types/map.ts";
import type { AssetId, EquipmentSlot } from "../../types/map";

/** `owned_items` の1行。 */
export type OwnedItemRow = { asset_id: string };

/** `equipped_items` の1行。 */
export type EquippedItemRow = { asset_id: string; slot: string };

/**
 * カタログに載っている着せ替え品を、並び順を決めて返す。
 *
 * 着せ替え画面の「持ちもの」の並びがここで決まる。DBの取得順に任せると、
 * 取り直すたびに並びが変わって押し間違える。
 */
const WEARABLE_ORDER: readonly AssetId[] = ASSET_DEFINITIONS.filter(
  (definition) => definition.category === "wearable",
).map((definition) => definition.id as AssetId);

/**
 * 持っているアイテムのうち、いま着られるものだけを返す。
 *
 * カタログから消えたIDは捨てる。**捨てても例外にはしない。**
 * @param rows - `owned_items` の行
 * @returns 着られるアセットID（カタログの順）と、捨てた理由
 */
export function toOwnedWearables(rows: readonly OwnedItemRow[]): {
  assetIds: AssetId[];
  errors: string[];
} {
  const errors: string[] = [];
  const owned = new Set<AssetId>();

  for (const row of rows) {
    const assetId = resolveAssetId(row?.asset_id);
    if (assetId === null || getWearableSlot(assetId) === null) {
      errors.push(`着せ替え品ではないIDを持っています: ${String(row?.asset_id)}`);
      continue;
    }
    owned.add(assetId);
  }

  return { assetIds: WEARABLE_ORDER.filter((assetId) => owned.has(assetId)), errors };
}

/**
 * 装備の行を、キャラクターに着せる形へ変換する。
 *
 * 持っていないものは着せない。DBの外部キーでも防いでいるが、片方だけに頼ると、
 * 手で入れた行や将来の経路で抜ける。
 *
 * 枠とアイテムの申告が食い違うもの（顔用を頭の枠に入れた等）も捨てる。
 * 着せても `resolveEquipment` に黙って落とされ、「保存できたのに出てこない」
 * 状態になるため（#221 と同じ）。
 * @param rows - `equipped_items` の行
 * @param ownedAssetIds - その人が持っているアセットID
 * @returns 着せる内容と、捨てた理由
 */
export function toEquipment(
  rows: readonly EquippedItemRow[],
  ownedAssetIds: readonly AssetId[],
): { equipment: EquipmentMap; errors: string[] } {
  const errors: string[] = [];
  const owned = new Set<AssetId>(ownedAssetIds);
  const equipment: EquipmentMap = {};

  for (const row of rows) {
    const slot = row?.slot as EquipmentSlot;
    if (!EQUIPMENT_SLOTS.includes(slot)) {
      errors.push(`知らない枠です: ${String(row?.slot)}`);
      continue;
    }
    const assetId = resolveAssetId(row?.asset_id);
    if (assetId === null || getWearableSlot(assetId) !== slot) {
      errors.push(`${slot} に着けられないIDです: ${String(row?.asset_id)}`);
      continue;
    }
    if (!owned.has(assetId)) {
      errors.push(`持っていないものが装備されています: ${assetId}`);
      continue;
    }
    equipment[slot] = assetId;
  }

  return { equipment, errors };
}
