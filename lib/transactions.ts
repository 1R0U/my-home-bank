import type { SupabaseClient } from "@supabase/supabase-js";
import type { Transaction } from "../types";

async function resolveClient<T>(client: T | undefined): Promise<T> {
  if (client) return client;
  const { supabase } = await import("./supabase");
  return supabase as unknown as T;
}

/**
 * 指定ユーザーの取引履歴を新しい順に取得する。
 * @param userId - 対象ユーザーのid
 * @param client - Supabaseクライアント（テスト時にモックを差し替え可能。省略時は実クライアントを遅延読み込みする）
 * @throws 取得に失敗した場合、日本語メッセージのエラー
 */
export async function fetchTransactions(
  userId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<Transaction[]> {
  const resolvedClient = await resolveClient(client);

  const { data, error } = await resolvedClient
    .from("transactions")
    .select("id, user_id, type, description, amount, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("取引履歴の取得に失敗しました。時間をおいて再度お試しください。");
  }

  return data ?? [];
}
