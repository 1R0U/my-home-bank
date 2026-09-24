import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260924010000_create_interest_loans.sql", import.meta.url);
const sql = await readFile(migrationUrl, "utf8");

test("ローン契約と返済明細を追加しRLSを有効にする", () => {
  assert.match(sql, /create table public\.loans/i);
  assert.match(sql, /create table public\.loan_repayments/i);
  assert.match(sql, /alter table public\.loans enable row level security/i);
  assert.match(sql, /create policy loans_select_own_or_parent/i);
});

test("申請時の金利・期限をローンへスナップショットする", () => {
  assert.match(sql, /v_offer\.monthly_interest_rate, v_offer\.term_days/i);
  assert.match(sql, /ceil\([\s\S]*v_loan\.requested_amount[\s\S]*v_loan\.monthly_interest_rate[\s\S]*v_loan\.term_days/i);
  assert.doesNotMatch(sql, /monthly_interest_rate = v_account\.loan_rate/i);
});

test("貸出と返済をギルド金庫台帳へ別種別で記録する", () => {
  assert.match(sql, /'loan_disburse'/i);
  assert.match(sql, /'loan_repay_principal'/i);
  assert.match(sql, /'loan_interest'/i);
  assert.match(sql, /private\.transfer_treasury_wallet/i);
});

test("承認と返済で対象ローンをロックし冪等キーを検証する", () => {
  const locks = sql.match(/from public\.loans where id = p_loan_id for update/gi) ?? [];
  assert.ok(locks.length >= 3);
  assert.match(sql, /request_idempotency_key text not null unique/i);
  assert.match(sql, /idempotency_key text not null unique/i);
  assert.match(sql, /on conflict \(request_idempotency_key\) do nothing[\s\S]*returning id into v_loan_id/i);
  assert.match(sql, /from public\.users where id = p_borrower_id[\s\S]*for update;[\s\S]*承認待ちのローン申請があります/i);
  assert.match(sql, /perform 1 from public\.users where id = v_loan\.borrower_id for update;[\s\S]*from public\.bank_accounts[\s\S]*for update/i);
});

test("旧ローン残高がある環境では推測移行せず適用を止める", () => {
  assert.match(sql, /where loan_balance <> 0[\s\S]*旧ローン残高があるため金利付きローンへ移行できません/i);
  assert.doesNotMatch(sql, /legacy-loan:/i);
});

test("月利を小数6桁に揃えて保存する", () => {
  assert.match(sql, /alter column loan_rate type numeric\(7, 6\)/i);
  assert.match(sql, /loan_rate = round\(p_monthly_interest_rate, 6\)/i);
});

test("最低準備金・個人限度額・延滞を検証する", () => {
  assert.match(sql, /minimum_reserve_rate/i);
  assert.match(sql, /v_account\.loan_limit - v_account\.loan_balance/i);
  assert.match(sql, /延滞中のローンがあるため新しく申請できません/i);
});

test("旧直接借入・返済RPCをauthenticatedから剥奪する", () => {
  assert.match(sql, /revoke execute on function public\.bank_borrow\(uuid, numeric\) from authenticated/i);
  assert.match(sql, /revoke execute on function public\.bank_repay\(uuid, numeric\) from authenticated/i);
});
