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
import { EDITABLE_PALETTE_SLOTS, type Palette, type PaletteChange } from "./palette.ts";
import { EQUIPMENT_SLOTS } from "../../types/map.ts";
import type { AssetId, EquipmentSlot, PaletteSlot } from "../../types/map";

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

/**
 * 更衣室で選び直した枠だけを持つ下書き（Issue #344）。
 *
 * 値が `null` の枠は「脱ぐ」、キーが無い枠は「触っていない（保存済みのまま）」。
 * **装備全体の写しにはしない。** 写しにすると、選んでいる間に保存済みの装備が読み直しで
 * 変わったとき、触っていない枠まで古い値で「変更」と数え、確定で元に戻してしまう（PR #346 レビュー対応）。
 */
export type EquipmentDraft = Partial<Record<EquipmentSlot, AssetId | null>>;

/**
 * 保存済みの装備に、下書きで選び直した枠だけを重ねる（Issue #344）。
 * @param saved - 保存済みの装備
 * @param draft - 選び直した枠
 * @returns 更衣室で見せる装備
 */
export function applyEquipmentDraft(saved: EquipmentMap, draft: EquipmentDraft): EquipmentMap {
  return EQUIPMENT_SLOTS.reduce(
    (equipment, slot) =>
      slot in draft ? withSlotEquipped(equipment, slot, draft[slot] ?? null) : equipment,
    saved,
  );
}

/** 更衣室で確定するときに保存する、1つの枠の変更（Issue #344）。 */
export type EquipmentChange = { assetId: AssetId | null; slot: EquipmentSlot };

/**
 * 1つの枠だけを着け替えた装備を返す。元の装備は書き換えない。
 *
 * 脱ぐ（`null`）ときは枠そのものを消す。`undefined` を入れた枠を残すと、
 * 保存済みの装備（DBから作るので脱いだ枠は持たない）と比べたときに食い違う。
 * @param equipment - 元の装備
 * @param slot - 着け替える枠
 * @param assetId - 着けるもの。脱ぐ場合は null
 * @returns 着け替えた装備
 */
export function withSlotEquipped(
  equipment: EquipmentMap,
  slot: EquipmentSlot,
  assetId: AssetId | null,
): EquipmentMap {
  const next: EquipmentMap = { ...equipment };
  if (assetId === null) {
    delete next[slot];
  } else {
    next[slot] = assetId;
  }
  return next;
}

/**
 * 更衣室で選んだ装備（下書き）のうち、保存済みの装備と違う枠だけを返す（Issue #344）。
 *
 * 確定ボタンを押せるかどうか（1つでも違えば押せる）と、確定したときに保存する枠の
 * 両方をこれで決める。**一度変えてから元に戻した枠は、変更として数えない。**
 * 枠は決まった順に並べるので、保存する順番が毎回変わらない。
 * @param saved - 保存済みの装備
 * @param draft - 更衣室で選んでいる装備
 * @returns 変わった枠と、その枠に着けるもの（脱ぐ場合は null）
 */
export function getEquipmentChanges(saved: EquipmentMap, draft: EquipmentMap): EquipmentChange[] {
  return EQUIPMENT_SLOTS.filter((slot) => (saved[slot] ?? null) !== (draft[slot] ?? null)).map(
    (slot) => ({ assetId: draft[slot] ?? null, slot }),
  );
}

/**
 * 更衣室で選び直した色の枠だけを持つ下書き（Issue #381）。
 *
 * 値が `null` の枠は「もとのいろ」、キーが無い枠は「触っていない（保存済みのまま）」。
 * 装備の下書き（`EquipmentDraft`）と同じ理由で、色全体の写しにはしない。
 */
export type PaletteDraft = Partial<Record<PaletteSlot, string | null>>;

/**
 * 保存済みの色に、下書きで選び直した枠だけを重ねる（Issue #381）。
 *
 * 「もとのいろ」（`null`）の枠は差し替えそのものを消す。保存済みの色（DBのNULLの枠は持たない）と
 * 比べたときに食い違わないようにするため（`withSlotEquipped` と同じ考え方）。
 * @param saved - 保存済みの色
 * @param draft - 選び直した枠
 * @returns 更衣室で見せる色
 */
export function applyPaletteDraft(saved: Palette, draft: PaletteDraft): Palette {
  const next: Palette = { ...saved };
  for (const slot of EDITABLE_PALETTE_SLOTS) {
    if (!(slot in draft)) continue;
    const color = draft[slot] ?? null;
    if (color === null) {
      delete next[slot];
    } else {
      next[slot] = color;
    }
  }
  return next;
}

/**
 * 更衣室で選んだ色（下書き）のうち、保存済みの色と違う枠だけを返す（Issue #381）。
 *
 * `getEquipmentChanges` と同じく、確定ボタンを押せるかどうかと保存する枠の両方をこれで決める。
 * **一度変えてから元に戻した枠は、変更として数えない。**
 * @param saved - 保存済みの色
 * @param draft - 更衣室で選んでいる色
 * @returns 変わった枠と、その枠の色（もとのいろに戻す場合は null）
 */
export function getPaletteChanges(saved: Palette, draft: Palette): PaletteChange[] {
  return EDITABLE_PALETTE_SLOTS.filter((slot) => (saved[slot] ?? null) !== (draft[slot] ?? null)).map(
    (slot) => ({ color: draft[slot] ?? null, slot }),
  );
}
