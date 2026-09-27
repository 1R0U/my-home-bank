import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MIGRATION_DIR = new URL("../supabase/migrations/", import.meta.url);

async function readMigration(name) {
  return readFile(new URL(name, MIGRATION_DIR), "utf8");
}

test("gol列の追加・既存データ補完・必須化を別マイグレーションで行う", async () => {
  const add = await readMigration("20260926000300_add_gol_snapshot_columns.sql");
  const backfill = await readMigration("20260926000400_backfill_gol_snapshot_columns.sql");
  const switchMigration = await readMigration("20260926000500_switch_internal_currency_to_gol.sql");

  assert.match(add, /add column avg_circulating_gol numeric/i);
  assert.match(add, /add column target_gol numeric/i);
  assert.doesNotMatch(add, /set not null/i);
  assert.match(backfill, /avg_circulating_gol = avg_circulating_hmc/i);
  assert.match(backfill, /target_gol = target_hmc/i);
  assert.match(switchMigration, /alter column avg_circulating_gol set not null/i);
  assert.match(switchMigration, /alter column target_gol set not null/i);
});
