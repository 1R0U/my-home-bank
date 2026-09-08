import type { StoreItem } from "../types";

/**
 * 在庫管理機能が未実装の間、「無制限在庫」を表すために使う特殊値。
 * 将来在庫管理を実装する際は、この定数を参照している箇所を洗い出すこと。
 */
export const UNLIMITED_STOCK = 999999;

export function isOutOfStock(item: Pick<StoreItem, "stock">): boolean {
  return item.stock <= 0;
}

export function hasInsufficientBalance(item: Pick<StoreItem, "price">, balance: number): boolean {
  return balance < item.price;
}

/** 「購入する」ボタンを押せる状態か（ライブ接続中・在庫あり・残高が足りている場合のみ）。 */
export function canPurchaseItem(
  item: Pick<StoreItem, "stock" | "price">,
  balance: number,
  isLive: boolean,
): boolean {
  return isLive && !isOutOfStock(item) && !hasInsufficientBalance(item, balance);
}

/**
 * 購入失敗時に画面へ表示する日本語メッセージを返す。
 * purchase_store_item（DB関数）は英語で raise exception するため、そのまま出さず
 * 既知の原因は固定の日本語に、それ以外は汎用メッセージにフォールバックする。
 * クライアント側で在庫切れ・残高不足が分かっている場合は flags で明示できる。
 */
export function resolvePurchaseErrorMessage(
  error: unknown,
  flags?: { outOfStock?: boolean; insufficientBalance?: boolean },
): string {
  const raw = error instanceof Error ? error.message : "";
  if (flags?.outOfStock || /out of stock/i.test(raw)) return "在庫がありません";
  if (flags?.insufficientBalance || /insufficient balance/i.test(raw)) {
    return "所持ポイントが足りません";
  }
  return "購入に失敗しました";
}
