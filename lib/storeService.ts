import { supabase } from "./supabase";
import type { StoreItem } from "../types";

/**
 * Supabase の store_items とやり取りする関数群。
 * Issue #64: ストア機能をSupabaseに繋ぐ
 */

export async function fetchStoreItems(): Promise<StoreItem[]> {
  const { data, error } = await supabase
    .from("store_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as StoreItem[];
}

export type CreateStoreItemInput = {
  title: string;
  description: string;
  price: number;
  stock: number;
  requested_by: string;
};

export async function createStoreItem(input: CreateStoreItemInput): Promise<StoreItem> {
  const { data, error } = await supabase
    .from("store_items")
    .insert(input)
    .select("*")
    .single();

  if (error) throw error;
  return data as StoreItem;
}

/**
 * アイテムを購入する。
 * 在庫確認・残高確認・在庫減算・users.balance減算・transactions記帳を
 * DB側の1トランザクション（purchase_store_item関数）で実行する。
 */
export async function purchaseStoreItem(itemId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("purchase_store_item", {
    p_item_id: itemId,
    p_user_id: userId,
  });

  if (error) throw error;
}

/** 現在の残高を取得する（購入後の表示更新用）。 */
export async function fetchUserBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("users")
    .select("balance")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return (data as { balance: number }).balance;
}

/** 依頼人名の表示解決用に、家族のユーザー一覧を取得する。 */
export async function fetchFamilyUsers(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from("users").select("id, name");

  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}
