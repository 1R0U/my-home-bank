import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import { parseHouseLayout, type HouseLayout } from "./rpg-hub/houseLayout.ts";

/**
 * 家の中の配置（もようがえ）を `house_layouts` とやり取りする（Issue #244）。
 *
 * 1人1行。読み取りは本人と同じ家族まで広げている（他の家族の家の中を見られるように）。
 * 書き込み（upsert）は本人のみ（RLS。呼び分けは `lib/useHouseLayout.ts` 側で行う）。
 */

/**
 * その利用者の配置を取得する。
 * @param userId - 持ち主の `users.id`
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 配置。まだ一度も保存していなければ null
 */
export async function fetchHouseLayout(
  userId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<HouseLayout | null> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("house_layouts")
    .select("closet_x, placed")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (data === null) return null;

  const row = data as { closet_x: number; placed: unknown };
  return parseHouseLayout({ closetX: row.closet_x, placed: row.placed });
}

/**
 * 配置を保存する。
 *
 * `user_id` が主キーなので、初回保存も変更も upsert 1本で済む。
 * @param userId - 持ち主の `users.id`
 * @param layout - 保存する配置
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 */
export async function saveHouseLayout(
  userId: string,
  layout: HouseLayout,
  client?: Pick<SupabaseClient, "from">,
): Promise<void> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient
    .from("house_layouts")
    .upsert(
      { closet_x: layout.closetX, placed: layout.placed, updated_at: new Date().toISOString(), user_id: userId },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}
