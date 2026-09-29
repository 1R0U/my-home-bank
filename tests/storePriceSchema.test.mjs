import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(
  new URL("../supabase/migrations/20260929000000_apply_price_index_to_store.sql", import.meta.url),
  "utf8",
);

test("表示と購入が同じ販売価格関数を使う", () => {
  assert.match(sql, /create function private\.store_sale_price/i);
  assert.match(sql, /create function public\.get_current_store_catalog[\s\S]*private\.store_sale_price/i);
  assert.match(
    sql,
    /create or replace function private\.purchase_store_item_with_treasury_unchecked[\s\S]*v_sale_price := private\.store_sale_price/i,
  );
});

test("購入額をクライアント引数にせず、価格根拠と実売価格を履歴へ保存する", () => {
  assert.doesNotMatch(sql, /purchase_store_item_with_treasury_unchecked\([^)]*p_(amount|price)/i);
  assert.match(sql, /store_base_price = v_item\.price/i);
  assert.match(sql, /store_price_index = v_snapshot\.price_index/i);
  assert.match(sql, /store_sale_price = v_sale_price/i);
  assert.match(sql, /values \(p_user_id, 'store_purchase', v_item\.title, -v_sale_price\)/i);
  assert.match(sql, /num_nonnulls\(store_base_price, store_price_index, store_sale_price\) = 3/i);
});
