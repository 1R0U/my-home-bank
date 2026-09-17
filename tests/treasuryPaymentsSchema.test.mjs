import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260917000200_connect_treasury_payments.sql",
  import.meta.url,
);
const readMigration = () => readFile(migrationUrl, "utf8");

test("ストア商品は家庭・DB価格・在庫を持つ", async () => {
  const sql = await readMigration();
  assert.match(sql, /create table if not exists public\.store_items/i);
  assert.match(sql, /family_id uuid not null references public\.families/i);
  assert.match(sql, /price bigint not null check \(price > 0/i);
  assert.match(sql, /stock bigint not null default 0 check \(stock >= 0/i);
  assert.match(sql, /alter table public\.store_items enable row level security/i);
  assert.match(sql, /using \(family_id = public\.current_user_family_id\(\)\)/i);
});

test("クエスト承認はギルド金庫からWalletへ報酬を移動する", async () => {
  const sql = await readMigration();
  const approveFunction = sql.slice(
    sql.indexOf("create or replace function public.approve_quest_log"),
    sql.indexOf("create or replace function public.purchase_store_item"),
  );

  assert.match(approveFunction, /private\.transfer_treasury_wallet/i);
  assert.match(approveFunction, /'treasury_to_wallet'/i);
  assert.match(approveFunction, /'quest_reward'/i);
  assert.match(approveFunction, /v_recipient_family_id is distinct from v_approver_family_id/i);
  assert.match(approveFunction, /v_approver_role <> 'parent'/i);
  assert.match(approveFunction, /insert into public\.transactions/i);
});

test("ストア購入はDB価格でWalletから金庫へ移動し在庫を減らす", async () => {
  const sql = await readMigration();
  const purchaseFunction = sql.slice(
    sql.indexOf("create or replace function public.purchase_store_item"),
  );

  assert.match(purchaseFunction, /from public\.store_items[\s\S]*for update/i);
  assert.match(purchaseFunction, /private\.transfer_treasury_wallet/i);
  assert.match(purchaseFunction, /v_item\.price/i);
  assert.match(purchaseFunction, /'wallet_to_treasury'/i);
  assert.match(purchaseFunction, /'store_purchase'/i);
  assert.match(purchaseFunction, /set stock = stock - 1/i);
  assert.doesNotMatch(purchaseFunction, /p_amount/i);
});

test("購入の再送は資金移動前に冪等キーを検証する", async () => {
  const sql = await readMigration();
  const purchaseFunction = sql.slice(
    sql.indexOf("create or replace function public.purchase_store_item"),
  );
  const itemLock = purchaseFunction.search(/from public\.store_items[\s\S]*?for update/i);
  const replayCheck = purchaseFunction.indexOf("where idempotency_key");
  const transfer = purchaseFunction.indexOf("private.transfer_treasury_wallet");
  const stockUpdate = purchaseFunction.indexOf("update public.store_items");

  assert.ok(itemLock >= 0);
  assert.ok(replayCheck > itemLock);
  assert.ok(transfer > replayCheck);
  assert.ok(stockUpdate > transfer);
});

test("画面用取引額も安全な整数範囲へ揃える", async () => {
  const sql = await readMigration();
  assert.match(sql, /alter column amount type bigint/i);
  assert.match(sql, /transactions_amount_safe_nonzero/i);
  assert.match(sql, /abs\(amount\) <= private\.safe_integer_max\(\)/i);
});
