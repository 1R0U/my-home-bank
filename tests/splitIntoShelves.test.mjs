import assert from "node:assert/strict";
import test from "node:test";
import { splitIntoShelves } from "../components/store/splitIntoShelves.ts";

test("商品が0件なら棚も0件になる", () => {
  assert.deepEqual(splitIntoShelves([]), []);
});

test("商品が3件なら1つの棚にまとまる", () => {
  const items = ["item-1", "item-2", "item-3"];

  assert.deepEqual(splitIntoShelves(items), [items]);
});

test("商品が4件なら3件と1件の2つの棚に分かれる", () => {
  const items = ["item-1", "item-2", "item-3", "item-4"];

  assert.deepEqual(splitIntoShelves(items), [items.slice(0, 3), items.slice(3)]);
});

test("商品が6件なら3件ずつ2つの棚に分かれる", () => {
  const items = ["item-1", "item-2", "item-3", "item-4", "item-5", "item-6"];

  assert.deepEqual(splitIntoShelves(items), [items.slice(0, 3), items.slice(3)]);
});
