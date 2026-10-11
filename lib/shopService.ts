import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import { getPlaceableDecorations, getWearableSlot } from "./rpg-hub/catalog.ts";
import type { PricedStoreItem, ShopCatalogItem } from "../types";

/**
 * 着せ替え品・装飾品の品書き（`shop_items`）とやり取りする（Issue #225）。
 *
 * 子供用ストアの「きせかえ・かざり」の棚で使う。お金の流れはストアの商品と同じで、
 * 子供の所持ゴルからギルド金庫へ払い、物価指数を掛けた販売価格で記帳する。
 * 買った品は `owned_items` に所有として残る（DB側の `purchase_shop_item` が同じ
 * トランザクションで記録する）。
 */

export type ShopCatalog = {
  priceIndex: PricedStoreItem["price_index"];
  items: ShopCatalogItem[];
};

const PRICE_INDEXES = new Set([95, 100, 105, 110]);

/**
 * このアプリで表示できる品か。
 *
 * 品書きはDBにあり、見た目はアプリのカタログにある。DBに新しい品を足したあと、
 * 古いアプリが知らない品を「買えるのに何も出てこない」状態で並べないよう、
 * カタログに載っていない品は棚に出さない。
 * @param item - 品書きの1件
 * @returns カタログに同じ種類として載っていれば true
 */
export function isKnownShopItem(item: Pick<ShopCatalogItem, "asset_id" | "kind">): boolean {
  if (item.kind === "wearable") return getWearableSlot(item.asset_id) !== null;
  if (item.kind === "decoration") {
    return (getPlaceableDecorations() as string[]).includes(item.asset_id);
  }
  return false;
}

/**
 * 買う品の一覧を、物価指数を掛けた販売価格と「もう持っているか」付きで取得する。
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 物価指数と、アプリで表示できる品（DBの並び順のまま）
 */
export async function fetchShopCatalog(client?: Pick<SupabaseClient, "rpc">): Promise<ShopCatalog> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("get_shop_catalog");

  if (error) throw error;

  const priceIndex = Number(data?.price_index);
  if (!PRICE_INDEXES.has(priceIndex) || !Array.isArray(data?.items)) {
    throw new Error("きせかえ・かざりの価格情報を取得できませんでした");
  }

  const items = data.items.map((raw: Record<string, unknown>) => ({
    id: String(raw.id),
    asset_id: String(raw.asset_id),
    kind: raw.kind,
    title: String(raw.title),
    base_price: Number(raw.base_price),
    price_index: Number(raw.price_index),
    sale_price: Number(raw.sale_price),
    owned: raw.owned === true,
  })) as ShopCatalogItem[];

  if (
    items.some(
      (item) =>
        item.price_index !== priceIndex ||
        !Number.isSafeInteger(item.base_price) ||
        !Number.isSafeInteger(item.sale_price) ||
        item.base_price <= 0 ||
        item.sale_price <= 0,
    )
  ) {
    throw new Error("きせかえ・かざりの価格が不正です");
  }

  return {
    priceIndex: priceIndex as ShopCatalog["priceIndex"],
    items: items.filter(isKnownShopItem),
  };
}

/**
 * 着せ替え品・装飾品を1つ買う。
 *
 * 画面の販売価格は決済額として信用せず、DBが計算し直した価格との照合にだけ使う
 * （ストアの購入と同じ）。同じ idempotencyKey で2回届いても1回ぶんになる。
 * @param shopItemId - 品書きのid
 * @param idempotencyKey - 同じ購入の再送を見分けるキー（1〜200文字）
 * @param expectedSalePrice - 画面に出していた販売価格
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 台帳の取引id
 */
export async function purchaseShopItem(
  shopItemId: string,
  idempotencyKey: string,
  expectedSalePrice: number,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<string> {
  const key = idempotencyKey.trim();
  if (key.length < 1 || key.length > 200) {
    throw new Error("有効なidempotencyKeyを指定してください");
  }
  if (!Number.isSafeInteger(expectedSalePrice) || expectedSalePrice <= 0) {
    throw new Error("有効なexpectedSalePriceを指定してください");
  }

  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("purchase_shop_item", {
    p_shop_item_id: shopItemId,
    p_idempotency_key: key,
    p_expected_sale_price: expectedSalePrice,
  });

  if (error) throw error;
  return data as string;
}

/**
 * 購入の失敗を、子供に見せる言葉へ直す。
 * @param error - `purchaseShopItem` が投げたもの（Supabaseのエラーはプレーンなオブジェクト）
 * @returns 画面に出す文
 */
export function resolveShopPurchaseErrorMessage(error: unknown): string {
  const raw =
    typeof (error as { message?: unknown } | null)?.message === "string"
      ? (error as { message: string }).message
      : "";
  if (/Wallet残高が不足/.test(raw)) return "所持ゴルが足りません";
  if (/もう持っています/.test(raw)) return "もう持っています";
  if (/表示後に価格が変わりました/.test(raw)) return "価格が変わりました。もう一度確認してください";
  if (/購入できる品が見つかりません/.test(raw)) return "いまは買えない品です";
  return "購入に失敗しました";
}

/**
 * 価格が変わったために断られたか（品書きを取り直す合図）。
 * @param error - `purchaseShopItem` が投げたもの
 */
export function isShopPriceChangedError(error: unknown): boolean {
  const raw =
    typeof (error as { message?: unknown } | null)?.message === "string"
      ? (error as { message: string }).message
      : "";
  return /表示後に価格が変わりました/.test(raw);
}
