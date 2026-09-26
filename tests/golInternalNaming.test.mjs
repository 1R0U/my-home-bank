import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MIGRATION_DIR = new URL("../supabase/migrations/", import.meta.url);

async function readMigration(name) {
  return readFile(new URL(name, MIGRATION_DIR), "utf8");
}

test("gol列の追加・既存データ補完・必須化を別マイグレーションで行う", async () => {
  const add = await readMigration("20260926000000_add_gol_snapshot_columns.sql");
  const backfill = await readMigration("20260926000100_backfill_gol_snapshot_columns.sql");
  const switchMigration = await readMigration("20260926000200_switch_internal_currency_to_gol.sql");

  assert.match(add, /add column avg_circulating_gol numeric/i);
  assert.match(add, /add column target_gol numeric/i);
  assert.doesNotMatch(add, /set not null/i);
  assert.match(backfill, /avg_circulating_gol = avg_circulating_hmc/i);
  assert.match(backfill, /target_gol = target_hmc/i);
  assert.match(switchMigration, /alter column avg_circulating_gol set not null/i);
  assert.match(switchMigration, /alter column target_gol set not null/i);
});

test("新旧スナップショット列を同期し、不一致は拒否する", async () => {
  const add = await readMigration("20260926000000_add_gol_snapshot_columns.sql");

  assert.match(add, /create function private\.sync_economy_snapshot_gol_columns/i);
  assert.match(add, /before insert or update of[\s\S]*avg_circulating_gol[\s\S]*target_gol/i);
  assert.match(add, /新旧列に異なる値は指定できません/u);
});

test("正式な追加発行RPCをgol名にし、旧RPCは互換ラッパーだけにする", async () => {
  const sql = await readMigration("20260926000200_switch_internal_currency_to_gol.sql");
  const legacyWrapper = sql.slice(sql.indexOf("create or replace function public.issue_treasury_hmc"));

  assert.match(sql, /issue_treasury_gol/u);
  assert.match(sql, /grant execute on function public\.issue_treasury_gol\(bigint, text\) to authenticated/i);
  assert.match(legacyWrapper, /select public\.issue_treasury_gol\(p_amount, p_idempotency_key\)/i);
  assert.match(sql, /旧クライアントの利用終了確認後に削除する/u);
});

test("物価指数RPCは正式なgol列へ切り替える", async () => {
  const sql = await readMigration("20260926000200_switch_internal_currency_to_gol.sql");

  assert.match(sql, /replace\(v_definition, 'avg_circulating_hmc', 'avg_circulating_gol'\)/i);
  assert.match(sql, /replace\(v_definition, 'target_hmc', 'target_gol'\)/i);
});
