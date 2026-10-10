import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";

type Client = Pick<SupabaseClient, "rpc">;

const recordedListeners = new Set<() => void>();

/**
 * アプリを開いた日があらたに記録されたときに呼ばれる関数を登録する（Issue #355）。
 *
 * 掲示板を開いたままアプリを前面に戻したとき、記録の書き込みが終わってから連続記録を
 * 取り直すために使う（画面のフォーカスは変わらないので、フォーカス時の取り直しは走らない）。
 * @param listener - 記録されたときに呼ぶ関数
 * @returns 登録を外す関数
 */
export function onAppOpenRecorded(listener: () => void): () => void {
  recordedListeners.add(listener);
  return () => {
    recordedListeners.delete(listener);
  };
}

/** アプリを開いた日があらたに記録されたことを、登録された関数へ知らせる。 */
export function notifyAppOpenRecorded(): void {
  recordedListeners.forEach((listener) => listener());
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
