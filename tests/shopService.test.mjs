import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { ASSET_DEFINITIONS, getPlaceableDecorations, getWearableSlot } from "../lib/rpg-hub/catalog.ts";
import {
  fetchShopCatalog,
  isKnownShopItem,
  isShopPriceChangedError,
  purchaseShopItem,
  resolveShopPurchaseErrorMessage,
} from "../lib/shopService.ts";

/**
 * 着せ替え品・装飾品の購入（Issue #225）。
 */

const rpcReturning = (data, error = null) => ({
  async rpc() {
    return { data, error };
  },
});

const rawItem = (overrides = {}) => ({
  asset_id: "wearable-straw-hat",
  base_price: 200,
  id: "item-1",
  kind: "wearable",
  owned: false,
  price_index: 105,
  sale_price: 210,
  title: "むぎわらぼうし",
  ...overrides,
});

test("品書きを、物価指数と「もう持っているか」付きで受け取る", async () => {
  const catalog = await fetchShopCatalog(
    rpcReturning({
      items: [rawItem(), rawItem({ asset_id: "decoration-lamp", id: "item-2", kind: "decoration", owned: true })],
      price_index: 105,
    }),
  );

  assert.equal(catalog.priceIndex, 105);
  assert.deepEqual(
    catalog.items.map((item) => [item.asset_id, item.sale_price, item.owned]),
    [
      ["wearable-straw-hat", 210, false],
      ["decoration-lamp", 210, true],
    ],
  );
});

test("このアプリのカタログに無い品は棚に出さない", async () => {
  // DBに新しい品を足したあとも、古いアプリで「買えるのに何も出ない」品を並べない
  const catalog = await fetchShopCatalog(
    rpcReturning({
      items: [
        rawItem({ asset_id: "wearable-future-hat", id: "item-9" }),
        // 種類の申告がカタログと食い違うもの
        rawItem({ asset_id: "decoration-lamp", id: "item-8", kind: "wearable" }),
        rawItem(),
      ],
      price_index: 105,
    }),
  );

  assert.deepEqual(catalog.items.map((item) => item.id), ["item-1"]);
});

test("価格がおかしい品書きは受け取らない", async () => {
  await assert.rejects(
    () => fetchShopCatalog(rpcReturning({ items: [rawItem({ sale_price: 0 })], price_index: 105 })),
    /価格が不正/,
  );
  await assert.rejects(
    () => fetchShopCatalog(rpcReturning({ items: [rawItem({ price_index: 100 })], price_index: 105 })),
    /価格が不正/,
  );
  await assert.rejects(() => fetchShopCatalog(rpcReturning({ items: [], price_index: 120 })), /価格情報/);
});

test("買うときは、品・キー・画面の販売価格をRPCへ渡す", async () => {
  let called;
  const client = {
    async rpc(fn, args) {
      called = { args, fn };
      return { data: "tx-1", error: null };
    },
  };

  assert.equal(await purchaseShopItem("item-1", " key-1 ", 210, client), "tx-1");
  assert.deepEqual(called, {
    args: { p_expected_sale_price: 210, p_idempotency_key: "key-1", p_shop_item_id: "item-1" },
    fn: "purchase_shop_item",
  });
});

test("キーや価格がおかしければ、RPCを呼ぶ前に断る", async () => {
  const client = {
    async rpc() {
      throw new Error("呼ばれてはいけない");
    },
  };
  await assert.rejects(() => purchaseShopItem("item-1", "  ", 210, client), /idempotencyKey/);
  await assert.rejects(() => purchaseShopItem("item-1", "key", 0, client), /expectedSalePrice/);
  await assert.rejects(() => purchaseShopItem("item-1", "key", 1.5, client), /expectedSalePrice/);
});

test("断られた理由を、子供に見せる言葉にする", () => {
  // Supabase のエラーは Error ではなくプレーンなオブジェクトで届く
  assert.equal(resolveShopPurchaseErrorMessage({ message: "Wallet残高が不足しています" }), "所持ゴルが足りません");
  assert.equal(resolveShopPurchaseErrorMessage({ message: "その品はもう持っています" }), "もう持っています");
  assert.equal(
    resolveShopPurchaseErrorMessage({ message: "表示後に価格が変わりました。商品一覧を更新してください" }),
    "価格が変わりました。もう一度確認してください",
  );
  assert.equal(resolveShopPurchaseErrorMessage(new Error("network")), "購入に失敗しました");
  assert.equal(isShopPriceChangedError({ message: "表示後に価格が変わりました" }), true);
  assert.equal(isShopPriceChangedError({ message: "その品はもう持っています" }), false);
});

// --- DBの品書きとアプリのカタログ ---

const seedFile = readdirSync("supabase/migrations").find((name) => name.endsWith("_seed_shop_items.sql"));
const seedRows = [
  ...readFileSync(`supabase/migrations/${seedFile}`, "utf8").matchAll(
    /\('((?:wearable|decoration)-[a-z-]+)',\s*'(wearable|decoration)',\s*'([^']+)',\s*(null|\d+),\s*(true|false)/g,
  ),
].map(([, assetId, kind, title, price, isStarter]) => ({ assetId, isStarter: isStarter === "true", kind, price, title }));

test("品書きに入れた品は、すべてアプリのカタログに同じ種類・同じ名前で載っている", () => {
  assert.ok(seedRows.length > 0, "品書きのマイグレーションを読めていない");
  const labels = new Map(ASSET_DEFINITIONS.map((definition) => [definition.id, definition.label]));
  for (const row of seedRows) {
    assert.ok(isKnownShopItem({ asset_id: row.assetId, kind: row.kind }), `${row.assetId} がカタログに無い`);
    assert.equal(row.title, labels.get(row.assetId), `${row.assetId} の名前がカタログと違う`);
  }
});

test("子供が選べる着せ替え品・装飾品は、すべて品書きにある（最初から持っているか、買えるか）", () => {
  // 品書きに無い品は、だれも手に入れられない
  const seeded = new Set(seedRows.map((row) => row.assetId));
  const wearables = ASSET_DEFINITIONS.filter((definition) => getWearableSlot(definition.id) !== null).map(
    (definition) => definition.id,
  );
  const missing = [...wearables, ...getPlaceableDecorations()].filter((assetId) => !seeded.has(assetId));
  assert.deepEqual(missing, []);
});

test("最初から持っている品は値段を持たず、買う品は値段を持つ", () => {
  for (const row of seedRows) {
    assert.equal(row.price === "null", row.isStarter, row.assetId);
  }
});
