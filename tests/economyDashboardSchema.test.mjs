import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../supabase/migrations/20260928000200_get_economy_price_overview.sql", import.meta.url),
  "utf8",
);

test("親用物価概要RPCは親ロールを検証し、正式なgol項目を返す", () => {
  assert.match(sql, /create function public\.get_economy_price_overview\(\)/i);
  assert.match(sql, /v_role <> 'parent'/i);
  assert.match(sql, /get_or_create_monthly_price_index\(\)/i);
  assert.match(
    sql,
    /snapshot_month = \(v_current\.snapshot_month - interval '1 month'\)::date/i,
  );
  assert.match(sql, /'avg_circulating_gol', v_current\.avg_circulating_gol/i);
  assert.match(sql, /'target_gol', v_current\.target_gol/i);
});

test("親用物価概要RPCはanonへ公開せずauthenticatedだけに実行を許可する", () => {
  assert.match(sql, /revoke all on function public\.get_economy_price_overview\(\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.get_economy_price_overview\(\) to authenticated/i);
});
