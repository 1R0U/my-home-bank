import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import type { EquippedItemRow, OwnedItemRow } from "./rpg-hub/wardrobe.ts";
import type { EquipmentSlot } from "../types/map";

/**
 * 所有（`owned_items`）と装備（`equipped_items`）とやり取りする（Issue #222）。
 *
 * 保存するのはアセットIDと枠の名前だけ。見た目と付く位置は
 * `lib/rpg-hub/catalog.ts` が持つ。
 */

/**
 * その利用者が持っている着せ替え品をすべて取得する。
 * @param userId - 持ち主のid
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 所有の行
 */
export async function fetchOwnedItems(
  userId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<OwnedItemRow[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("owned_items")
    .select("asset_id")
    .eq("user_id", userId);

  if (error) throw error;
  return (data ?? []) as OwnedItemRow[];
}

/**
 * その利用者がいま着けているものをすべて取得する。
 * @param userId - 持ち主のid
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 装備の行
 */
export async function fetchEquippedItems(
  userId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<EquippedItemRow[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("equipped_items")
    .select("asset_id, slot")
    .eq("user_id", userId);

  if (error) throw error;
  return (data ?? []) as EquippedItemRow[];
}

/**
 * 1つの枠の装備を入れ替える。
 *
 * **枠ごとに1行なので、着け替えは upsert、脱ぐのは delete。**
 * 持っていないものを指定した場合はDB側の外部キーで拒否され、error が返る。
 * @param userId - 持ち主のid
 * @param slot - 着け替える枠
 * @param assetId - 着けるもの。脱ぐ場合は null
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 */
export async function saveEquippedItem(
  userId: string,
  slot: EquipmentSlot,
  assetId: string | null,
  client?: Pick<SupabaseClient, "from">,
): Promise<void> {
  const resolvedClient = await resolveClient(client);

  if (assetId === null) {
    const { error } = await resolvedClient
      .from("equipped_items")
      .delete()
      .eq("user_id", userId)
      .eq("slot", slot);
    if (error) throw error;
    return;
  }

  const { error } = await resolvedClient
    .from("equipped_items")
    // 主キーが (user_id, slot) なので、同じ枠への着け替えは1行の置き換えになる
    .upsert(
      { asset_id: assetId, slot, updated_at: new Date().toISOString(), user_id: userId },
      { onConflict: "user_id,slot" },
    );
  if (error) throw error;
}
