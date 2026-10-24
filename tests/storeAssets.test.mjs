import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { STORE_ASSETS, availableDecorationCount, getStoreAssetKind } from "../lib/storeAssets.ts";
import { canPurchaseItem, resolvePurchaseErrorMessage } from "../lib/storeUtils.ts";
import { toOwnedWearables } from "../lib/rpg-hub/wardrobe.ts";

/** 全マイグレーションを番号順につないだSQL */
const ALL_MIGRATIONS_SQL = readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort()
  .map((file) => readFileSync(`supabase/migrations/${file}`, "utf8")).join("\n");

test("販売カタログは着せ替え品・名前のある装飾・最初のもの以外の壁紙と床板で、DBの許可リストと一致する", () => {
  // `('id', 'kind')` と、名前も一緒に入れた `('id', 'kind', '名前')`（Issue #480）の両方を拾う
  const entries = [...ALL_MIGRATIONS_SQL.matchAll(
    /\('((?:wearable|decoration|wallpaper|flooring)-[^']+)', '(wearable|decoration|wallpaper|flooring)'[,)]/g,
  )].map(([, id, kind]) => ({ id, kind }));
  const byId = (left, right) => left.id.localeCompare(right.id);
  assert.deepEqual(entries.sort(byId), STORE_ASSETS.map(({ id, kind }) => ({ id, kind })).sort(byId));
  assert.equal(getStoreAssetKind("building-bank"), null);
});
test("配置済み分だけ差し引き、しまえば未配置数が戻る", () => {
  const owned = [{ asset_id: "decoration-tree", quantity: 2 }];
  assert.equal(availableDecorationCount("decoration-tree", owned, [{ model: "decoration-tree" }]), 1);
  assert.equal(availableDecorationCount("decoration-tree", owned, []), 2);
  assert.equal(availableDecorationCount("decoration-rock", owned, []), 0);
  assert.equal(availableDecorationCount("decoration-tree", [], [{ model: "decoration-tree" }]), 0);
});

test("自動陳列の商品名がアプリの全販売カタログと一致する", () => {
  // 最初の29件は名前を後から付けた（`('id', '名前')`）。Issue #480 からは足すときに名前も入れる（`('id', 'kind', '名前')`）
  const sql = readFileSync("supabase/migrations/20261011113831_configure_automatic_store_assets.sql", "utf8");
  const named = [...sql.matchAll(/\('((?:wearable|decoration)-[^']+)', '([^']+)'\)/g)]
    .map(([, id, label]) => ({ id, label }));
  const inserted = [...ALL_MIGRATIONS_SQL.matchAll(
    /\('((?:wearable|decoration|wallpaper|flooring)-[^']+)', '(?:wearable|decoration|wallpaper|flooring)', '([^']+)'\)/g,
  )].map(([, id, label]) => ({ id, label }));
  const byId = (left, right) => left.id.localeCompare(right.id);
  assert.deepEqual([...named, ...inserted].sort(byId), STORE_ASSETS.map(({ id, label }) => ({ id, label })).sort(byId));
});
test("家に付いている最初の壁紙・床板は売らない", () => {
  assert.equal(getStoreAssetKind("wallpaper-plaster"), null);
  assert.equal(getStoreAssetKind("flooring-wood"), null);
  assert.equal(getStoreAssetKind("wallpaper-brick"), "wallpaper");
  assert.equal(getStoreAssetKind("flooring-tatami"), "flooring");
});
test("壁紙・床板は着せ替え品と同じく、持っていれば買えない", () => {
  const item = { asset_id: "wallpaper-brick", owned_quantity: 1, price: 10, stock: 5 };
  assert.equal(canPurchaseItem(item, 100, true), false);
  assert.equal(canPurchaseItem({ ...item, asset_id: "flooring-stone" }, 100, true), false);
  assert.equal(canPurchaseItem({ ...item, owned_quantity: 0 }, 100, true), true);
  assert.equal(
    resolvePurchaseErrorMessage({ code: "P0225", message: "この壁紙はすでに持っています" }),
    "この{壁紙|かべがみ}はもう{持|も}っています",
  );
  assert.equal(
    resolvePurchaseErrorMessage({ code: "P0225", message: "この床板はすでに持っています" }),
    "この{床板|ゆかいた}はもう{持|も}っています",
  );
});
test("所有済みの着せ替えを買えず、装飾は買い足せる", () => {
  const item = { asset_id: "wearable-hat", owned_quantity: 1, price: 10, stock: 5 };
  assert.equal(canPurchaseItem(item, 100, true), false);
  assert.equal(canPurchaseItem({ ...item, asset_id: "decoration-tree" }, 100, true), true);
  assert.equal(canPurchaseItem({ ...item, owned_quantity: 0 }, 100, true), true);
  assert.equal(resolvePurchaseErrorMessage({ code: "P0225", message: "この着せ替え品はすでに持っています" }), "この着せ替え品はもう持っています");
});
test("装飾の所有は着せ替えの候補にもエラーにも含めない", () => {
  const result = toOwnedWearables([{ asset_id: "decoration-tree" }, { asset_id: "wearable-hat" }]);
  assert.deepEqual(result, { assetIds: ["wearable-hat"], errors: [] });
});
