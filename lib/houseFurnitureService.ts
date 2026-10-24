import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import { type HouseFurnitureLayout, isMovableFurnitureId } from "./rpg-hub/houseFurniture.ts";

/**
 * 家の中の家具の位置と向き（`house_furniture_layouts`）とやり取りする（Issue #477）。
 *
 * 保存するのは「どの家具を・どこに・どの向きで・しまったか」だけ。見た目・大きさ・使い方は
 * `lib/rpg-hub/houseInterior.ts` の定数が持つ。行の無い家具は、その定数の位置に置く。
 * しまったか（`stored`）はアプリから直接書けず、`storeHouseFurniture`（DBの関数）だけが変える（Issue #506）。
 */

/**
 * `house_furniture_layouts` の1行（読むときに使う列だけ）。
 * `numeric` は取得時に文字列で返ることがあるため、数値として扱う前に必ず `Number` を通す。
 */
export type HouseFurnitureLayoutRow = {
  furniture_id: string;
  position_x: number | string;
  position_z: number | string;
  rotation_y: number | string;
  /** しまったか（Issue #506） */
  stored: boolean;
};

/**
 * DBの行を、アプリで使う形にする。**壊れた行は捨てる**（家具が最初の位置に出るだけで、遊べなくはならない）。
 * @param rows - DBの行
 * @returns 位置と向き
 */
export function toHouseFurnitureLayouts(rows: readonly HouseFurnitureLayoutRow[]): HouseFurnitureLayout[] {
  return rows.flatMap((row) => {
    const layout = {
      furnitureId: row.furniture_id,
      rotationY: Number(row.rotation_y),
      stored: row.stored === true,
      x: Number(row.position_x),
      z: Number(row.position_z),
    };
    const valid =
      isMovableFurnitureId(layout.furnitureId) &&
      [layout.rotationY, layout.x, layout.z].every((value) => Number.isFinite(value));
    return valid ? [layout] : [];
  });
}

/**
 * その利用者の家具の位置と向きをすべて取得する。
 * @param userId - 利用者のid
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 位置と向き（行の無い家具は含まない）
 */
export async function fetchHouseFurnitureLayouts(
  userId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<HouseFurnitureLayout[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("house_furniture_layouts")
    .select("furniture_id, position_x, position_z, rotation_y, stored")
    .eq("user_id", userId);

  if (error) throw error;
  return toHouseFurnitureLayouts((data ?? []) as HouseFurnitureLayoutRow[]);
}

/**
 * 家具の位置と向きを保存する。まだ行が無ければ作り、あれば書き換える。
 * @param userId - 利用者のid
 * @param layout - 位置と向き
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 */
export async function saveHouseFurnitureLayout(
  userId: string,
  layout: HouseFurnitureLayout,
  client?: Pick<SupabaseClient, "from">,
): Promise<void> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient.from("house_furniture_layouts").upsert(
    {
      furniture_id: layout.furnitureId,
      position_x: layout.x,
      position_z: layout.z,
      rotation_y: layout.rotationY,
      updated_at: new Date().toISOString(),
      user_id: userId,
    },
    { onConflict: "user_id,furniture_id" },
  );

  if (error) throw error;
}

/**
 * 家具をしまう（Issue #506）。しまった家具は家の中に出なくなり、同じ見た目の装飾が持ち物に1つ入る。
 * 同じ家具を2回しまっても、持ち物は1つしか増えない（DBの関数 `store_house_furniture` が決める）。
 * @param furnitureId - しまう家具のid
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 */
export async function storeHouseFurniture(
  furnitureId: string,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<void> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient.rpc("store_house_furniture", { p_furniture_id: furnitureId });

  if (error) throw error;
}
