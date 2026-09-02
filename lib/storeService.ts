import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreItem } from "../types";

/**
 * Supabase の store_items とやり取りする関数群。
 * Issue #64: ストア機能をSupabaseに繋ぐ
 *
 * 各関数は client 引数で Supabase クライアントを差し替え可能（テスト用）。
 * 省略時は実クライアント（./supabase）を遅延読み込みする。単体テストからこのファイルを
 * 読み込んでも、実際に呼び出さない限り RN 依存の実クライアントは読み込まれない。
 *
 * 残高取得（fetchUserBalance）は lib/userService.ts に切り出されている
 * （Issue #63 のタスク機能と共有するため）。
 */

async function resolveClient<T>(client: T | undefined): Promise<T> {
  if (client) return client;
  const { supabase } = await import("./supabase");
  return supabase as unknown as T;
}

export async function fetchStoreItems(client?: Pick<SupabaseClient, "from">): Promise<StoreItem[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
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

export async function createStoreItem(
  input: CreateStoreItemInput,
  client?: Pick<SupabaseClient, "from">,
): Promise<StoreItem> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
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
 * @param itemId - 購入するアイテムのID
 * @param userId - 購入者のユーザーID
 * @param client - Supabaseクライアント（テスト時にモックを差し替え可能）
 */
export async function purchaseStoreItem(
  itemId: string,
  userId: string,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<void> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient.rpc("purchase_store_item", {
    p_item_id: itemId,
    p_user_id: userId,
  });

  if (error) throw error;
}

/** 依頼人名の表示解決用に、家族のユーザー一覧を取得する。 */
export async function fetchFamilyUsers(
  client?: Pick<SupabaseClient, "from">,
): Promise<{ id: string; name: string }[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.from("users").select("id, name");

  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}
