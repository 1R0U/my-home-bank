import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../supabase/migrations/20260928000300_get_current_month_treasury_flow.sql", import.meta.url),
  "utf8",
);

test("月次金庫入出金RPCは親を検証し、日本時間の月境界内をDBで集計する", () => {
  assert.match(sql, /v_role <> 'parent'/i);
  assert.match(sql, /private\.family_month_start\(v_month\)/i);
  assert.match(sql, /created_at >= v_month_start/i);
  assert.match(sql, /created_at < v_next_month_start/i);
  assert.match(sql, /to_account_type = 'treasury'/i);
  assert.match(sql, /from_account_type = 'treasury'/i);
});

test("月次金庫入出金RPCはanonへ公開しない", () => {
  assert.match(sql, /revoke all on function public\.get_current_month_treasury_flow\(\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.get_current_month_treasury_flow\(\) to authenticated/i);
});
