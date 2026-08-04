export const ITEMS_PER_SHELF = 3;

export function splitIntoShelves<T>(items: T[], itemsPerShelf = ITEMS_PER_SHELF) {
  const shelves: T[][] = [];

  for (let index = 0; index < items.length; index += itemsPerShelf) {
    shelves.push(items.slice(index, index + itemsPerShelf));
  }

  return shelves;
}
