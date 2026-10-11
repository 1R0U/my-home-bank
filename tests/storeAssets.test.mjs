import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { STORE_ASSETS, availableDecorationCount, getStoreAssetKind } from "../lib/storeAssets.ts";
import { canPurchaseItem, resolvePurchaseErrorMessage } from "../lib/storeUtils.ts";
import { toOwnedWearables } from "../lib/rpg-hub/wardrobe.ts";

test("販売カタログは着せ替え品と名前のある装飾だけで、DBの許可リストと一致する", () => {
  const sql = readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort()
    .map((file) => readFileSync(`supabase/migrations/${file}`, "utf8")).join("\n");
  const entries = [...sql.matchAll(/\('((?:wearable|decoration)-[^']+)', '(wearable|decoration)'\)/g)].map(([, id, kind]) => ({ id, kind }));
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
  const sql = readFileSync("supabase/migrations/20261011113831_configure_automatic_store_assets.sql", "utf8");
  const names = [...sql.matchAll(/\('((?:wearable|decoration)-[^']+)', '([^']+)'\)/g)]
    .map(([, id, label]) => ({ id, label }));
  assert.deepEqual(names, STORE_ASSETS.map(({ id, label }) => ({ id, label })));
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
