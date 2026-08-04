export const ITEMS_PER_SHELF = 3;

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
