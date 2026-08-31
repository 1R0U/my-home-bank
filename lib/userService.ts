import { supabase } from "./supabase";

/** 現在の残高を取得する（承認・購入などの操作後に画面表示を最新化するため）。 */
export async function fetchUserBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("users")
    .select("balance")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return (data as { balance: number }).balance;
}
