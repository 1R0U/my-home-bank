import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import { type HouseFinishes, isHouseFinishOf, STARTER_HOUSE_FINISHES } from "./rpg-hub/houseFinishes.ts";

/**
 * 家の中の壁紙・床板（`house_interior_settings`）とやり取りする（Issue #480）。
 *
 * 1人につき1行で、選んだ壁紙・床板のアセットIDを持つ。**NULL は家に付いている最初の壁紙・床板。**
 * 最初の壁紙・床板はストアの商品ではない（`store_assets` に無い）ため、IDではなく NULL で表す。
 */

/** `house_interior_settings` の1行（読むときに使う列だけ） */
export type HouseInteriorSettingsRow = {
  flooring_id: string | null;
  wallpaper_id: string | null;
};

/**
 * DBの行を、アプリで使う形にする。行が無い・知らないIDのときは、最初の壁紙・床板にする
 * （新しいアプリで増やした壁紙を古いアプリで開いても、部屋が消えないように）。
 * @param row - DBの行。無ければ null
 * @returns 壁紙・床板
 */
export function toHouseFinishes(row: HouseInteriorSettingsRow | null): HouseFinishes {
  const wallpaperId = row?.wallpaper_id;
  const flooringId = row?.flooring_id;
  return {
    flooringId: flooringId && isHouseFinishOf("flooring", flooringId) ? flooringId : STARTER_HOUSE_FINISHES.flooringId,
    wallpaperId: wallpaperId && isHouseFinishOf("wallpaper", wallpaperId) ? wallpaperId : STARTER_HOUSE_FINISHES.wallpaperId,
  };
}

/**
 * 最初の壁紙・床板を NULL にして、DBに書く形にする。
 * @param finishes - 壁紙・床板
 * @returns DBの行（選んだIDの列だけ）
 */
export function toHouseInteriorSettingsRow(finishes: HouseFinishes): HouseInteriorSettingsRow {
  return {
    flooring_id: finishes.flooringId === STARTER_HOUSE_FINISHES.flooringId ? null : finishes.flooringId,
    wallpaper_id: finishes.wallpaperId === STARTER_HOUSE_FINISHES.wallpaperId ? null : finishes.wallpaperId,
  };
}

/**
 * その利用者の壁紙・床板を取得する。
 * @param userId - 利用者のid
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 壁紙・床板（行が無ければ最初の壁紙・床板）
 */
export async function fetchHouseFinishes(
  userId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<HouseFinishes> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("house_interior_settings")
    .select("wallpaper_id, flooring_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return toHouseFinishes((data ?? null) as HouseInteriorSettingsRow | null);
}

/**
 * 壁紙・床板を保存する。まだ行が無ければ作り、あれば書き換える。
 * 持っていない壁紙・床板は、DBのトリガーが断る。
 * @param userId - 利用者のid
 * @param finishes - 壁紙・床板
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 */
export async function saveHouseFinishes(
  userId: string,
  finishes: HouseFinishes,
  client?: Pick<SupabaseClient, "from">,
): Promise<void> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient.from("house_interior_settings").upsert(
    { ...toHouseInteriorSettingsRow(finishes), updated_at: new Date().toISOString(), user_id: userId },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}
