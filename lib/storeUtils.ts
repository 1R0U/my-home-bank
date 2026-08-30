import type { StoreItem } from "../types";

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
