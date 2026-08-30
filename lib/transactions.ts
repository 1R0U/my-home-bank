import { supabase } from "./supabase";
import type { Transaction } from "../types";

export async function fetchTransactions(userId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, user_id, type, description, amount, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("取引履歴の取得に失敗しました。時間をおいて再度お試しください。");
  }

  return data ?? [];
}
