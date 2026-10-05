import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import type { PricedStoreItem, StoreItem } from "../types";
import { purchaseStoreItem as purchaseStoreItemWithTreasury } from "./storePurchaseService.ts";

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

export type StoreCatalog = {
  priceIndex: PricedStoreItem["price_index"];
  items: PricedStoreItem[];
};

const PRICE_INDEXES = new Set([95, 100, 105, 110]);

/** 親画面向けに、物価指数を確定せず家庭内の商品をすべて取得する。 */
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

/** DBが計算した今月の物価指数と販売価格付きの商品一覧を取得する。 */
export async function fetchStoreCatalog(
  client?: Pick<SupabaseClient, "rpc">,
): Promise<StoreCatalog> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("get_current_store_catalog");

  if (error) throw error;

  const priceIndex = Number(data?.price_index);
  if (!PRICE_INDEXES.has(priceIndex) || !Array.isArray(data?.items)) {
    throw new Error("ストアの価格情報を取得できませんでした");
  }

  const items = data.items.map((raw: Record<string, unknown>) => ({
    ...raw,
    price: Number(raw.price),
    stock: Number(raw.stock),
    base_price: Number(raw.base_price),
    price_index: Number(raw.price_index),
    sale_price: Number(raw.sale_price),
  })) as PricedStoreItem[];

  if (
    items.some(
      (item) =>
        item.price_index !== priceIndex ||
        item.price !== item.base_price ||
        !Number.isSafeInteger(item.price) ||
        !Number.isSafeInteger(item.stock) ||
        !Number.isSafeInteger(item.base_price) ||
        !Number.isSafeInteger(item.sale_price) ||
        item.base_price <= 0 ||
        item.sale_price <= 0 ||
        item.stock < 0,
    )
  ) {
    throw new Error("ストアの商品価格が不正です");
  }

  return {
    priceIndex: priceIndex as StoreCatalog["priceIndex"],
    items,
  };
}

export type CreateStoreItemInput = {
  family_id: string;
  title: string;
  description: string;
  price: number;
  stock: number;
  requested_by: string;
  /** 商品画像の公開URL（Issue #311）。アップロードは lib/storeImageUpload.ts が担う。任意項目 */
  image_url?: string;
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
 * 在庫確認・金庫決済・在庫減算・両台帳への記帳を
 * DB側の1トランザクション（purchase_store_item関数）で実行する。
 * @param itemId - 購入するアイテムのID
 * @param userId - 購入者のユーザーID
 * @param client - Supabaseクライアント（テスト時にモックを差し替え可能）
 */
export async function purchaseStoreItem(
  itemId: string,
  userId: string,
  idempotencyKey: string,
  expectedSalePrice: number,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<void> {
  await purchaseStoreItemWithTreasury(userId, itemId, idempotencyKey, expectedSalePrice, client);
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
