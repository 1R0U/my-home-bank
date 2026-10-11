import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";

/**
 * DBで再計算した価格と在庫を使い、子どものWalletからギルド金庫へ支払う。
 * 画面の販売価格は決済額として信用せず、再計算額との照合にだけ使う。
 */
export async function purchaseStoreItem(
  userId: string,
  storeItemId: string,
  idempotencyKey: string,
  expectedSalePrice: number,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<string> {
  if (idempotencyKey.trim().length < 1 || idempotencyKey.trim().length > 200) {
    throw new Error("有効なidempotencyKeyを指定してください");
  }
  if (!Number.isSafeInteger(expectedSalePrice) || expectedSalePrice <= 0) {
    throw new Error("有効なexpectedSalePriceを指定してください");
  }

  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("purchase_store_item", {
    p_user_id: userId,
    p_store_item_id: storeItemId,
    p_idempotency_key: idempotencyKey.trim(),
    p_expected_sale_price: expectedSalePrice,
  });

  if (error) throw error;
  return data as string;
}
