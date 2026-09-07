-- Issue #134: 子供用銀行で預入・引き出し・借り入れ・返済の金額を指定して実行できるようにする
--
-- 20260904000000_connect_bank.sql の時点では、預入・引き出し・返済は「お財布↔銀行預金の
-- 振替、または負債の解消であり、家庭内通貨の総量が変わらない」という理由で取引履歴へ記帳
-- していなかった。しかしIssue #134の完了条件は「各操作を取引履歴へ記録し、操作種別と金額を
-- 確認できるようにする」ことを明示的に求めているため、bank_loanと同様に4操作すべてを記帳する
-- 方針に変更する。金額の符号は、bank_loan既存分と同じく「お財布残高がどちらに動くか」に
-- 合わせる（預入・返済はお財布が減るため負、引き出しはお財布が増えるため正）。
--
-- 借入上限の検証、および auth.uid() によるユーザー本人確認（他ユーザーの口座を操作できない
-- ようにする要件）は本マイグレーションの対象外。別Issueで対応する。

-- 1. type チェック制約に bank_deposit / bank_withdraw / bank_repay を追加する
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (
    type in (
      'quest_reward', 'store_purchase', 'bank_interest', 'bank_loan',
      'bank_deposit', 'bank_withdraw', 'bank_repay'
    )
  );

-- 2. 預入: お財布の残高を減らし、銀行預金を増やす（bank_depositとして記帳）
create or replace function bank_deposit(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception '預入額は0より大きい金額を指定してください';
  end if;
  if p_amount <> trunc(p_amount) then
    raise exception '預入額は整数で指定してください';
  end if;

  select balance into v_balance from users where id = p_user_id for update;
  if not found then
    raise exception 'user not found: %', p_user_id;
  end if;
  if v_balance < p_amount then
    raise exception '所持金が不足しています（所持金: %, 預入額: %）', v_balance, p_amount;
  end if;

  -- ロック順序: users(上でロック済み) → bank_accounts
  perform 1 from bank_accounts where user_id = p_user_id for update;
  if not found then
    raise exception 'bank account not found for user: %', p_user_id;
  end if;

  update users set balance = balance - p_amount where id = p_user_id;
  update bank_accounts
    set deposit_balance = deposit_balance + p_amount, updated_at = now()
    where user_id = p_user_id;

  insert into transactions (user_id, type, description, amount)
  values (p_user_id, 'bank_deposit', '銀行への預入', -p_amount::integer);
end;
$$;

-- 3. 引き出し: 銀行預金を減らし、お財布の残高を増やす（bank_withdrawとして記帳）
create or replace function bank_withdraw(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deposit numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception '引き出し額は0より大きい金額を指定してください';
  end if;
  if p_amount <> trunc(p_amount) then
    raise exception '引き出し額は整数で指定してください';
  end if;

  -- ロック順序を統一: users → bank_accounts
  perform 1 from users where id = p_user_id for update;
  if not found then
    raise exception 'user not found: %', p_user_id;
  end if;

  select deposit_balance into v_deposit from bank_accounts where user_id = p_user_id for update;
  if not found then
    raise exception 'bank account not found for user: %', p_user_id;
  end if;
  if v_deposit < p_amount then
    raise exception '預金残高が不足しています（預金残高: %, 引き出し額: %）', v_deposit, p_amount;
  end if;

  update users set balance = balance + p_amount where id = p_user_id;
  update bank_accounts
    set deposit_balance = deposit_balance - p_amount, updated_at = now()
    where user_id = p_user_id;

  insert into transactions (user_id, type, description, amount)
  values (p_user_id, 'bank_withdraw', '銀行からの引き出し', p_amount::integer);
end;
$$;

-- 4. 返済: お財布の残高を減らし、借入残高を減らす（bank_repayとして記帳）
create or replace function bank_repay(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_loan numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception '返済額は0より大きい金額を指定してください';
  end if;
  if p_amount <> trunc(p_amount) then
    raise exception '返済額は整数で指定してください';
  end if;

  select balance into v_balance from users where id = p_user_id for update;
  if not found then
    raise exception 'user not found: %', p_user_id;
  end if;
  if v_balance < p_amount then
    raise exception '所持金が不足しています（所持金: %, 返済額: %）', v_balance, p_amount;
  end if;

  select loan_balance into v_loan from bank_accounts where user_id = p_user_id for update;
  if not found then
    raise exception 'bank account not found for user: %', p_user_id;
  end if;
  if v_loan < p_amount then
    raise exception '返済額が借入残高を超えています（借入残高: %, 返済額: %）', v_loan, p_amount;
  end if;

  update users set balance = balance - p_amount where id = p_user_id;
  update bank_accounts
    set loan_balance = loan_balance - p_amount, updated_at = now()
    where user_id = p_user_id;

  insert into transactions (user_id, type, description, amount)
  values (p_user_id, 'bank_repay', '銀行への返済', -p_amount::integer);
end;
$$;
