import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";

type Client = Pick<SupabaseClient, "rpc">;

/** 日本時間（UTC+9）のずれ（ミリ秒）。 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 日本時間での日付を「YYYY-MM-DD」で返す（Issue #355）。
 *
 * 同じ日に何度もアプリを開いたとき、記録の呼び出しを1回にまとめるために使う。
 * 実際にどの日として記録するかはDBの時計で決まるので、端末の時計がずれていても記録はずれない。
 * @param date - 日時
 * @returns 日本時間の日付
 */
export function toJstDateKey(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

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
