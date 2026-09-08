/** ストア画面で1つの棚に表示する商品数のデフォルト値 */
export const ITEMS_PER_SHELF = 3;

/**
 * 商品配列を棚ごとに分割する（ストア画面の表示用）。
 * @param items - 分割する商品配列
 * @param itemsPerShelf - 1つの棚に表示する商品数（デフォルト: ITEMS_PER_SHELF）
 * @returns 棚ごとに分割された2次元配列
 * @throws itemsPerShelf が1未満または整数でない場合
 */
export function splitIntoShelves<T>(items: T[], itemsPerShelf = ITEMS_PER_SHELF) {
  if (!Number.isSafeInteger(itemsPerShelf) || itemsPerShelf < 1) {
    throw new RangeError("棚あたりの商品数は1以上の整数にしてください");
  }

  const shelves: T[][] = [];

  for (let index = 0; index < items.length; index += itemsPerShelf) {
    shelves.push(items.slice(index, index + itemsPerShelf));
  }

  return shelves;
}
