import type { PricedStoreItem, StoreItem } from "../types";

type StorePriceLike = Pick<StoreItem, "price"> & Partial<Pick<PricedStoreItem, "sale_price">>;

/** 販売価格付きなら実売価格を、従来データなら基準価格を返す。 */
export function getStoreItemDisplayPrice(item: StorePriceLike): number {
  return item.sale_price ?? item.price;
}

/** 物価指数を子ども向けの短い表現へ変換する。 */
export function describeChildPriceIndex(index: PricedStoreItem["price_index"]): string {
  switch (index) {
    case 95:
      return "おかいどき（デフレ）";
    case 100:
      return "いつもの ねだん（安定）";
    case 105:
      return "すこし たかめ（インフレ気味）";
    case 110:
      return "かなり たかめ（強いインフレ）";
  }
}
