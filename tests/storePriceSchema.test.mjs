import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(
  new URL("../supabase/migrations/20260929000300_apply_price_index_to_store.sql", import.meta.url),
  "utf8",
);

test("表示と購入が同じ販売価格関数を使う", () => {
  assert.match(sql, /create function private\.store_sale_price/i);
  assert.match(sql, /create function public\.get_current_store_catalog[\s\S]*private\.store_sale_price/i);
  assert.match(
    sql,
    /create function private\.purchase_store_item_with_treasury_unchecked[\s\S]*v_sale_price := private\.store_sale_price/i,
  );
});

test("画面の価格は照合だけに使い、DB再計算額と価格根拠を履歴へ保存する", () => {
  assert.match(sql, /v_sale_price is distinct from p_expected_sale_price/i);
  assert.match(sql, /表示後に価格が変わりました/i);
  assert.match(sql, /store_base_price = v_item\.price/i);
  assert.match(sql, /store_price_index = v_snapshot\.price_index/i);
  assert.match(sql, /store_sale_price = v_sale_price/i);
  assert.match(sql, /values \(p_user_id, 'store_purchase', v_item\.title, -v_sale_price\)/i);
  assert.match(sql, /num_nonnulls\(store_base_price, store_price_index, store_sale_price\) = 3/i);
});

test("指数100では既存商品の基準価格を変えない", () => {
  assert.match(sql, /if p_price_index = 100 then\s+return p_base_price/i);
});

test("親は非公開商品も管理でき、子どもの直接参照は公開商品だけに制限する", () => {
  assert.match(
    sql,
    /create policy store_items_select_family[\s\S]*is_active[\s\S]*role = 'parent'/i,
  );
});
