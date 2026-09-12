import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260911000001_create_guild_treasury.sql",
  import.meta.url,
);
const readMigration = () => readFile(migrationUrl, "utf8");

test("家族・ギルド金庫・経済台帳を作成する", async () => {
  const sql = await readMigration();
  assert.match(sql, /create table if not exists public\.families/i);
  assert.match(sql, /create table if not exists public\.guild_treasuries/i);
  assert.match(sql, /create table if not exists public\.economy_transactions/i);
  assert.match(sql, /add column if not exists family_id uuid references public\.families/i);
});

test("金庫残高・最低準備金率・正の取引額をDB制約で守る", async () => {
  const sql = await readMigration();
  assert.match(sql, /guild_treasuries_balance_nonnegative check \(balance >= 0\)/i);
  assert.match(sql, /guild_treasuries_balance_within_supply check \(balance <= total_supply\)/i);
  assert.match(sql, /guild_treasuries_balance_safe_integer check \(balance <= 9007199254740991\)/i);
  assert.match(sql, /guild_treasuries_total_supply_safe_integer check \(total_supply <= 9007199254740991\)/i);
  assert.match(sql, /minimum_reserve_rate >= 0 and minimum_reserve_rate <= 1/i);
  assert.match(sql, /amount bigint not null check \(amount > 0 and amount <= 9007199254740991\)/i);
});

test("家族スコープのRLSとテーブル権限を設定する", async () => {
  const sql = await readMigration();
  assert.match(sql, /alter table public\.guild_treasuries enable row level security/i);
  assert.match(sql, /alter table public\.economy_transactions enable row level security/i);
  assert.match(sql, /using \(family_id = public\.current_user_family_id\(\)\)/i);
  assert.match(sql, /revoke all on table public\.guild_treasuries from anon/i);
  assert.match(sql, /revoke insert, update, delete on table public\.economy_transactions from authenticated/i);
  assert.match(sql, /create trigger protect_user_family_id_on_write/i);
  assert.match(sql, /family_idは家族管理機能からのみ変更できます/i);
});

test("冪等キーと原子的な金庫・Wallet送金を実装する", async () => {
  const sql = await readMigration();
  assert.match(sql, /idempotency_key text not null unique/i);
  assert.match(sql, /create or replace function private\.transfer_treasury_wallet/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /最低準備金を下回るため送金できません/i);
  assert.match(sql, /同じidempotency_keyが別の資金移動に使用されています/i);
  assert.match(sql, /操作ユーザーが家族に所属していません/i);
  assert.match(sql, /送金後のギルド金庫残高が家庭総HMCを超えるため送金できません/i);
  assert.match(sql, /revoke all on function private\.transfer_treasury_wallet/i);
});

test("家族作成と追加発行を認証済みの親だけに公開する", async () => {
  const sql = await readMigration();
  assert.match(sql, /create or replace function public\.create_family_with_treasury/i);
  assert.match(sql, /create or replace function public\.issue_treasury_hmc/i);
  assert.match(sql, /v_user_role <> 'parent'/i);
  assert.match(sql, /v_role <> 'parent'/i);
  assert.match(sql, /初期HMCは1HMC以上で指定してください/i);
  assert.match(sql, /同じidempotency_keyが別の追加発行に使用されています/i);
  assert.match(sql, /grant execute on function public\.issue_treasury_hmc\(bigint, text\) to authenticated/i);
});

test("家族作成と追加発行の同時リトライを行ロックで直列化する", async () => {
  const sql = await readMigration();
  const familyFunction = sql.slice(
    sql.indexOf("create or replace function public.create_family_with_treasury"),
    sql.indexOf("create or replace function public.issue_treasury_hmc"),
  );
  const issueFunction = sql.slice(
    sql.indexOf("create or replace function public.issue_treasury_hmc"),
  );
  const familyLockIndex = familyFunction.indexOf("for update");
  const familyReplayIndex = familyFunction.indexOf("where idempotency_key");
  const issueLockIndex = issueFunction.indexOf("for update");
  const issueReplayIndex = issueFunction.indexOf("where idempotency_key");

  assert.notEqual(familyLockIndex, -1);
  assert.notEqual(familyReplayIndex, -1);
  assert.notEqual(issueLockIndex, -1);
  assert.notEqual(issueReplayIndex, -1);
  assert.ok(familyLockIndex < familyReplayIndex);
  assert.ok(issueLockIndex < issueReplayIndex);
});

test("既存Wallet・預金残高を総供給量へ含め、安全整数上限を守る", async () => {
  const sql = await readMigration();
  assert.match(sql, /users\.balance[\s\S]*bank_accounts\.deposit_balance/i);
  assert.match(
    sql,
    /v_total_supply := p_initial_supply \+ v_wallet_balance::bigint \+ v_deposit_balance::bigint/i,
  );
  assert.match(
    sql,
    /values \(v_family_id, p_initial_supply, p_initial_supply, v_total_supply\)/i,
  );
  assert.match(sql, /total_supply <= 9007199254740991 - p_amount/i);
});
