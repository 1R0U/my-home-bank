import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";

/**
 * DBに保存された価格と在庫を使い、子どものWalletからギルド金庫へ支払う。
 * 商品一覧・購入UIからは価格を渡さず、商品IDだけを指定する。
 */
export async function purchaseStoreItem(
  userId: string,
  storeItemId: string,
  idempotencyKey: string,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<string> {
  if (idempotencyKey.trim().length < 1 || idempotencyKey.trim().length > 200) {
    throw new Error("有効なidempotencyKeyを指定してください");
  }

  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("purchase_store_item", {
    p_user_id: userId,
    p_store_item_id: storeItemId,
    p_idempotency_key: idempotencyKey.trim(),
  });

  if (error) throw error;
  return data as string;
}
