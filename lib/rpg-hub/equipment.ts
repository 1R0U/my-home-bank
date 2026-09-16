// キャラクターに着せ替え品を付ける仕組み（Issue #221）。
//
// **位置を持つのはキャラクターの側だけ。**
//
//   キャラクター  → 枠ごとのアンカー（位置・回転・拡大率）  … catalog.ts の `anchors`
//   着せ替え品    → どの枠に付くか（枠の名前だけ）          … catalog.ts の `slot`
//
// アイテムが座標を持たないので、仮置きのカエルを本番のキャラクターへ差し替えるときも、
// 新しいキャラクターのアンカーを定義するだけで済み、アイテムは1つも作り直さなくてよい。
//
// ここは描画に依存しない純粋な計算だけを持つ（movement.ts / npcWander.ts と同じ方針）。
// 実際に組み立てるのは webview/rpg-hub/scene.ts。

import {
  getBuildingParts,
  getSlotAnchor,
  getWearableSlot,
  type SlotAnchor,
} from "./catalog.ts";
import { RPG_HUB_ASSETS } from "./assets.ts";
import type { BuildingPart } from "./buildingParts.ts";
import { EQUIPMENT_SLOTS } from "../../types/map.ts";
import type { AssetId, EquipmentSlot } from "../../types/map";

/** 身に着けているもの。枠ごとにアセットIDを1つ持つ。 */
export type EquipmentMap = Partial<Record<EquipmentSlot, AssetId>>;

/** 解決済みのアンカー。省略されていた値が埋まっている。 */
export type ResolvedAnchor = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: number;
};

/** 実際に組み立てる着せ替え品1つ分。 */
export type ResolvedEquipment = {
  anchor: ResolvedAnchor;
  assetId: AssetId;
  parts: BuildingPart[];
  slot: EquipmentSlot;
};

const NO_ROTATION = { x: 0, y: 0, z: 0 };

/**
 * アンカーの省略値を埋める。
 * @param anchor - カタログのアンカー
 * @returns 位置・回転・拡大率がすべて入ったアンカー
 */
function fillAnchor(anchor: SlotAnchor): ResolvedAnchor {
  return {
    position: anchor.position,
    rotation: anchor.rotation ?? NO_ROTATION,
    scale: anchor.scale ?? 1,
  };
}

/**
 * キャラクターと装備の組から、実際に組み立てるものを求める。
 *
 * 次のものは**黙って落とす**。装備は見た目だけの情報で、1つ付かなくても遊べるため、
 * 例外にして画面ごと止めるより無視するほうが害が小さい。
 *   - そのキャラクターにアンカーが無い枠（頭しか持たないキャラに背中のマントを指定した等）
 *   - 着せ替え品ではないアセット（建物や装飾のIDを装備欄に入れた場合）
 *   - 指定された枠と、アイテム側が申告する枠が食い違うもの（顔用を頭の枠に入れた等）
 *
 * @param characterAssetId - 着せる相手のアセットID
 * @param equipment - 身に着けているもの。未指定なら何も付けない
 * @returns 組み立てる着せ替え品の一覧（枠の順番は固定）
 */
export function resolveEquipment(
  characterAssetId: string,
  equipment: EquipmentMap | undefined,
): ResolvedEquipment[] {
  if (!equipment) return [];

  const resolved: ResolvedEquipment[] = [];
  for (const slot of EQUIPMENT_SLOTS) {
    const assetId = equipment[slot];
    if (!assetId) continue;
    // アイテム側の申告と指定された枠が一致しない限り付けない。
    // 一致を要求しておくと、顔用のめがねを頭の枠へ入れても頭の上に浮かばない。
    if (getWearableSlot(assetId) !== slot) continue;
    const anchor = getSlotAnchor(characterAssetId, slot);
    if (!anchor) continue;
    resolved.push({ anchor: fillAnchor(anchor), assetId, parts: getBuildingParts(assetId), slot });
  }
  return resolved;
}

/**
 * プレイヤーの装備。
 *
 * **#221 の時点では固定値。** 所有と装備をDBに保存して差し替えるのは #222 で、
 * そのときここは「保存された値が無いときの既定」になる。
 * 2つの枠を入れてあるのは、枠ごとに別のアンカーへ付くことを実機で見て確かめるため。
 */
export const DEFAULT_PLAYER_EQUIPMENT: EquipmentMap = {
  face: RPG_HUB_ASSETS.wearableGlasses,
  head: RPG_HUB_ASSETS.wearableHat,
};
