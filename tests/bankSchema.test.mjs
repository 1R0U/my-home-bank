import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260903000000_create_bank_accounts.sql",
  import.meta.url,
);

const readMigration = () => readFile(migrationUrl, "utf8");

test("bank_accountsを銀行RPCより前に作成する", async () => {
  const sql = await readMigration();

  assert.match(sql, /create table if not exists public\.bank_accounts/i);
  assert.match(sql, /user_id uuid not null references public\.users \(id\) on delete cascade/i);
  assert.match(sql, /create unique index if not exists bank_accounts_user_id_unique/i);
});

test("既存ユーザーの不足口座を補完する", async () => {
  const sql = await readMigration();

  assert.match(sql, /insert into public\.bank_accounts \(user_id\)[\s\S]*select users\.id/i);
  assert.match(sql, /where not exists[\s\S]*bank_accounts\.user_id = users\.id/i);
});

test("新規ユーザー作成時に銀行口座を自動作成する", async () => {
  const sql = await readMigration();

  assert.match(sql, /create or replace function public\.create_bank_account_for_new_user\(\)/i);
  assert.match(sql, /after insert on public\.users/i);
  assert.match(sql, /on conflict \(user_id\) do nothing/i);
});

test("残高と金利にDB制約を設定する", async () => {
  const sql = await readMigration();

  assert.match(sql, /check \(deposit_balance >= 0\)/i);
  assert.match(sql, /check \(loan_balance >= 0\)/i);
  assert.match(sql, /check \(interest_rate >= 0 and interest_rate <= 1\)/i);
  assert.match(sql, /check \(loan_rate >= 0 and loan_rate <= 1\)/i);
});

