import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";

type Client = Pick<SupabaseClient, "rpc">;

/**
 * アプリを開いたことを記録する（大人の連続記録用。Issue #355）。
 *
 * 同じ日に何度呼んでも1日分にしかならない。子供が呼んでもDBは何もしない（false を返す）。
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 今回あらたに記録したか
 */
export async function recordAppOpen(client?: Client): Promise<boolean> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("record_app_open");
  if (error) throw error;
  return data === true;
}
