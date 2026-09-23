import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import type { StoreItem } from "../types";

/**
 * Supabase の store_items とやり取りする関数群。
 * Issue #64: ストア機能をSupabaseに繋ぐ
 *
 * 各関数は client 引数で Supabase クライアントを差し替え可能（テスト用）。
 * 省略時は実クライアント（./supabase）を遅延読み込みする（lib/supabaseClient.ts の
 * resolveClient を参照）。単体テストからこのファイルを読み込んでも、実際に呼び出さない
 * 限り RN 依存の実クライアントは読み込まれない。
 *
 * 残高取得（fetchUserBalance）は lib/userService.ts に切り出されている
 * （Issue #63 のタスク機能と共有するため）。
 */

export async function fetchStoreItems(
  familyId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<StoreItem[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("store_items")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as StoreItem[];
}

export type CreateStoreItemInput = {
  family_id: string;
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

/**
 * 依頼人名の表示解決用に、ログイン中の家族のユーザー一覧を取得する。
 * usersのRLSに加えてfamily_idを明示し、不要な行を取得しない。
 */
export async function fetchFamilyUsers(
  familyId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<{ id: string; name: string }[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("users")
    .select("id, name")
    .eq("family_id", familyId);

  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}
