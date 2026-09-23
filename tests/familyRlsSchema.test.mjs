import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("family_idの列追加・既存行補完・NOT NULL化を別マイグレーションに分ける", async () => {
  const add = await read("supabase/migrations/20260923000000_add_family_scope_columns.sql");
  const backfill = await read("supabase/migrations/20260923000100_backfill_family_scope.sql");
  const enforce = await read("supabase/migrations/20260923000200_enforce_family_scope.sql");

  for (const table of ["quests", "quest_logs", "store_item_requests", "task_reports", "store_items"]) {
    assert.match(add, new RegExp(`alter table public\\.${table}[\\s\\S]*add column if not exists family_id`, "i"));
    assert.match(enforce, new RegExp(`alter table public\\.${table} alter column family_id set not null`, "i"));
  }
  assert.doesNotMatch(add, /set not null/i);
  assert.match(backfill, /update public\.users[\s\S]*where family_id is null/i);
  assert.match(backfill, /既存の家庭/);
});

test("共有テーブルは家庭単位、個人テーブルは本人単位のRLSを持つ", async () => {
  const sql = await read("supabase/migrations/20260923000300_enable_family_rls.sql");

  for (const table of ["quests", "quest_logs", "store_item_requests", "task_reports", "store_items"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`${table}[^\\n]*select_family[\\s\\S]*family_id = public\\.current_user_family_id\\(\\)`, "i"));
  }
  for (const table of ["transactions", "bank_accounts", "placed_decorations", "owned_items", "equipped_items"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /transactions_select_self[\s\S]*user_id = auth\.uid\(\)/i);
  assert.match(sql, /bank_accounts_select_self[\s\S]*user_id = auth\.uid\(\)/i);
});

test("SECURITY DEFINER RPCは公開ラッパーで本人と家庭を検証する", async () => {
  const sql = await read("supabase/migrations/20260923000400_secure_family_rpcs.sql");

  assert.match(sql, /auth\.uid\(\) is distinct from p_user_id/i);
  assert.match(sql, /auth\.uid\(\) is distinct from p_approver_id/i);
  assert.match(sql, /role = 'parent'/i);
  assert.match(sql, /family_id = public\.current_user_family_id\(\)/i);
  assert.match(sql, /revoke all on function public\.purchase_store_item\(uuid, uuid\) from public, anon/i);
});

test("クライアント一覧取得もfamily_idを明示する", async () => {
  const taskService = await read("lib/taskService.ts");
  const storeService = await read("lib/storeService.ts");

  assert.match(taskService, /from\("quests"\)[\s\S]*\.eq\("family_id", familyId\)/);
  assert.match(storeService, /from\("store_items"\)[\s\S]*\.eq\("family_id", familyId\)/);
  assert.match(storeService, /from\("users"\)[\s\S]*\.eq\("family_id", familyId\)/);
});
