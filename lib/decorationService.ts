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
