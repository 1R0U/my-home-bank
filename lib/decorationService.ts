import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import type { PlacedDecorationRow } from "./rpg-hub/placedDecorations.ts";

/**
 * 置いた装飾（`placed_decorations`）とやり取りする（Issue #223）。
 *
 * 保存するのは「どれを・どこに・どの向きで・どの大きさで」だけ。
 * 見た目と当たり判定の大きさは `lib/rpg-hub/catalog.ts` が持つ。
 */

/**
 * その利用者が置いた装飾をすべて取得する。
 * @param userId - 置いた人のid
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 置いた装飾の行
 */
export async function fetchPlacedDecorations(
  userId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<PlacedDecorationRow[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("placed_decorations")
    .select("id, asset_id, position_x, position_z, rotation_y, scale")
    // 並び順を決めておかないと、取得のたびに順番が変わって差分が読みにくい
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PlacedDecorationRow[];
}

/**
 * 装飾を1つ置く。
 *
 * 高さ（`position_y`）は保存しない。カタログの `halfHeight × scale` から毎回決める
 * （形を作り直したときに古い高さのまま宙に浮かないようにするため。Issue #223）。
 * @param userId - 置く人のid
 * @param decoration - 置くもの
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 */
export async function insertPlacedDecoration(
  userId: string,
  decoration: { assetId: string; rotationY: number; scale: number; x: number; z: number },
  client?: Pick<SupabaseClient, "from">,
): Promise<void> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient.from("placed_decorations").insert({
    asset_id: decoration.assetId,
    position_x: decoration.x,
    position_z: decoration.z,
    rotation_y: decoration.rotationY,
    scale: decoration.scale,
    user_id: userId,
  });

  if (error) throw error;
}

/**
 * 置いた装飾を1つしまう。
 *
 * **`user_id` も条件に入れる。** 行のidだけで消すと、他の人が置いたものを
 * 消せてしまう（RLS がまだ無いため、DB側では止まらない。Issue #208）。
 * @param userId - しまう人のid
 * @param decorationId - `placed_decorations.id`
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 */
export async function deletePlacedDecoration(
  userId: string,
  decorationId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<void> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient
    .from("placed_decorations")
    .delete()
    .eq("id", decorationId)
    .eq("user_id", userId);

  if (error) throw error;
}
